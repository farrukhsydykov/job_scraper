import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApifyClient } from 'apify-client';

export type ApifyActorRun = {
  id: string;
  defaultDatasetId: string | null;
};

export interface ApifyClientPort {
  callActor(
    actorId: string,
    input: Record<string, unknown>,
    timeoutSecs: number,
  ): Promise<ApifyActorRun>;
  listDatasetItems(
    datasetId: string,
    offset: number,
    limit: number,
  ): Promise<unknown[]>;
}

export const APIFY_CLIENT_PORT = Symbol('APIFY_CLIENT_PORT');

/**
 * Adapts the official Apify client behind a narrow, mockable application port.
 */
@Injectable()
export class ApifyClientService implements ApifyClientPort {
  private client: ApifyClient | null = null;

  /**
   * Creates an Apify client adapter using environment-backed credentials.
   */
  constructor(private readonly config: ConfigService) {}

  /**
   * Calls one Actor with a bounded run and wait timeout.
   */
  async callActor(
    actorId: string,
    input: Record<string, unknown>,
    timeoutSecs: number,
  ): Promise<ApifyActorRun> {
    try {
      const run = await this.getClient()
        .actor(actorId)
        .call(input, { log: null, timeout: timeoutSecs, waitSecs: timeoutSecs });

      if (run.status === 'TIMED-OUT') {
        throw new Error('Apify Actor timed out.');
      }
      if (run.status !== 'SUCCEEDED') {
        throw new Error('Apify Actor did not complete successfully.');
      }
      if (!run.defaultDatasetId) {
        throw new Error('Apify Actor run did not provide a default dataset.');
      }

      return { id: run.id, defaultDatasetId: run.defaultDatasetId };
    } catch (error) {
      if (
        error instanceof Error &&
        [
          'Apify Actor timed out.',
          'Apify Actor did not complete successfully.',
          'Apify Actor run did not provide a default dataset.',
        ].includes(error.message)
      ) {
        throw error;
      }

      throw new Error('Apify Actor call failed.');
    }
  }

  /**
   * Reads one fixed-size page from an Actor dataset.
   */
  async listDatasetItems(
    datasetId: string,
    offset: number,
    limit: number,
  ): Promise<unknown[]> {
    try {
      const page = await this.getClient()
        .dataset(datasetId)
        .listItems({ limit, offset });

      return page.items;
    } catch {
      throw new Error('Apify dataset read failed.');
    }
  }

  /**
   * Lazily creates the official client after collection gates have passed.
   */
  private getClient(): ApifyClient {
    const token = this.config.get<string>('APIFY_TOKEN', '').trim();
    if (!token) {
      throw new Error('Apify token is unavailable.');
    }

    this.client ??= new ApifyClient({ token });
    return this.client;
  }
}
