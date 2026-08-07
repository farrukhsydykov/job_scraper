import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SourceCollectorsService } from '../collectors/http-job.collectors';
import {
  CollectionRun,
  CollectionRunStatus,
  SavedSearch,
} from '../database/entities';
import { JobsService } from '../jobs/jobs.service';
import { SearchesService } from '../searches/searches.service';

/**
 * Orchestrates manual and scheduled source collection runs.
 */
@Injectable()
export class RunsService {
  private readonly runningSearchIds = new Set<number>();

  /**
   * Creates a run service with collection, search, and job dependencies.
   */
  constructor(
    @InjectRepository(CollectionRun)
    private readonly collectionRuns: Repository<CollectionRun>,
    private readonly searchesService: SearchesService,
    private readonly collectorsService: SourceCollectorsService,
    private readonly jobsService: JobsService,
  ) {}

  /**
   * Starts one enabled saved search and records its eventual outcome.
   */
  async start(savedSearchId: number): Promise<CollectionRun> {
    if (this.runningSearchIds.has(savedSearchId)) {
      throw new ConflictException('This saved search already has a running job.');
    }

    const savedSearch = await this.searchesService.findById(savedSearchId);
    if (!savedSearch.enabled) {
      throw new BadRequestException('Enable the saved search before running it.');
    }

    this.runningSearchIds.add(savedSearchId);
    try {
      return await this.execute(savedSearch);
    } finally {
      this.runningSearchIds.delete(savedSearchId);
    }
  }

  /**
   * Lists recent runs alongside their saved-search configuration.
   */
  async list(): Promise<CollectionRun[]> {
    return this.collectionRuns.find({
      relations: { savedSearch: true },
      order: { startedAt: 'DESC' },
      take: 100,
    });
  }

  /**
   * Returns one run or a 404 response.
   */
  async findById(id: number): Promise<CollectionRun> {
    const run = await this.collectionRuns.findOne({
      where: { id },
      relations: { savedSearch: true },
    });
    if (!run) {
      throw new NotFoundException(`Collection run ${id} was not found.`);
    }

    return run;
  }

  /**
   * Runs a source collector, persists its data, and stores a truthful status.
   */
  private async execute(savedSearch: SavedSearch): Promise<CollectionRun> {
    const run = await this.collectionRuns.save(
      this.collectionRuns.create({
        savedSearchId: savedSearch.id,
        source: savedSearch.source,
        status: CollectionRunStatus.RUNNING,
        coverageComplete: false,
        foundCount: 0,
        upsertedCount: 0,
        errorMessage: null,
        finishedAt: null,
      }),
    );

    try {
      const result = await this.collectorsService.collect(savedSearch);
      const upsertedCount = await this.jobsService.persistCollection(
        savedSearch,
        run.startedAt,
        result.jobs,
        result.coverageComplete,
      );
      const finishedAt = new Date();

      run.status = result.coverageComplete
        ? CollectionRunStatus.SUCCEEDED
        : CollectionRunStatus.PARTIAL;
      run.coverageComplete = result.coverageComplete;
      run.foundCount = result.jobs.length;
      run.upsertedCount = upsertedCount;
      run.errorMessage = result.coverageComplete
        ? null
        : 'The collector did not confirm complete pagination; job availability was not changed.';
      run.finishedAt = finishedAt;
      const completedRun = await this.collectionRuns.save(run);

      await this.searchesService.recordRunAttempt(
        savedSearch,
        finishedAt,
        result.coverageComplete,
      );

      return completedRun;
    } catch (error) {
      const finishedAt = new Date();
      run.status = CollectionRunStatus.FAILED;
      run.finishedAt = finishedAt;
      run.errorMessage = this.errorMessage(error);
      const failedRun = await this.collectionRuns.save(run);

      await this.searchesService.recordRunAttempt(
        savedSearch,
        finishedAt,
        false,
      );

      return failedRun;
    }
  }

  /**
   * Converts an unexpected error into a bounded safe run message.
   */
  private errorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : 'Unknown collector error.';
    return message.slice(0, 1_000);
  }
}
