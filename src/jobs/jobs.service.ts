import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { JobListQueryDto } from '../contracts';
import {
  Job,
  JobSearch,
  JobStatus,
  CollectionRunJob,
  SavedSearch,
} from '../database/entities';
import { CollectedJob } from '../collectors/collector.types';
import { createJobDataHash, isClosedJob } from './job-data';

export type PaginatedJobs = {
  jobs: Job[];
  nextCursor: string | null;
  previousCursor: string | null;
  totalCount: number;
  totalPages: number;
  currentPage: number | null;
};

/**
 * Persists current source listings and exposes filtered job reads.
 */
@Injectable()
export class JobsService {
  /**
   * Creates a jobs service with transaction-capable database access.
   */
  constructor(
    @InjectRepository(Job) private readonly jobs: Repository<Job>,
    @InjectRepository(JobSearch)
    private readonly jobSearches: Repository<JobSearch>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /**
   * Upserts observed listings and updates availability after a complete run.
   */
  async persistCollection(
    search: SavedSearch,
    runStartedAt: Date,
    listings: CollectedJob[],
    coverageComplete: boolean,
    runId?: number,
    deadlineAt?: Date,
  ): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      const jobRepository = manager.getRepository(Job);
      const jobSearchRepository = manager.getRepository(JobSearch);
      const runJobRepository = runId
        ? manager.getRepository(CollectionRunJob)
        : null;
      const observedAt = new Date();
      let upsertedCount = 0;

      for (const [foundOrder, listing] of listings.entries()) {
        this.ensureWithinDeadline(deadlineAt);
        this.validateListing(search, listing);
        const job = await this.upsertJob(
          jobRepository,
          listing,
          observedAt,
        );
        await this.markSearchObservation(
          jobSearchRepository,
          search.id,
          job.id,
          observedAt,
          job.status !== JobStatus.CLOSED,
        );
        if (runJobRepository && runId !== undefined) {
          await this.markRunObservation(
            runJobRepository,
            runId,
            job.id,
            foundOrder,
          );
        }
        upsertedCount += 1;
      }

      if (coverageComplete) {
        this.ensureWithinDeadline(deadlineAt);
        await this.markMissingJobsUnavailable(
          jobRepository,
          jobSearchRepository,
          search.id,
          runStartedAt,
          deadlineAt,
        );
      }

      this.ensureWithinDeadline(deadlineAt);
      return upsertedCount;
    });
  }

  /**
   * Returns a stable-cursor page of jobs for the API or dashboard.
   */
  async list(query: JobListQueryDto): Promise<PaginatedJobs> {
    const limit = query.limit ?? 25;
    const totalCount = await this.createJobsQuery(query).getCount();
    const totalPages = Math.ceil(totalCount / limit);

    if (query.page !== undefined) {
      return this.listByPage(query, limit, totalCount, totalPages);
    }

    const builder = this.createJobsQuery(query)
      .orderBy('job.last_seen_at', 'DESC')
      .addOrderBy('job.id', 'DESC')
      .take(limit + 1);
    this.applyCursor(builder, query.cursor);

    const result = await builder.getMany();
    const hasMore = result.length > limit;
    const jobs = hasMore ? result.slice(0, limit) : result;
    const finalJob = jobs.at(-1);
    const firstJob = jobs.at(0);

    return {
      jobs,
      nextCursor:
        hasMore && finalJob
          ? this.encodeCursor(finalJob.lastSeenAt, finalJob.id)
          : null,
      previousCursor:
        query.cursor && firstJob
          ? await this.findPreviousCursor(query, firstJob, limit)
          : null,
      totalCount,
      totalPages,
      currentPage: query.cursor ? null : 1,
    };
  }

  /**
   * Returns an offset-based page with total result metadata.
   */
  private async listByPage(
    query: JobListQueryDto,
    limit: number,
    totalCount: number,
    totalPages: number,
  ): Promise<PaginatedJobs> {
    const requestedPage = query.page ?? 1;
    const currentPage = totalPages
      ? Math.min(requestedPage, totalPages)
      : 1;
    const jobs = await this.createJobsQuery(query)
      .orderBy('job.last_seen_at', 'DESC')
      .addOrderBy('job.id', 'DESC')
      .skip((currentPage - 1) * limit)
      .take(limit)
      .getMany();

    return {
      jobs,
      nextCursor: null,
      previousCursor: null,
      totalCount,
      totalPages,
      currentPage,
    };
  }

  /**
   * Returns one current job record or a 404 response.
   */
  async findById(id: number): Promise<Job> {
    const job = await this.jobs.findOneBy({ id });
    if (!job) {
      throw new NotFoundException(`Job ${id} was not found.`);
    }

    return job;
  }

  /**
   * Builds the filtered jobs query before cursor and sort conditions are added.
   */
  private createJobsQuery(
    query: JobListQueryDto,
  ): SelectQueryBuilder<Job> {
    const builder = this.jobs.createQueryBuilder('job');

    if (query.source) {
      builder.andWhere('job.source = :source', { source: query.source });
    }

    if (query.status) {
      builder.andWhere('job.status = :status', { status: query.status });
    }

    if (query.location) {
      builder.andWhere('job.location ILIKE :location', {
        location: `%${query.location}%`,
      });
    }

    if (query.workplaceType) {
      builder.andWhere('job.workplace_type = :workplaceType', {
        workplaceType: query.workplaceType,
      });
    }

    if (query.employmentType) {
      builder.andWhere('job.employment_type = :employmentType', {
        employmentType: query.employmentType,
      });
    }

    if (query.publishedAfter) {
      builder.andWhere('job.published_at >= :publishedAfter', {
        publishedAfter: new Date(query.publishedAfter),
      });
    }

    if (query.q) {
      builder.andWhere(
        '(job.title ILIKE :query OR job.company_name ILIKE :query OR job.description ILIKE :query)',
        { query: `%${query.q}%` },
      );
    }

    return builder;
  }

  /**
   * Applies the descending stable cursor boundary to a jobs query.
   */
  private applyCursor(
    builder: SelectQueryBuilder<Job>,
    encodedCursor?: string,
  ): void {
    if (!encodedCursor) {
      return;
    }

    const cursor = this.decodeCursor(encodedCursor);
    builder.andWhere(
      '(job.last_seen_at < :cursorDate OR (job.last_seen_at = :cursorDate AND job.id < :cursorId))',
      { cursorDate: cursor.lastSeenAt, cursorId: cursor.id },
    );
  }

  /**
   * Finds the cursor needed to navigate one page backward.
   */
  private async findPreviousCursor(
    query: JobListQueryDto,
    firstJob: Job,
    limit: number,
  ): Promise<string | null> {
    const previousJobs = await this.createJobsQuery(query)
      .andWhere(
        '(job.last_seen_at > :firstDate OR (job.last_seen_at = :firstDate AND job.id > :firstId))',
        { firstDate: firstJob.lastSeenAt, firstId: firstJob.id },
      )
      .orderBy('job.last_seen_at', 'ASC')
      .addOrderBy('job.id', 'ASC')
      .take(limit + 1)
      .getMany();

    if (previousJobs.length <= limit) {
      return null;
    }

    const previousBoundary = previousJobs.at(-1);
    return previousBoundary
      ? this.encodeCursor(previousBoundary.lastSeenAt, previousBoundary.id)
      : null;
  }

  /**
   * Validates a collector result before it is allowed into the database.
   */
  private validateListing(search: SavedSearch, listing: CollectedJob): void {
    if (listing.source !== search.source) {
      throw new BadRequestException(
        'A collector returned a listing for the wrong source.',
      );
    }

    if (!listing.sourceJobId || !listing.title) {
      throw new BadRequestException(
        'A source listing must include an identifier and title.',
      );
    }

    try {
      const sourceUrl = new URL(listing.sourceUrl);
      if (!['http:', 'https:'].includes(sourceUrl.protocol)) {
        throw new Error('Invalid source URL protocol.');
      }
      if (listing.applyUrl) {
        const applyUrl = new URL(listing.applyUrl);
        if (!['http:', 'https:'].includes(applyUrl.protocol)) {
          throw new Error('Invalid application URL protocol.');
        }
      }
    } catch {
      throw new BadRequestException('A source listing includes an invalid URL.');
    }
  }

  /**
   * Creates or refreshes a single same-source job record.
   */
  private async upsertJob(
    repository: Repository<Job>,
    listing: CollectedJob,
    observedAt: Date,
  ): Promise<Job> {
    const existingJob = await repository.findOneBy({
      source: listing.source,
      sourceJobId: listing.sourceJobId,
    });
    const status = isClosedJob(listing, observedAt)
      ? JobStatus.CLOSED
      : JobStatus.ACTIVE;
    const values = {
      source: listing.source,
      sourceJobId: listing.sourceJobId,
      sourceUrl: listing.sourceUrl,
      applyUrl: listing.applyUrl,
      title: listing.title,
      companyName: listing.companyName,
      companyUrl: listing.companyUrl,
      location: listing.location,
      workplaceType: listing.workplaceType,
      employmentType: listing.employmentType,
      description: listing.description,
      publishedAt: listing.publishedAt,
      expiresAt: listing.expiresAt,
      status,
      dataHash: createJobDataHash({ ...listing, status }),
      lastSeenAt: observedAt,
    };

    if (existingJob) {
      return repository.save(repository.merge(existingJob, values));
    }

    return repository.save(
      repository.create({
        ...values,
        firstSeenAt: observedAt,
      }),
    );
  }

  /**
   * Marks one job as seen by a saved search in the current run.
   */
  private async markSearchObservation(
    repository: Repository<JobSearch>,
    savedSearchId: number,
    jobId: number,
    observedAt: Date,
    isAvailable: boolean,
  ): Promise<void> {
    const existing = await repository.findOneBy({ savedSearchId, jobId });
    if (existing) {
      existing.lastSeenAt = observedAt;
      existing.isAvailable = isAvailable;
      await repository.save(existing);
      return;
    }

    await repository.save(
      repository.create({
        savedSearchId,
        jobId,
        isAvailable,
        lastSeenAt: observedAt,
      }),
    );
  }

  /**
   * Associates one persisted job with the run that discovered it.
   */
  private async markRunObservation(
    repository: Repository<CollectionRunJob>,
    runId: number,
    jobId: number,
    foundOrder: number,
  ): Promise<void> {
    const existing = await repository.findOneBy({ runId, jobId });
    if (existing) {
      existing.foundOrder = foundOrder;
      await repository.save(existing);
      return;
    }

    await repository.save(
      repository.create({
        runId,
        jobId,
        foundOrder,
      }),
    );
  }

  /**
   * Marks links missing from a complete search and closes globally unseen jobs.
   */
  private async markMissingJobsUnavailable(
    jobRepository: Repository<Job>,
    jobSearchRepository: Repository<JobSearch>,
    savedSearchId: number,
    runStartedAt: Date,
    deadlineAt?: Date,
  ): Promise<void> {
    const staleLinks = await jobSearchRepository
      .createQueryBuilder('jobSearch')
      .where('jobSearch.saved_search_id = :savedSearchId', { savedSearchId })
      .andWhere('jobSearch.is_available = true')
      .andWhere('jobSearch.last_seen_at < :runStartedAt', { runStartedAt })
      .getMany();

    if (!staleLinks.length) {
      return;
    }

    for (const link of staleLinks) {
      this.ensureWithinDeadline(deadlineAt);
      link.isAvailable = false;
    }
    await jobSearchRepository.save(staleLinks);

    for (const jobId of new Set(staleLinks.map((link) => link.jobId))) {
      this.ensureWithinDeadline(deadlineAt);
      const activeSearchCount = await jobSearchRepository.countBy({
        jobId,
        isAvailable: true,
      });
      const job = await jobRepository.findOneBy({ id: jobId });

      if (job && activeSearchCount === 0 && job.status !== JobStatus.CLOSED) {
        job.status = JobStatus.UNAVAILABLE;
        await jobRepository.save(job);
      }
    }
  }

  /**
   * Stops persistence before it can continue outside a run's configured window.
   */
  private ensureWithinDeadline(deadlineAt?: Date): void {
    if (deadlineAt && Date.now() >= deadlineAt.getTime()) {
      throw new Error('Collection run exceeded its configured window.');
    }
  }

  /**
   * Encodes the last row's sort keys into an opaque cursor.
   */
  private encodeCursor(lastSeenAt: Date, id: number): string {
    return Buffer.from(`${lastSeenAt.toISOString()}|${id}`).toString('base64url');
  }

  /**
   * Validates and decodes a cursor into its sort keys.
   */
  private decodeCursor(cursor: string): { lastSeenAt: Date; id: number } {
    try {
      const [dateString, idValue] = Buffer.from(cursor, 'base64url')
        .toString()
        .split('|');
      const lastSeenAt = new Date(dateString);
      const id = Number(idValue);

      if (
        !dateString ||
        Number.isNaN(lastSeenAt.getTime()) ||
        !Number.isInteger(id)
      ) {
        throw new Error('Invalid cursor');
      }

      return { lastSeenAt, id };
    } catch {
      throw new BadRequestException('The jobs cursor is invalid.');
    }
  }
}
