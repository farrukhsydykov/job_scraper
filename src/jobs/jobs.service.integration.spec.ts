import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { CollectedJob } from '../collectors/collector.types';
import {
  EmploymentType,
  CollectionRun,
  CollectionRunJob,
  CollectionRunStatus,
  Job,
  JobSearch,
  JobSource,
  JobStatus,
  SavedSearch,
  WorkplaceType,
} from '../database/entities';
import { JobsService } from './jobs.service';

const describePostgres =
  process.env.RUN_POSTGRES_INTEGRATION === 'true' ? describe : describe.skip;

let dataSource: DataSource;
let jobsService: JobsService;
let search: SavedSearch;

/**
 * Builds a valid source listing for PostgreSQL lifecycle assertions.
 */
const listing = (
  overrides: Partial<CollectedJob> = {},
): CollectedJob => ({
  source: JobSource.LINKEDIN,
  sourceJobId: 'linkedin-1',
  sourceUrl: 'https://www.linkedin.com/jobs/view/1',
  applyUrl: null,
  title: 'Backend Engineer',
  companyName: 'Example GmbH',
  companyUrl: null,
  location: 'Berlin',
  workplaceType: WorkplaceType.UNKNOWN,
  employmentType: EmploymentType.FULL_TIME,
  description: 'Build APIs.',
  publishedAt: null,
  expiresAt: null,
  status: JobStatus.ACTIVE,
  ...overrides,
});

