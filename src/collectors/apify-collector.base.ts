import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobSource, SavedSearch } from '../database/entities';
import {
  CollectionBlockedError,
  CollectionOptions,
  CollectionResult,
  JobCollector,
} from './collector.types';
import {
  APIFY_CLIENT_PORT,
  ApifyActorRun,
  ApifyClientPort,
} from './apify-client.service';

const ACTOR_MAX_RESULTS = 100;
const ACTOR_MAX_TIMEOUT_SECS = 900;
const DATASET_PAGE_SIZE = 25;

export type ApifyCollectorSettings = {
  actorId: string;
  maxResults: number;
  timeoutSecs: number;
  requestDelaySeconds: number;
  requestJitterSeconds: number;
  deadlineAt: Date;
};

/**
 * Shares Apify configuration gates and dataset pagination across sources.
 */
export abstract class ApifyCollectorBase implements JobCollector {
  abstract readonly source: JobSource;

  /**
   * Creates a collector using application configuration and the local client port.
   */
  constructor(
    protected readonly config: ConfigService,
    @Inject(APIFY_CLIENT_PORT)
    protected readonly client: ApifyClientPort,
  ) {}

  /**
   * Collects a bounded, source-specific result set.
   */
  abstract collect(
    search: SavedSearch,
    options?: CollectionOptions,
  ): Promise<CollectionResult>;

  /**
   * Validates configuration before an Actor or dataset request is attempted.
   */
  protected getSettings(
    search: SavedSearch,
    options?: CollectionOptions,
  ): ApifyCollectorSettings {
    const sourceName = this.source.toUpperCase();
    const globallyEnabled =
      this.config.get<string>('COLLECTION_ENABLED', 'false') === 'true';
    const sourceEnabled =
      this.config.get<string>(`APIFY_${sourceName}_ENABLED`, 'false') ===
      'true';
    const token = this.config.get<string>('APIFY_TOKEN', '').trim();
    const actorId = this.config
      .get<string>(
        `APIFY_${sourceName}_ACTOR_ID`,
        this.defaultActorId(),
      )
      .trim();
    const configuredMaxResults = this.readInteger(
      `APIFY_${sourceName}_MAX_RESULTS`,
      10,
    );
    const requestedResults = search.resultLimit ?? 10;
    const runWindowMinutes = search.runWindowMinutes ?? 5;
    const requestDelaySeconds = search.requestDelaySeconds ?? 0;
    const requestJitterSeconds = search.requestJitterSeconds ?? 0;
    const deadlineAt =
      options?.deadlineAt ??
      new Date(Date.now() + runWindowMinutes * 60 * 1_000);
    const remainingSeconds = Math.ceil(
      (deadlineAt.getTime() - Date.now()) / 1_000,
    );
    const configuredTimeoutSecs = this.readInteger(
      'APIFY_ACTOR_TIMEOUT_SECS',
      300,
    );

    if (!globallyEnabled || !sourceEnabled) {
      throw new CollectionBlockedError(
        `${this.source} collection is disabled until Apify is explicitly enabled.`,
      );
    }
    if (!token) {
      throw new CollectionBlockedError(
        `${this.source} collection requires an Apify token.`,
      );
    }
    if (!actorId || actorId.length > 255 || /\s/.test(actorId)) {
      throw new CollectionBlockedError(
        `${this.source} collection has an invalid Apify Actor ID.`,
      );
    }
    if (
      !this.isValidResultLimit(configuredMaxResults) ||
      !this.isValidResultLimit(requestedResults) ||
      requestedResults > configuredMaxResults!
    ) {
      throw new CollectionBlockedError(
        `${this.source} collection has an invalid or uncapped result limit.`,
      );
    }
    if (
      !Number.isInteger(runWindowMinutes) ||
      runWindowMinutes < 1 ||
      runWindowMinutes > 15
    ) {
      throw new CollectionBlockedError(
        `${this.source} collection has an invalid run window.`,
      );
    }
    if (
      !Number.isInteger(requestDelaySeconds) ||
      requestDelaySeconds < 0 ||
      requestDelaySeconds > 300 ||
      !Number.isInteger(requestJitterSeconds) ||
      requestJitterSeconds < 0 ||
      requestJitterSeconds > requestDelaySeconds ||
      requestDelaySeconds + requestJitterSeconds > 600
    ) {
      throw new CollectionBlockedError(
        `${this.source} collection has invalid request pacing.`,
      );
    }
    if (remainingSeconds < 1) {
      throw new CollectionBlockedError(
        `${this.source} collection exceeded its configured run window.`,
      );
    }
    if (
      configuredTimeoutSecs === null ||
      configuredTimeoutSecs < 1 ||
      configuredTimeoutSecs > ACTOR_MAX_TIMEOUT_SECS
    ) {
      throw new CollectionBlockedError(
        `${this.source} collection has an invalid Actor timeout.`,
      );
    }

    return {
      actorId,
      maxResults: requestedResults,
      timeoutSecs: Math.min(configuredTimeoutSecs, remainingSeconds),
      requestDelaySeconds,
      requestJitterSeconds,
      deadlineAt,
    };
  }

