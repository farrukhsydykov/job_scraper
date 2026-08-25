import { describe, expect, it, vi } from 'vitest';
import { CollectionResult } from '../collectors/collector.types';
import { CollectionBlockedError } from '../collectors/collector.types';
import {
  CollectionRunStatus,
  JobSource,
  SavedSearch,
} from '../database/entities';
import { RunsService } from './runs.service';

const search = {
  id: 1,
  source: JobSource.LINKEDIN,
  keyword: 'backend engineer',
  location: 'Berlin',
  filters: {},
  enabled: true,
  archivedAt: null,
  resultLimit: 10,
  runWindowMinutes: 5,
  requestDelaySeconds: 0,
  requestJitterSeconds: 0,
} as SavedSearch;

const partialResult = (
  overrides: Partial<CollectionResult> = {},
): CollectionResult => ({
  jobs: [],
  coverageComplete: false,
  provenance: {
    provider: 'apify',
    actorId: 'worldunboxer/rapid-linkedin-scraper',
    externalRunId: 'apify-run-1',
  },
  skippedCount: 0,
  ...overrides,
});

const dependencies = (result: CollectionResult | Error) => {
  const collectionRuns = {
    find: vi.fn().mockResolvedValue([]),
    create: vi.fn((values) => ({
      id: 1,
      startedAt: new Date('2026-08-17T00:00:00Z'),
      ...values,
    })),
    save: vi.fn(async (run) => run),
  };
  const searchesService = {
    findById: vi.fn().mockResolvedValue(search),
    recordRunAttempt: vi.fn().mockResolvedValue(search),
  };
  const collectorsService = {
    collect:
      result instanceof Error
        ? vi.fn().mockRejectedValue(result)
        : vi.fn().mockResolvedValue(result),
  };
  const jobsService = {
    persistCollection: vi.fn().mockResolvedValue(0),
  };

  return {
    collectionRuns,
    searchesService,
    collectorsService,
    jobsService,
    service: new RunsService(
      collectionRuns as never,
      searchesService as never,
      collectorsService as never,
      jobsService as never,
    ),
  };
};

describe('RunsService', () => {
  it('does not run archived searches', async () => {
    const context = dependencies(partialResult());
    context.searchesService.findById.mockResolvedValue({
      ...search,
      archivedAt: new Date(),
    });

    await expect(context.service.start(search.id)).rejects.toThrow(
      'Restore the saved search before running it.',
    );
    expect(context.collectorsService.collect).not.toHaveBeenCalled();
  });

  it('recovers runs left running by a stopped application', async () => {
    const context = dependencies(partialResult());
    const interruptedRun = {
      id: 7,
      savedSearchId: search.id,
      status: CollectionRunStatus.RUNNING,
      finishedAt: null,
      errorMessage: null,
    };
    context.collectionRuns.find.mockResolvedValue([interruptedRun]);

    await context.service.onModuleInit();

    expect(interruptedRun).toMatchObject({
      status: CollectionRunStatus.FAILED,
      errorMessage: 'The application stopped before this run completed.',
    });
    expect(context.searchesService.recordRunAttempt).toHaveBeenCalledWith(
      search,
      expect.any(Date),
      false,
    );
  });

  it('persists Apify provenance and a partial reason without availability changes', async () => {
    const context = dependencies(
      partialResult({ coverageComplete: true, skippedCount: 3 }),
    );

    const run = await context.service.start(search.id);

    expect(run).toMatchObject({
      status: CollectionRunStatus.PARTIAL,
      coverageComplete: false,
      collectionProvider: 'apify',
      externalActorId: 'worldunboxer/rapid-linkedin-scraper',
      externalRunId: 'apify-run-1',
      foundCount: 0,
      upsertedCount: 0,
      errorMessage:
        'Coverage was not confirmed; job availability was not changed. 3 malformed records were skipped.',
    });
    expect(context.jobsService.persistCollection).toHaveBeenCalledWith(
      search,
      expect.any(Date),
      [],
      false,
      1,
      expect.any(Date),
    );
    expect(context.searchesService.recordRunAttempt).toHaveBeenCalledWith(
      search,
      expect.any(Date),
      false,
    );
  });

  it('keeps provenance null and skips persistence when collection is blocked', async () => {
    const context = dependencies(
      new CollectionBlockedError('linkedin collection is disabled.'),
    );

    const run = await context.service.start(search.id);

    expect(run).toMatchObject({
      status: CollectionRunStatus.FAILED,
      coverageComplete: false,
      collectionProvider: null,
      externalActorId: null,
      externalRunId: null,
      errorMessage: 'linkedin collection is disabled.',
    });
    expect(context.jobsService.persistCollection).not.toHaveBeenCalled();
    expect(context.searchesService.recordRunAttempt).toHaveBeenCalledWith(
      search,
      expect.any(Date),
      false,
    );
  });
});
