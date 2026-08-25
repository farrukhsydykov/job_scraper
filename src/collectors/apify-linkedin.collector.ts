import { Injectable } from '@nestjs/common';
import { JobSource, SavedSearch } from '../database/entities';
import { CollectionOptions, CollectionResult } from './collector.types';
import { ApifyCollectorBase } from './apify-collector.base';
import { buildLinkedInActorInput } from './apify-inputs';
import { mapDatasetItems, mapLinkedInItem } from './apify-mappers';

/**
 * Collects bounded LinkedIn results exclusively through the configured Apify Actor.
 */
@Injectable()
export class ApifyLinkedInCollector extends ApifyCollectorBase {
  readonly source = JobSource.LINKEDIN;

  /**
   * Runs the configured Actor and normalizes every page of its dataset.
   */
  async collect(
    search: SavedSearch,
    options?: CollectionOptions,
  ): Promise<CollectionResult> {
    const settings = this.getSettings(search, options);
    const run = await this.client.callActor(
      settings.actorId,
      buildLinkedInActorInput(search, settings.maxResults, settings.actorId),
      settings.timeoutSecs,
    );
    const mapped = mapDatasetItems(
      await this.readDataset(run, settings),
      mapLinkedInItem,
    );

    return {
      jobs: mapped.jobs,
      coverageComplete: false,
      provenance: {
        provider: 'apify',
        actorId: settings.actorId,
        externalRunId: run.id,
      },
      skippedCount: mapped.skippedCount,
    };
  }
}
