import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getCollectionEnv } from '../config/collection-env';
import { JobSource, SavedSearch } from '../database/entities';
import { ApifyLinkedInCollector } from './apify-linkedin.collector';
import { ApifyXingCollector } from './apify-xing.collector';
import {
  CollectionOptions,
  CollectionResult,
  JobCollector,
} from './collector.types';

/**
 * Routes each saved search through its single configured source collector.
 */
@Injectable()
export class SourceCollectorsService implements OnModuleInit {
  private readonly collectors: Map<JobSource, JobCollector>;
  private readonly logger = new Logger(SourceCollectorsService.name);

  /**
   * Registers the application’s Apify-only source-specific collectors.
   */
  constructor(
    linkedInCollector: ApifyLinkedInCollector,
    xingCollector: ApifyXingCollector,
    private readonly config: ConfigService,
  ) {
    this.collectors = new Map<JobSource, JobCollector>([
      [linkedInCollector.source, linkedInCollector],
      [xingCollector.source, xingCollector],
    ]);
  }

  /**
   * Logs the non-secret collection configuration loaded at startup.
   */
  onModuleInit(): void {
    const env = getCollectionEnv(this.config);
    this.logger.log(
      `Collection COLLECTION_ENABLED=${env.globallyEnabled} linkedin=${env.linkedInEnabled} xing=${env.xingEnabled}`,
    );
  }

  /**
   * Routes a saved search to the collector for its configured source.
   */
  async collect(
    search: SavedSearch,
    options?: CollectionOptions,
  ): Promise<CollectionResult> {
    const collector = this.collectors.get(search.source);
    if (!collector) {
      throw new Error(`No collector is registered for ${search.source}.`);
    }

    return collector.collect(search, options);
  }
}
