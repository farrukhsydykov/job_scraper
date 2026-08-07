import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import {
  EmploymentType,
  JobSource,
  JobStatus,
  WorkplaceType,
} from '../database/entities';
import { CollectedJob } from './collector.types';

type JsonObject = Record<string, unknown>;

/**
 * Extracts normalized JobPosting values embedded in an HTML document.
 */
export const extractJsonLdJobs = (
  html: string,
  source: JobSource,
  pageUrl: string,
): CollectedJob[] => {
  const $ = load(html);
  const jobPostings = $('script[type="application/ld+json"]')
    .toArray()
    .flatMap((element) => parseJsonLd($(element).text()))
    .filter(isJobPosting)
    .map((jobPosting) => mapJobPosting(jobPosting, source, pageUrl));

  return deduplicateJobs(jobPostings);
};

/**
 * Extracts probable source job-detail links from a search-results page.
 */
export const extractDetailUrls = (
  html: string,
  source: JobSource,
  pageUrl: string,
): string[] => {
  const $ = load(html);
  const jobUrls = new Set<string>();

  $('a[href]').each((_, element) => {
    const href = $(element).attr('href');
    if (!href) {
      return;
    }

    const url = toAbsoluteUrl(href, pageUrl);
    if (url && isLikelyJobUrl(url, source)) {
      jobUrls.add(url);
    }
  });

  return [...jobUrls];
};

/**
 * Detects whether a search page advertises a following result page.
 */
export const hasNextPage = (html: string): boolean => {
  const $ = load(html);

  return $('a[rel="next"], a[aria-label*="Next" i], button[aria-label*="Next" i]')
    .toArray()
    .some((element) => $(element).attr('aria-disabled') !== 'true');
};

/**
 * Returns a stable source identifier from a source job URL.
 */
