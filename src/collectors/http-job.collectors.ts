import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobSource, SavedSearch } from '../database/entities';
import {
  CollectionBlockedError,
  CollectionResult,
  CollectedJob,
  JobCollector,
} from './collector.types';
import {
  extractDetailUrls,
  extractJsonLdJobs,
  hasNextPage,
} from './job-posting.parser';

const COLLECTOR_USER_AGENT = 'job-scraper-mvp/1.0 (authorized job collection)';

/**
 * Collects public job pages without credentials or access-control bypasses.
 */
abstract class HttpJobCollector implements JobCollector {
  abstract readonly source: JobSource;

  /**
   * Creates a collector with its environment-backed source configuration.
   */
  constructor(protected readonly config: ConfigService) {}

  /**
   * Collects a bounded set of normalized listings for one saved search.
   */
  async collect(search: SavedSearch): Promise<CollectionResult> {
    this.assertCollectionEnabled();

    const jobsById = new Map<string, CollectedJob>();
    const maxPages = this.getMaxPages();
    let coverageComplete = false;

    for (let page = 0; page < maxPages; page += 1) {
      const searchUrl = this.buildSearchUrl(search, page);
      const searchHtml = await this.fetchHtml(searchUrl);
      const embeddedJobs = extractJsonLdJobs(
        searchHtml,
        this.source,
        searchUrl,
      ).filter((job) => job.sourceUrl !== searchUrl);

      for (const job of embeddedJobs) {
        jobsById.set(job.sourceJobId, job);
      }

      const detailUrls = extractDetailUrls(searchHtml, this.source, searchUrl);
      for (const detailUrl of detailUrls) {
        const detailHtml = await this.fetchHtml(detailUrl);
        const detailJobs = extractJsonLdJobs(
          detailHtml,
          this.source,
          detailUrl,
        );

        for (const job of detailJobs) {
          jobsById.set(job.sourceJobId, job);
        }
      }

      if (!embeddedJobs.length && !detailUrls.length) {
        coverageComplete = true;
        break;
      }

      if (!hasNextPage(searchHtml)) {
        coverageComplete = true;
        break;
      }

      if (page < maxPages - 1) {
        await this.waitBetweenRequests();
      }
    }

    return { jobs: [...jobsById.values()], coverageComplete };
  }

  /**
   * Builds a source-specific public search-results URL.
   */
  protected abstract buildSearchUrl(search: SavedSearch, page: number): string;

  /**
   * Returns the source hosts accepted by this collector.
   */
  protected abstract allowedHosts(): string[];

  /**
   * Checks source enablement before making any network request.
   */
  private assertCollectionEnabled(): void {
    const globallyEnabled =
      this.config.get<string>('COLLECTION_ENABLED', 'false') === 'true';
    const sourceEnabled =
      this.config.get<string>(
        `${this.source.toUpperCase()}_COLLECTION_ENABLED`,
        'false',
      ) === 'true';

    if (!globallyEnabled || !sourceEnabled) {
      throw new CollectionBlockedError(
        `${this.source} collection is disabled until an authorized source path is configured.`,
      );
    }
  }

  /**
   * Fetches a source HTML page and stops on access-control signals.
   */
  private async fetchHtml(url: string): Promise<string> {
    this.assertAllowedHost(url);

    const response = await fetch(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': COLLECTOR_USER_AGENT,
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(this.getRequestTimeoutMs()),
    });

    this.assertAllowedHost(response.url);

    if ([401, 403, 429].includes(response.status)) {
      throw new CollectionBlockedError(
        `${this.source} returned ${response.status}; the run was stopped.`,
      );
    }

    if (!response.ok) {
      throw new Error(`${this.source} returned HTTP ${response.status}.`);
    }

    const html = await response.text();
    if (/captcha|unusual traffic|access denied/i.test(html)) {
      throw new CollectionBlockedError(
        `${this.source} returned an access-control page; the run was stopped.`,
      );
    }

    return html;
  }

  /**
   * Enforces the collector's source-host allowlist.
   */
  private assertAllowedHost(urlValue: string): void {
    const url = new URL(urlValue);
    if (!this.allowedHosts().includes(url.hostname)) {
      throw new CollectionBlockedError(
        `Refused to collect from unapproved host ${url.hostname}.`,
      );
    }
  }

  /**
   * Returns the bounded page count used for one run.
   */
  private getMaxPages(): number {
    const configured = Number(this.config.get<string>('SOURCE_MAX_PAGES', '1'));
    return Number.isInteger(configured)
      ? Math.min(Math.max(configured, 1), 10)
      : 1;
  }

  /**
   * Returns the request timeout with a safe upper bound.
   */
  private getRequestTimeoutMs(): number {
    const configured = Number(
      this.config.get<string>('SOURCE_REQUEST_TIMEOUT_MS', '15000'),
    );
    return Number.isFinite(configured)
      ? Math.min(Math.max(configured, 1_000), 60_000)
      : 15_000;
  }

  /**
   * Applies an optional, fixed source-request delay for rate management.
   */
  private async waitBetweenRequests(): Promise<void> {
    const configured = Number(
      this.config.get<string>('SOURCE_REQUEST_DELAY_MS', '0'),
    );

    if (!Number.isFinite(configured) || configured <= 0) {
      return;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, Math.min(configured, 60_000));
    });
  }
}

@Injectable()
export class LinkedInJobCollector extends HttpJobCollector {
  readonly source = JobSource.LINKEDIN;

  /**
   * Builds LinkedIn's public job-search URL for one page.
   */
  protected buildSearchUrl(search: SavedSearch, page: number): string {
    const url = new URL('https://www.linkedin.com/jobs/search/');
    url.searchParams.set('keywords', search.keyword);
    if (search.location) {
      url.searchParams.set('location', search.location);
    }
    url.searchParams.set('start', String(page * 25));

    return url.toString();
  }

  /**
   * Returns the public hosts expected for LinkedIn search pages.
   */
  protected allowedHosts(): string[] {
    return ['linkedin.com', 'www.linkedin.com'];
  }
}

@Injectable()
export class XingJobCollector extends HttpJobCollector {
  readonly source = JobSource.XING;

  /**
   * Builds XING's public job-search URL for one page.
   */
  protected buildSearchUrl(search: SavedSearch, page: number): string {
    const url = new URL('https://www.xing.com/jobs/search');
    url.searchParams.set('keywords', search.keyword);
    if (search.location) {
      url.searchParams.set('location', search.location);
    }
    url.searchParams.set('page', String(page + 1));

    return url.toString();
  }

  /**
   * Returns the public hosts expected for XING search pages.
   */
  protected allowedHosts(): string[] {
    return ['xing.com', 'www.xing.com'];
  }
}

@Injectable()
export class SourceCollectorsService {
  private readonly collectors: Map<JobSource, JobCollector>;

  /**
   * Registers the MVP's source-specific collectors.
   */
  constructor(
    linkedInCollector: LinkedInJobCollector,
    xingCollector: XingJobCollector,
  ) {
    this.collectors = new Map<JobSource, JobCollector>([
      [linkedInCollector.source, linkedInCollector],
      [xingCollector.source, xingCollector],
    ]);
  }

  /**
   * Routes a saved search to its matching source collector.
   */
  async collect(search: SavedSearch): Promise<CollectionResult> {
    const collector = this.collectors.get(search.source);
    if (!collector) {
      throw new Error(`No collector is registered for ${search.source}.`);
    }

    return collector.collect(search);
  }
}
