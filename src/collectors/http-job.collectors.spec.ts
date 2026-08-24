import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { JobSource, SavedSearch } from '../database/entities';
import { CollectionBlockedError } from './collector.types';
import {
  LinkedInJobCollector,
  XingJobCollector,
} from './http-job.collectors';

/**
 * Builds a ConfigService-like object from environment values.
 */
const createConfig = (overrides: Record<string, string> = {}): ConfigService => {
  const values: Record<string, string> = {
    COLLECTION_ENABLED: 'true',
    LINKEDIN_COLLECTION_ENABLED: 'true',
    XING_COLLECTION_ENABLED: 'true',
    COLLECTION_MODE: 'fixture',
    SOURCE_MAX_PAGES: '1',
    SOURCE_REQUEST_TIMEOUT_MS: '1000',
    SOURCE_REQUEST_DELAY_MS: '0',
    ...overrides,
  };

  return {
    get: (key: string, defaultValue?: string) => values[key] ?? defaultValue,
  } as ConfigService;
};

/**
 * Returns a saved search stub for collector tests.
 */
const createSearch = (source: JobSource): SavedSearch =>
  ({
    id: 1,
    source,
    keyword: 'backend',
    location: 'Berlin',
    enabled: true,
  }) as SavedSearch;

describe('http job collectors', () => {
  it('collects LinkedIn fixture listings without HTTP', async () => {
    const collector = new LinkedInJobCollector(createConfig());
    const result = await collector.collect(createSearch(JobSource.LINKEDIN));

    expect(result.coverageComplete).toBe(true);
    expect(result.jobs.map((job) => job.title)).toEqual([
      'Senior Backend Engineer',
      'Platform Engineer',
    ]);
    expect(result.jobs[0]?.sourceJobId).toBe('123456789');
  });

  it('collects XING fixture listings without HTTP', async () => {
    const collector = new XingJobCollector(createConfig());
    const result = await collector.collect(createSearch(JobSource.XING));

    expect(result.coverageComplete).toBe(true);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({
      title: 'Data Engineer',
      sourceJobId: '42',
      companyName: 'Example AG',
    });
  });

  it('blocks collection when the source flags are off', async () => {
    const collector = new LinkedInJobCollector(
      createConfig({
        COLLECTION_ENABLED: 'false',
        LINKEDIN_COLLECTION_ENABLED: 'true',
      }),
    );

    await expect(
      collector.collect(createSearch(JobSource.LINKEDIN)),
    ).rejects.toBeInstanceOf(CollectionBlockedError);
  });
});