export const sourceJobIdFromUrl = (url: string): string => {
  const linkedInId = url.match(/\/jobs\/view\/(\d+)/)?.[1];
  if (linkedInId) {
    return linkedInId;
  }

  const queryId = new URL(url).searchParams.get('currentJobId');
  if (queryId) {
    return queryId;
  }

  const xingId = url.match(/\/jobs\/[^?#/]*?(\d+)(?:[/?#]|$)/)?.[1];
  if (xingId) {
    return xingId;
  }

  return createHash('sha256').update(url).digest('hex');
};

/**
 * Maps schema.org employment-type values to the MVP enum.
 */
export const mapEmploymentType = (value: unknown): EmploymentType => {
  const normalizedValue = Array.isArray(value) ? value.join(' ') : value;
  const normalized = stringValue(normalizedValue)?.toUpperCase() ?? '';

  if (normalized.includes('FULL_TIME')) {
    return EmploymentType.FULL_TIME;
  }

  if (normalized.includes('PART_TIME')) {
    return EmploymentType.PART_TIME;
  }

  if (
    normalized.includes('CONTRACT') ||
    normalized.includes('TEMPORARY') ||
    normalized.includes('FREELANCE')
  ) {
    return EmploymentType.CONTRACT;
  }

  if (normalized.includes('INTERN')) {
    return EmploymentType.INTERNSHIP;
  }

  return EmploymentType.UNKNOWN;
};

/**
 * Maps schema.org workplace values to the MVP enum.
 */
export const mapWorkplaceType = (value: unknown): WorkplaceType => {
  const normalized = stringValue(value)?.toUpperCase() ?? '';

  if (normalized.includes('TELECOMMUTE') || normalized.includes('REMOTE')) {
    return WorkplaceType.REMOTE;
  }

  if (normalized.includes('HYBRID')) {
    return WorkplaceType.HYBRID;
  }

  if (normalized.includes('ONSITE') || normalized.includes('ON_SITE')) {
    return WorkplaceType.ONSITE;
  }

  return WorkplaceType.UNKNOWN;
};

/**
 * Converts a schema.org JobPosting object into a database-ready job.
 */
const mapJobPosting = (
  jobPosting: JsonObject,
  source: JobSource,
  pageUrl: string,
): CollectedJob => {
  const sourceUrl = toAbsoluteUrl(stringValue(jobPosting.url) ?? '', pageUrl) ?? pageUrl;
  const expiresAt = dateValue(jobPosting.validThrough);

  return {
    source,
    sourceJobId: sourceJobIdFromUrl(sourceUrl),
    sourceUrl,
    applyUrl: sourceUrl,
    title: stringValue(jobPosting.title) ?? 'Untitled job',
    companyName: organizationName(jobPosting.hiringOrganization),
    companyUrl: organizationUrl(jobPosting.hiringOrganization, sourceUrl),
    location: locationValue(jobPosting.jobLocation),
    workplaceType: mapWorkplaceType(jobPosting.jobLocationType),
    employmentType: mapEmploymentType(jobPosting.employmentType),
    description: plainTextValue(jobPosting.description),
    publishedAt: dateValue(jobPosting.datePosted),
    expiresAt,
    status:
      expiresAt && expiresAt.getTime() < Date.now()
        ? JobStatus.CLOSED
        : JobStatus.ACTIVE,
  };
};

/**
 * Parses all objects from one JSON-LD script without failing the collection.
 */
const parseJsonLd = (value: string): JsonObject[] => {
  try {
    return flattenJsonLd(JSON.parse(value) as unknown);
  } catch {
    return [];
  }
};

/**
 * Flattens JSON-LD arrays and graph containers into individual objects.
 */
const flattenJsonLd = (value: unknown): JsonObject[] => {
  if (Array.isArray(value)) {
    return value.flatMap(flattenJsonLd);
  }

  if (!isJsonObject(value)) {
    return [];
  }

  const graph = value['@graph'];
  return [value, ...(graph ? flattenJsonLd(graph) : [])];
};

/**
 * Checks whether a JSON-LD object represents a schema.org JobPosting.
 */
const isJobPosting = (value: JsonObject): boolean => {
  const type = value['@type'];
  const types = Array.isArray(type) ? type : [type];

  return types.some((entry) => stringValue(entry)?.toLowerCase() === 'jobposting');
};

/**
 * Finds a company's name in a schema.org organization value.
 */
const organizationName = (value: unknown): string | null => {
  if (isJsonObject(value)) {
    return stringValue(value.name);
  }

  return stringValue(value);
};

/**
 * Finds a company's public URL in a schema.org organization value.
 */
const organizationUrl = (value: unknown, pageUrl: string): string | null => {
  if (!isJsonObject(value)) {
    return null;
  }

  return toAbsoluteUrl(stringValue(value.url) ?? '', pageUrl);
};

/**
 * Converts schema.org locations into a concise display value.
 */
const locationValue = (value: unknown): string | null => {
  const location = Array.isArray(value) ? value[0] : value;
  if (!isJsonObject(location)) {
    return stringValue(location);
  }

  const address = isJsonObject(location.address) ? location.address : location;
  const values = [
    stringValue(address.addressLocality),
    stringValue(address.addressRegion),
    stringValue(address.addressCountry),
  ].filter((entry): entry is string => Boolean(entry));

  return values.length ? [...new Set(values)].join(', ') : null;
};

/**
 * Normalizes a date-like source value, returning null for invalid dates.
 */
const dateValue = (value: unknown): Date | null => {
  const dateString = stringValue(value);
  if (!dateString) {
    return null;
  }

  const date = new Date(dateString);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * Turns an HTML description into plain text that is safe to render escaped.
 */
const plainTextValue = (value: unknown): string | null => {
  const description = stringValue(value);
  if (!description) {
    return null;
  }

  return normalizeText(load(description).text());
};

/**
 * Converts a source value into normalized non-empty text.
 */
const stringValue = (value: unknown): string | null =>
  typeof value === 'string' ? normalizeText(value) : null;

/**
 * Normalizes whitespace and maps blank strings to null.
 */
const normalizeText = (value: string): string | null => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized || null;
};

/**
 * Resolves a relative URL while rejecting malformed values.
 */
const toAbsoluteUrl = (value: string, baseUrl: string): string | null => {
  if (!value) {
    return null;
  }

  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
};

/**
 * Limits links to public job-detail paths for a specific source.
 */
const isLikelyJobUrl = (urlValue: string, source: JobSource): boolean => {
  const url = new URL(urlValue);
  const hostMatches =
    source === JobSource.LINKEDIN
      ? url.hostname === 'www.linkedin.com'
      : url.hostname === 'www.xing.com';

  if (!hostMatches) {
    return false;
  }

  return source === JobSource.LINKEDIN
    ? /\/jobs\/view\/\d+/.test(url.pathname)
    : /^\/jobs\/(?!search)/.test(url.pathname);
};

/**
 * Removes duplicate results using the same source identity.
 */
const deduplicateJobs = (jobs: CollectedJob[]): CollectedJob[] => {
  const seenJobIds = new Set<string>();

  return jobs.filter((job) => {
    if (seenJobIds.has(job.sourceJobId)) {
      return false;
    }

    seenJobIds.add(job.sourceJobId);
    return true;
  });
};

/**
 * Checks whether a value is an object with string keys.
 */
const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