  /**
   * Reads all fixed-size dataset pages from a completed Actor run.
   */
  protected async readDataset(
    run: ApifyActorRun,
    settings: ApifyCollectorSettings,
  ): Promise<unknown[]> {
    if (!run.defaultDatasetId) {
      throw new Error('Apify Actor run did not provide a default dataset.');
    }

    const items: unknown[] = [];
    let offset = 0;

    while (true) {
      if (offset > 0) {
        await this.waitBetweenRequests(settings);
      }
      this.ensureWithinDeadline(settings.deadlineAt);
      const page = await this.client.listDatasetItems(
        run.defaultDatasetId,
        offset,
        DATASET_PAGE_SIZE,
      );
      items.push(...page.slice(0, settings.maxResults - items.length));
      offset += page.length;

      if (
        items.length >= settings.maxResults ||
        page.length < DATASET_PAGE_SIZE
      ) {
        return items.slice(0, settings.maxResults);
      }
    }
  }

  /**
   * Returns the approved default Actor ID for this source.
   */
  protected defaultActorId(): string {
    return this.source === JobSource.LINKEDIN
      ? 'worldunboxer/rapid-linkedin-scraper'
      : 'blackfalcondata/xing-scraper';
  }

  /**
   * Checks whether a source-specific configured result cap is safe.
   */
  private isValidResultLimit(value: number | null): value is number {
    if (value === null || !Number.isInteger(value) || value > ACTOR_MAX_RESULTS) {
      return false;
    }

    return this.source === JobSource.LINKEDIN ? value >= 10 : value >= 1;
  }

  /**
   * Waits for the configured bounded delay before another dataset request.
   */
  private async waitBetweenRequests(
    settings: ApifyCollectorSettings,
  ): Promise<void> {
    const signedJitter =
      settings.requestJitterSeconds > 0
        ? (Math.random() * 2 - 1) * settings.requestJitterSeconds
        : 0;
    const delayMs = Math.max(
      0,
      Math.round((settings.requestDelaySeconds + signedJitter) * 1_000),
    );
    this.ensureWithinDeadline(settings.deadlineAt, delayMs);
    if (delayMs === 0) {
      return;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, delayMs);
    });
    this.ensureWithinDeadline(settings.deadlineAt);
  }

  /**
   * Stops a collection before it can perform work outside its run window.
   */
  private ensureWithinDeadline(deadlineAt: Date, plannedDelayMs = 0): void {
    if (Date.now() + plannedDelayMs >= deadlineAt.getTime()) {
      throw new Error('Collection run exceeded its configured window.');
    }
  }

  /**
   * Parses one environment value as a strict integer or returns null.
   */
  private readInteger(key: string, defaultValue: number): number | null {
    const value = this.config.get<string>(key, String(defaultValue));
    if (!/^-?\d+$/.test(value)) {
      return null;
    }

    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
}
