import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { SearchesService } from '../searches/searches.service';
import { RunsService } from './runs.service';

/**
 * Starts due saved searches serially in the MVP's single application process.
 */
@Injectable()
export class RunsScheduler {
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
      await this.runsService.start(search.id);
    }
  }
}
