import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { JobSource, SavedSearch } from '../database/entities';
import {
  ApifyClientPort,
  ApifyActorRun,
} from './apify-client.service';
import { ApifyLinkedInCollector } from './apify-linkedin.collector';
import { ApifyXingCollector } from './apify-xing.collector';
import { CollectionBlockedError } from './collector.types';

const search = {
  id: 1,
  source: JobSource.LINKEDIN,
  keyword: 'backend engineer',
  location: 'Berlin',
  filters: {},
} as SavedSearch;

const linkedInItem = (id: string) => ({
  job_id: id,
  job_url: `https://www.linkedin.com/jobs/view/${id}`,
  job_title: `Backend Engineer ${id}`,
});

const configuration = (
  values: Record<string, string> = {},
): ConfigService =>
  ({
    get: (key: string, defaultValue?: string) =>
      values[key] ?? defaultValue,
  }) as unknown as ConfigService;

const client = () => ({
  callActor: vi.fn<ApifyClientPort['callActor']>(),
  listDatasetItems: vi.fn<ApifyClientPort['listDatasetItems']>(),
});

const enabledConfiguration = (
  values: Record<string, string> = {},
): ConfigService =>
  configuration({
    COLLECTION_ENABLED: 'true',
    APIFY_LINKEDIN_ENABLED: 'true',
    APIFY_TOKEN: 'test-token',
    ...values,
  });

