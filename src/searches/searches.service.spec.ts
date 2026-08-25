import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { JobSource, SavedSearch } from '../database/entities';
import { SearchesService } from './searches.service';

const savedSearch = {
  id: 1,
  source: JobSource.LINKEDIN,
  keyword: 'backend engineer',
  location: null,
  filters: {},
  enabled: true,
  archivedAt: null,
  scheduleMinutes: 360,
  resultLimit: 10,
  runWindowMinutes: 5,
  requestDelaySeconds: 0,
  requestJitterSeconds: 0,
} as SavedSearch;

describe('SearchesService filters', () => {
  it('rejects unapproved filters before saving a search', async () => {
    const repository = {
      create: vi.fn(),
      save: vi.fn(),
    };
    const service = new SearchesService(repository as never);

    await expect(
      service.create({
        source: JobSource.LINKEDIN,
        keyword: 'backend engineer',
        filters: { startUrls: ['https://example.test'] },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('validates filters again when an existing search is updated', async () => {
    const repository = {
      findOneBy: vi.fn().mockResolvedValue(savedSearch),
      save: vi.fn(),
    };
    const service = new SearchesService(repository as never);

    await expect(
      service.update(savedSearch.id, { filters: { mode: 'companyProfiles' } }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('persists bounded collection controls for a new search', async () => {
    const repository = {
      create: vi.fn((values) => values),
      save: vi.fn(async (value) => value),
    };
    const service = new SearchesService(repository as never);

    await service.create({
      source: JobSource.LINKEDIN,
      keyword: ' platform engineer ',
      location: ' Berlin ',
      scheduleMinutes: 120,
      resultLimit: 25,
      runWindowMinutes: 4,
      requestDelaySeconds: 60,
      requestJitterSeconds: 17,
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        keyword: 'platform engineer',
        location: 'Berlin',
        resultLimit: 25,
        runWindowMinutes: 4,
        requestDelaySeconds: 60,
        requestJitterSeconds: 17,
      }),
    );
  });

  it('resets source-specific filters when changing source in the dashboard', async () => {
    const existing = {
      ...savedSearch,
      filters: { experience: 'Mid-Senior' },
    };
    const repository = {
      findOneBy: vi.fn().mockResolvedValue(existing),
      save: vi.fn(async (value) => value),
    };
    const service = new SearchesService(repository as never);

    await service.update(existing.id, { source: JobSource.XING });

    expect(existing).toMatchObject({
      source: JobSource.XING,
      filters: {},
    });
  });

  it('rejects jitter that could exceed the configured pacing envelope', async () => {
    const repository = {
      create: vi.fn(),
      save: vi.fn(),
    };
    const service = new SearchesService(repository as never);

    await expect(
      service.create({
        source: JobSource.XING,
        keyword: 'designer',
        requestDelaySeconds: 10,
        requestJitterSeconds: 11,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('archives a search and pauses it', async () => {
    const existing = { ...savedSearch };
    const repository = {
      findOneBy: vi.fn().mockResolvedValue(existing),
      save: vi.fn(async (value) => value),
    };
    const service = new SearchesService(repository as never);

    const result = await service.archive(existing.id);

    expect(result).toMatchObject({ enabled: false });
    expect(result.archivedAt).toBeInstanceOf(Date);
  });

  it('restores an archived search without enabling it', async () => {
    const existing = { ...savedSearch, archivedAt: new Date() };
    const repository = {
      findOneBy: vi.fn().mockResolvedValue(existing),
      save: vi.fn(async (value) => value),
    };
    const service = new SearchesService(repository as never);

    const result = await service.restore(existing.id);

    expect(result).toMatchObject({ archivedAt: null, enabled: false });
  });

  it('only permanently deletes archived searches', async () => {
    const remove = vi.fn();
    const repository = {
      findOneBy: vi.fn().mockResolvedValue({ ...savedSearch, archivedAt: null }),
      remove,
    };
    const service = new SearchesService(repository as never);

    await expect(service.deleteArchived(savedSearch.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(remove).not.toHaveBeenCalled();

    const archived = { ...savedSearch, archivedAt: new Date() };
    repository.findOneBy.mockResolvedValue(archived);
    await service.deleteArchived(savedSearch.id);
    expect(remove).toHaveBeenCalledWith(archived);
  });
});
