import {
  EmploymentType,
  JobSource,
  JobStatus,
  WorkplaceType,
} from '../database/entities';
import { CollectedJob } from './collector.types';

export type MappedDatasetItems = {
  jobs: CollectedJob[];
  skippedCount: number;
};

/**
 * Maps a documented LinkedIn Actor item into a safe local listing.
 */
export const mapLinkedInItem = (value: unknown): CollectedJob | null => {
  const item = record(value);
  if (!item) {
    return null;
  }

  const sourceJobId = identifier(firstPresent(item.job_id, item.id, item.refId));
  const sourceUrl = requiredUrl(
    firstPresent(item.job_url, item.link, item.inputUrl),
  );
  const title = requiredText(firstPresent(item.job_title, item.title));
  if (!sourceJobId || !sourceUrl || !title) {
    return null;
  }

  return {
    source: JobSource.LINKEDIN,
    sourceJobId,
    sourceUrl,
    applyUrl: optionalUrl(firstPresent(item.apply_url, item.applyUrl)),
    title,
    companyName: optionalText(firstPresent(item.company_name, item.companyName)),
    companyUrl: optionalUrl(
      firstPresent(item.company_url, item.companyWebsite, item.companyLinkedinUrl),
    ),
    location: optionalText(item.location),
    workplaceType: WorkplaceType.UNKNOWN,
    employmentType: mapEmploymentType(
      firstPresent(item.employment_type, item.employmentType),
    ),
    description: optionalDescription(
      firstPresent(item.job_description, item.descriptionText, item.descriptionHtml),
    ),
    publishedAt: absoluteDate(item.postedAt),
    expiresAt: null,
    status: JobStatus.ACTIVE,
  };
};

/**
 * Maps a documented XING Actor item into a safe local listing.
 */
export const mapXingItem = (value: unknown): CollectedJob | null => {
  const item = record(value);
  if (!item) {
    return null;
  }

  const sourceJobId = identifier(
    firstPresent(item.job_id, item.xingId, item.jobId),
  );
  const sourceUrl = requiredUrl(firstPresent(item.url, item.portalUrl));
  const title = requiredText(item.title);
  if (!sourceJobId || !sourceUrl || !title) {
    return null;
  }

  return {
    source: JobSource.XING,
    sourceJobId,
    sourceUrl,
    applyUrl: optionalUrl(firstPresent(item.apply_url, item.applyUrl)),
    title,
    companyName: optionalText(item.company),
    companyUrl: optionalUrl(item.company_public_profile),
    location: optionalText(item.location),
    workplaceType: mapWorkplaceType(firstPresent(item.remote, item.remoteOption)),
    employmentType: mapEmploymentType(
      firstPresent(item.job_type, item.employmentType),
    ),
    description: optionalDescription(
      firstPresent(item.description_text, item.description, item.description_html),
    ),
    publishedAt: absoluteDate(firstPresent(item.date_posted, item.postedDate)),
    expiresAt: absoluteDate(firstPresent(item.active_until, item.activeUntil)),
    status: JobStatus.ACTIVE,
  };
};

/**
 * Maps valid dataset records and deduplicates them within one source run.
 */
export const mapDatasetItems = (
  items: unknown[],
  mapper: (item: unknown) => CollectedJob | null,
): MappedDatasetItems => {
  const jobsById = new Map<string, CollectedJob>();
  let skippedCount = 0;

  for (const item of items) {
    const job = mapper(item);
    if (!job) {
      skippedCount += 1;
      continue;
    }

    jobsById.set(job.sourceJobId, job);
  }

  return { jobs: [...jobsById.values()], skippedCount };
};

/**
 * Narrows unknown Actor output to a record with string keys.
 */
const record = (value: unknown): Record<string, unknown> | null =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value))
    ? (value as Record<string, unknown>)
    : null;

/**
 * Returns the first present value across compatible Actor field names.
 */
const firstPresent = (...values: unknown[]): unknown =>
  values.find((value) => value !== undefined && value !== null && value !== '') ??
  null;

/**
 * Maps source workplace labels into the local workplace enum.
 */
const mapWorkplaceType = (value: unknown): WorkplaceType => {
  const normalized = optionalText(value)
    ?.toLowerCase()
    .replace(/[\s_-]+/g, '-');

  switch (normalized) {
    case 'remote':
      return WorkplaceType.REMOTE;
    case 'hybrid':
      return WorkplaceType.HYBRID;
    case 'on-site':
    case 'onsite':
      return WorkplaceType.ONSITE;
    default:
      return WorkplaceType.UNKNOWN;
  }
};

/**
 * Returns a trimmed identifier from a string or finite numeric Actor field.
 */
const identifier = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return requiredText(value);
};

/**
 * Returns a required non-empty string without preserving external markup.
 */
const requiredText = (value: unknown): string | null => {
  const text = optionalText(value);
  return text || null;
};

/**
 * Normalizes an optional text field to a trimmed string or null.
 */
const optionalText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const text = value.trim();
  return text || null;
};

/**
 * Normalizes source markup into readable plain text without persisting HTML.
 */
const optionalDescription = (value: unknown): string | null => {
  const description = optionalText(value);
  if (!description) {
    return null;
  }

  const text = decodeHtmlEntities(
    description
      .replace(/\r\n?/g, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '\n• ')
      .replace(
        /<\/(?:p|div|section|article|h[1-6]|li|ul|ol|pre|blockquote)>/gi,
        '\n',
      )
      .replace(/<[^>]*>/g, '')
      .split('\n')
      .map((line) => line.replace(/[ \t]+/g, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/(• [^\n]+)\n\n(?=• )/g, '$1\n')
      .trim(),
  );
  return text || null;
};

/**
 * Decodes common safe HTML entities while keeping all source markup removed.
 */
const decodeHtmlEntities = (value: string): string =>
  value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => decodeCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      decodeCodePoint(Number.parseInt(code, 16)),
    );

/**
 * Converts one numeric entity only when it is a valid Unicode code point.
 */
const decodeCodePoint = (value: number): string =>
  Number.isInteger(value) && value >= 0 && value <= 0x10ffff
    ? String.fromCodePoint(value)
    : '';

/**
 * Validates a required absolute HTTP(S) URL.
 */
const requiredUrl = (value: unknown): string | null => optionalUrl(value);

/**
 * Normalizes an optional absolute HTTP(S) URL or returns null.
 */
const optionalUrl = (value: unknown): string | null => {
  const text = optionalText(value);
  if (!text) {
    return null;
  }

  try {
    const url = new URL(text);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
};

/**
 * Maps exact Actor employment values into the existing local enum.
 */
const mapEmploymentType = (value: unknown): EmploymentType => {
  const normalized = optionalText(value)
    ?.toLowerCase()
    .replace(/[\s_-]+/g, '-');

  switch (normalized) {
    case 'full-time':
      return EmploymentType.FULL_TIME;
    case 'part-time':
      return EmploymentType.PART_TIME;
    case 'contract':
      return EmploymentType.CONTRACT;
    case 'internship':
      return EmploymentType.INTERNSHIP;
    default:
      return EmploymentType.UNKNOWN;
  }
};

/**
 * Parses only unambiguous ISO-like absolute dates from Actor output.
 */
const absoluteDate = (value: unknown): Date | null => {
  const text = optionalText(value);
  if (
    !text ||
    !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(
      text,
    )
  ) {
    return null;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
};
