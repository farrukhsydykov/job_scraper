import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SourceCollectorsService } from '../collectors/source-collectors.service';
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
export class RunsService implements OnModuleInit {
  private readonly runningSearchIds = new Set<number>();
  private readonly logger = new Logger(RunsService.name);

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
   * Marks runs left behind by an earlier process as interrupted failures.
   */
  async onModuleInit(): Promise<void> {
    const runningRuns = await this.collectionRuns.find({
      where: { status: CollectionRunStatus.RUNNING },
    });
    if (!runningRuns.length) {
      return;
    }

    const finishedAt = new Date();
    for (const run of runningRuns) {
      run.status = CollectionRunStatus.FAILED;
      run.finishedAt = finishedAt;
      run.errorMessage = 'The application stopped before this run completed.';
      await this.collectionRuns.save(run);

      const search = await this.searchesService.findById(run.savedSearchId);
      await this.searchesService.recordRunAttempt(search, finishedAt, false);
      this.logger.warn(`Recovered interrupted collection run ${run.id}.`);
    }
  }

  /**
   * Starts one enabled saved search and records its eventual outcome.
   */
  async start(savedSearchId: number): Promise<CollectionRun> {
    if (this.runningSearchIds.has(savedSearchId)) {
      throw new ConflictException('This saved search already has a running job.');
    }

    const savedSearch = await this.searchesService.findById(savedSearchId);
    if (savedSearch.archivedAt) {
      throw new BadRequestException('Restore the saved search before running it.');
    }
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
      relations: { savedSearch: true, runJobs: { job: true } },
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
      relations: { savedSearch: true, runJobs: { job: true } },
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
    const requestedCount = savedSearch.resultLimit ?? 10;
    const runWindowMinutes = savedSearch.runWindowMinutes ?? 5;
    const run = await this.collectionRuns.save(
      this.collectionRuns.create({
        savedSearchId: savedSearch.id,
        source: savedSearch.source,
        status: CollectionRunStatus.RUNNING,
        coverageComplete: false,
        foundCount: 0,
        upsertedCount: 0,
        requestedCount,
        runWindowMinutes,
        progressCount: 0,
        errorMessage: null,
        collectionProvider: null,
        externalActorId: null,
        externalRunId: null,
        finishedAt: null,
      }),
    );
    const deadlineAt = new Date(
      Date.now() + runWindowMinutes * 60 * 1_000,
    );
    this.logger.log(
      `Collection run ${run.id} started for search ${savedSearch.id} (${savedSearch.source}).`,
    );

    try {
      const result = await this.collectorsService.collect(savedSearch, {
        deadlineAt,
      });
      this.ensureWithinDeadline(deadlineAt);
      run.progressCount = result.jobs.length;
      await this.collectionRuns.save(run);
      this.ensureWithinDeadline(deadlineAt);
      const coverageComplete =
        result.coverageComplete && result.skippedCount === 0;
      run.collectionProvider = result.provenance.provider;
      run.externalActorId = result.provenance.actorId;
      run.externalRunId = result.provenance.externalRunId;
      const upsertedCount = await this.jobsService.persistCollection(
        savedSearch,
        run.startedAt,
        result.jobs,
        coverageComplete,
        run.id,
        deadlineAt,
      );
      this.ensureWithinDeadline(deadlineAt);
      const finishedAt = new Date();

      run.status = coverageComplete
        ? CollectionRunStatus.SUCCEEDED
        : CollectionRunStatus.PARTIAL;
      run.coverageComplete = coverageComplete;
      run.foundCount = result.jobs.length;
      run.upsertedCount = upsertedCount;
      run.errorMessage = coverageComplete
        ? null
        : this.partialMessage(result.skippedCount);
      run.finishedAt = finishedAt;
      const completedRun = await this.collectionRuns.save(run);

      await this.searchesService.recordRunAttempt(
        savedSearch,
        finishedAt,
        coverageComplete,
      );
      this.logger.log(
        `Collection run ${run.id} finished for search ${savedSearch.id} (${savedSearch.source}) with ${run.status}: ${run.upsertedCount}/${run.foundCount} jobs; external run ${run.externalRunId ?? '—'}.`,
      );

      return completedRun;
    } catch (error) {
      const finishedAt = new Date();
      run.status = CollectionRunStatus.FAILED;
      run.finishedAt = finishedAt;
      run.errorMessage = this.errorMessage(error);
      const failedRun = await this.collectionRuns.save(run);
      this.logger.error(
        `Collection run ${run.id} failed for search ${savedSearch.id}: ${run.errorMessage}`,
      );

      await this.searchesService.recordRunAttempt(
        savedSearch,
        finishedAt,
        false,
      );

      return failedRun;
    }
  }

  /**
   * Prevents a run from being reported as successful after its time budget.
   */
  private ensureWithinDeadline(deadlineAt: Date): void {
    if (Date.now() >= deadlineAt.getTime()) {
      throw new Error('Collection run exceeded its configured window.');
    }
  }

  /**
   * Converts an unexpected error into a bounded safe run message.
   */
  private errorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : 'Unknown collector error.';
    return message.slice(0, 1_000);
  }

  /**
   * Explains why a collector result cannot change job availability.
   */
  private partialMessage(skippedCount: number): string {
    const malformedRecords =
      skippedCount > 0
        ? ` ${skippedCount} malformed records were skipped.`
        : '';
    return `Coverage was not confirmed; job availability was not changed.${malformedRecords}`;
  }
}