describe('Apify collectors', () => {
  it('blocks disabled or incomplete configuration before any client call', async () => {
    const blockedConfigurations: Record<string, string>[] = [
      {},
      { COLLECTION_ENABLED: 'true' },
      {
        COLLECTION_ENABLED: 'true',
        APIFY_LINKEDIN_ENABLED: 'true',
      },
      {
        COLLECTION_ENABLED: 'true',
        APIFY_LINKEDIN_ENABLED: 'true',
        APIFY_TOKEN: 'test-token',
        APIFY_LINKEDIN_ACTOR_ID: 'invalid actor',
      },
      {
        COLLECTION_ENABLED: 'true',
        APIFY_LINKEDIN_ENABLED: 'true',
        APIFY_TOKEN: 'test-token',
        APIFY_LINKEDIN_MAX_RESULTS: '9',
      },
      {
        COLLECTION_ENABLED: 'true',
        APIFY_LINKEDIN_ENABLED: 'true',
        APIFY_TOKEN: 'test-token',
        APIFY_ACTOR_TIMEOUT_SECS: '0',
      },
    ];

    for (const values of blockedConfigurations) {
      const apifyClient = client();
      const collector = new ApifyLinkedInCollector(
        configuration(values),
        apifyClient,
      );

      await expect(collector.collect(search)).rejects.toBeInstanceOf(
        CollectionBlockedError,
      );
      expect(apifyClient.callActor).not.toHaveBeenCalled();
      expect(apifyClient.listDatasetItems).not.toHaveBeenCalled();
    }
  });

  it('enforces the configured result cap while returning Apify provenance', async () => {
    const apifyClient = client();
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      linkedInItem(String(index + 1)),
    );
    apifyClient.callActor.mockResolvedValue({
      id: 'apify-run-1',
      defaultDatasetId: 'dataset-1',
    } satisfies ApifyActorRun);
    apifyClient.listDatasetItems
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([linkedInItem('101')]);
    const collector = new ApifyLinkedInCollector(
      enabledConfiguration(),
      apifyClient,
    );

    const result = await collector.collect(search);

    expect(result.jobs).toHaveLength(10);
    expect(result.coverageComplete).toBe(false);
    expect(result.skippedCount).toBe(0);
    expect(result.provenance).toEqual({
      provider: 'apify',
      actorId: 'worldunboxer/rapid-linkedin-scraper',
      externalRunId: 'apify-run-1',
    });
    expect(apifyClient.listDatasetItems).toHaveBeenNthCalledWith(
      1,
      'dataset-1',
      0,
      25,
    );
    expect(apifyClient.listDatasetItems).toHaveBeenCalledTimes(1);
  });

  it('reports malformed records and rejects Actor runs without datasets', async () => {
    const apifyClient = client();
    apifyClient.callActor.mockResolvedValue({
      id: 'apify-run-2',
      defaultDatasetId: 'dataset-2',
    } satisfies ApifyActorRun);
    apifyClient.listDatasetItems.mockResolvedValue([
      linkedInItem('1'),
      { job_id: 'missing-url', job_title: 'Missing URL' },
    ]);
    const collector = new ApifyLinkedInCollector(
      enabledConfiguration(),
      apifyClient,
    );

    await expect(collector.collect(search)).resolves.toMatchObject({
      jobs: [expect.objectContaining({ sourceJobId: '1' })],
      skippedCount: 1,
    });

    apifyClient.callActor.mockResolvedValueOnce({
      id: 'apify-run-3',
      defaultDatasetId: null,
    } satisfies ApifyActorRun);
    await expect(collector.collect(search)).rejects.toThrow(
      'default dataset',
    );
  });

  it('waits between bounded dataset pages when pacing is configured', async () => {
    vi.useFakeTimers();
    try {
      const apifyClient = client();
      apifyClient.callActor.mockResolvedValue({
        id: 'apify-run-pace',
        defaultDatasetId: 'dataset-pace',
      } satisfies ApifyActorRun);
      apifyClient.listDatasetItems
        .mockResolvedValueOnce(
          Array.from({ length: 25 }, (_, index) =>
            linkedInItem(String(index + 1)),
          ),
        )
        .mockResolvedValueOnce([linkedInItem('26')]);
      const collector = new ApifyLinkedInCollector(
        enabledConfiguration({ APIFY_LINKEDIN_MAX_RESULTS: '100' }),
        apifyClient,
      );
      const collection = collector.collect({
        ...search,
        resultLimit: 26,
        requestDelaySeconds: 60,
        requestJitterSeconds: 0,
      });

      await vi.advanceTimersByTimeAsync(60_000);
      const result = await collection;

      expect(result.jobs).toHaveLength(26);
      expect(apifyClient.listDatasetItems).toHaveBeenCalledTimes(2);
      expect(apifyClient.listDatasetItems).toHaveBeenNthCalledWith(
        2,
        'dataset-pace',
        25,
        25,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('builds a jobs-only XING request and returns mapped Actor results', async () => {
    const apifyClient = client();
    apifyClient.callActor.mockResolvedValue({
      id: 'apify-xing-run-1',
      defaultDatasetId: 'xing-dataset-1',
    } satisfies ApifyActorRun);
    apifyClient.listDatasetItems.mockResolvedValue([
      {
        xingId: 'xing-1',
        portalUrl: 'https://www.xing.com/jobs/backend-engineer-1',
        title: 'Backend Engineer',
      },
    ]);
    const collector = new ApifyXingCollector(
      configuration({
        COLLECTION_ENABLED: 'true',
        APIFY_XING_ENABLED: 'true',
        APIFY_TOKEN: 'test-token',
      }),
      apifyClient,
    );

    const result = await collector.collect({
      ...search,
      source: JobSource.XING,
      location: null,
    });

    expect(apifyClient.callActor).toHaveBeenCalledWith(
      'blackfalcondata/xing-scraper',
      {
        mode: 'jobs',
        queries: ['backend engineer'],
        locations: [],
        maxResults: 10,
        maxPages: 1,
        includeDetails: true,
        descriptionFormat: 'text',
        excludeEmptyFields: true,
      },
      300,
    );
    expect(result).toMatchObject({
      jobs: [expect.objectContaining({ source: JobSource.XING })],
      provenance: {
        provider: 'apify',
        actorId: 'blackfalcondata/xing-scraper',
        externalRunId: 'apify-xing-run-1',
      },
    });
  });
});
