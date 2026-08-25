import { describe, expect, it, vi } from 'vitest';
import { JobSource, SavedSearch } from '../database/entities';
import { RunsScheduler } from './runs.scheduler';

const dueSearches = [
  { id: 1, source: JobSource.LINKEDIN },
  { id: 2, source: JobSource.XING },
] as SavedSearch[];

describe('RunsScheduler', () => {
  it('continues with later due searches after one start fails', async () => {
    const searchesService = {
      findDue: vi.fn().mockResolvedValue(dueSearches),
    };
    const runsService = {
      start: vi
        .fn()
        .mockRejectedValueOnce(new Error('already running'))
        .mockResolvedValueOnce({}),
    };
    const scheduler = new RunsScheduler(
      searchesService as never,
      runsService as never,
    );

    await scheduler.runDueSearches();

    expect(runsService.start).toHaveBeenNthCalledWith(1, 1);
    expect(runsService.start).toHaveBeenNthCalledWith(2, 2);
  });
});