describePostgres('JobsService PostgreSQL integration', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required for PostgreSQL integration tests.');
    }

    dataSource = new DataSource({
      type: 'postgres',
      url: databaseUrl,
      entities: [SavedSearch, CollectionRun, CollectionRunJob, Job, JobSearch],
      synchronize: false,
    });
    await dataSource.initialize();
    jobsService = new JobsService(
      dataSource.getRepository(Job),
      dataSource.getRepository(JobSearch),
      dataSource,
    );
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "collection_run_jobs", "job_searches", "jobs", "collection_runs", "saved_searches" RESTART IDENTITY CASCADE',
    );
    search = await dataSource.getRepository(SavedSearch).save({
      source: JobSource.LINKEDIN,
      keyword: 'backend engineer',
      location: 'Berlin',
      filters: {},
      enabled: true,
      scheduleMinutes: 360,
      lastAttemptedAt: null,
      lastCompletedAt: null,
    });
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('inserts, refreshes, and preserves a listing during partial coverage', async () => {
    await jobsService.persistCollection(search, new Date(), [listing()], false);
    await jobsService.persistCollection(
      search,
      new Date(),
      [listing({ title: 'Senior Backend Engineer' })],
      false,
    );
    await jobsService.persistCollection(search, new Date(), [], false);

    const job = await dataSource.getRepository(Job).findOneByOrFail({
      source: JobSource.LINKEDIN,
      sourceJobId: 'linkedin-1',
    });
    const jobSearch = await dataSource.getRepository(JobSearch).findOneByOrFail({
      savedSearchId: search.id,
      jobId: job.id,
    });

    expect(job.title).toBe('Senior Backend Engineer');
    expect(job.status).toBe(JobStatus.ACTIVE);
    expect(jobSearch.isAvailable).toBe(true);
  });

  it('associates discovered jobs with their collection run', async () => {
    const run = await dataSource.getRepository(CollectionRun).save({
      savedSearchId: search.id,
      source: JobSource.LINKEDIN,
      status: CollectionRunStatus.RUNNING,
      coverageComplete: false,
      foundCount: 0,
      upsertedCount: 0,
      requestedCount: 10,
      runWindowMinutes: 5,
      progressCount: 0,
      errorMessage: null,
      collectionProvider: null,
      externalActorId: null,
      externalRunId: null,
      finishedAt: null,
    });

    await jobsService.persistCollection(
      search,
      new Date(),
      [listing()],
      false,
      run.id,
    );

    const job = await dataSource.getRepository(Job).findOneByOrFail({
      source: JobSource.LINKEDIN,
      sourceJobId: 'linkedin-1',
    });
    const runJob = await dataSource
      .getRepository(CollectionRunJob)
      .findOneByOrFail({ runId: run.id, jobId: job.id });
    const loadedRun = await dataSource
      .getRepository(CollectionRun)
      .findOneOrFail({
        where: { id: run.id },
        relations: { savedSearch: true, runJobs: { job: true } },
      });

    expect(runJob.foundOrder).toBe(0);
    expect(loadedRun.runJobs[0]?.job.title).toBe('Backend Engineer');
  });

  it('marks missing listings unavailable only after complete coverage', async () => {
    await jobsService.persistCollection(search, new Date(), [listing()], false);
    await jobsService.persistCollection(
      search,
      new Date('2099-01-01T00:00:00Z'),
      [],
      true,
    );

    const job = await dataSource.getRepository(Job).findOneByOrFail({
      source: JobSource.LINKEDIN,
      sourceJobId: 'linkedin-1',
    });
    const jobSearch = await dataSource.getRepository(JobSearch).findOneByOrFail({
      savedSearchId: search.id,
      jobId: job.id,
    });

    expect(job.status).toBe(JobStatus.UNAVAILABLE);
    expect(jobSearch.isAvailable).toBe(false);
  });

  it('closes an observed listing whose absolute expiry is in the past', async () => {
    await jobsService.persistCollection(
      search,
      new Date(),
      [listing({ expiresAt: new Date('2020-01-01T00:00:00Z') })],
      false,
    );

    const job = await dataSource.getRepository(Job).findOneByOrFail({
      source: JobSource.LINKEDIN,
      sourceJobId: 'linkedin-1',
    });

    expect(job.status).toBe(JobStatus.CLOSED);
  });

  it('returns stable cursors for forward and backward page navigation', async () => {
    const jobs = Array.from({ length: 51 }, (_, index) => {
      const lastSeenAt = new Date(
        Date.parse('2026-08-25T12:00:00Z') - index * 1000,
      );

      return {
        source: JobSource.LINKEDIN,
        sourceJobId: `linkedin-page-${index}`,
        sourceUrl: `https://www.linkedin.com/jobs/view/page-${index}`,
        applyUrl: null,
        title: `Page job ${index}`,
        companyName: 'Example GmbH',
        companyUrl: null,
        location: 'Berlin',
        workplaceType: WorkplaceType.UNKNOWN,
        employmentType: EmploymentType.FULL_TIME,
        description: 'Build APIs.',
        publishedAt: null,
        expiresAt: null,
        status: JobStatus.ACTIVE,
        dataHash: `hash-${index}`,
        firstSeenAt: lastSeenAt,
        lastSeenAt,
      };
    });
    await dataSource.getRepository(Job).save(jobs);

    const firstPage = await jobsService.list({ limit: 25 });
    const numberedSecondPage = await jobsService.list({
      limit: 25,
      page: 2,
    });
    const secondPage = await jobsService.list({
      limit: 25,
      cursor: firstPage.nextCursor ?? undefined,
    });
    const thirdPage = await jobsService.list({
      limit: 25,
      cursor: secondPage.nextCursor ?? undefined,
    });

    expect(firstPage.jobs).toHaveLength(25);
    expect(firstPage.totalCount).toBe(51);
    expect(firstPage.totalPages).toBe(3);
    expect(firstPage.currentPage).toBe(1);
    expect(firstPage.previousCursor).toBeNull();
    expect(numberedSecondPage.jobs.map(({ id }) => id)).toEqual(
      secondPage.jobs.map(({ id }) => id),
    );
    expect(numberedSecondPage.currentPage).toBe(2);
    expect(secondPage.jobs).toHaveLength(25);
    expect(secondPage.currentPage).toBeNull();
    expect(secondPage.previousCursor).toBeNull();
    expect(thirdPage.jobs).toHaveLength(1);
    expect(thirdPage.previousCursor).toBeTruthy();

    const returnedSecondPage = await jobsService.list({
      limit: 25,
      cursor: thirdPage.previousCursor ?? undefined,
    });
    expect(returnedSecondPage.jobs.map(({ id }) => id)).toEqual(
      secondPage.jobs.map(({ id }) => id),
    );
  });
});
