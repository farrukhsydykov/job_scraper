import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { SearchesService } from '../searches/searches.service';
import { RunsService } from './runs.service';

/**
 * Starts due saved searches serially in the MVP's single application process.
 */
@Injectable()
export class RunsScheduler {
  private readonly logger = new Logger(RunsScheduler.name);

  /**
   * Creates a scheduler backed by saved-search and run services.
   */
  constructor(
    private readonly searchesService: SearchesService,
    private readonly runsService: RunsService,
  ) {}

  /**
   * Checks once per minute for enabled searches whose interval has elapsed.
   */
  @Interval(60_000)
  async runDueSearches(): Promise<void> {
    const searches = await this.searchesService.findDue();

    for (const search of searches) {
      try {
        await this.runsService.start(search.id);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown scheduler error.';
        this.logger.error(
          `Scheduled search ${search.id} failed: ${message.slice(0, 1_000)}`,
        );
      }
    }
  }
}
