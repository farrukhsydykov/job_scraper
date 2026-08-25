import { BadRequestException } from '@nestjs/common';
import { JobSource, SavedSearch } from '../database/entities';

const MAX_ACTOR_RESULTS = 100;
const LINKEDIN_EXPERIENCE = new Set([
  'Intern',
  'Assistant',
  'Junior',
  'Mid-Senior',
  'Director',
  'Executive',
]);
const LINKEDIN_EMPLOYMENT_TYPES = new Set([
  'Full-time',
  'Part-time',
  'Contract',
  'Temporary',
  'Volunteer',
  'Internship',
  'Other',
]);
const LINKEDIN_WORK_ARRANGEMENTS = new Set(['On-site', 'Remote', 'Hybrid']);
const LINKEDIN_POSTED_WITHIN = new Set([
  'Any Time',
  'Past 24 hours',
  'Past Week',
  'Past Month',
]);

export type LinkedInActorInput = {
  keywords?: string;
  jobs_titles?: string[];
  location?: string;
  jobs_entries?: number;
  limitPerSource?: number;
  urls?: string[];
  autoConvertToAiSearch?: boolean;
  companyIds?: string[];
  under10Applicants?: boolean;
  scrapeCompany?: boolean;
  splitByLocation?: boolean;
  cities?: string[];
  company_names?: string[];
  experience?: string;
  employment_type?: string;
  work_arrangement?: string;
  posted_within?: string;
  job_post_time?: string;
  easy_apply?: boolean;
};

export type XingActorInput = {
  keyword?: string;
  mode?: 'jobs';
  queries?: string[];
  locations?: string[];
  results_wanted?: number;
  max_pages?: 1;
  maxResults?: number;
  maxPages?: 1;
  includeDetails?: true;
  descriptionFormat?: 'text';
  excludeEmptyFields?: true;
  date_posted?: 'LAST_24_HOURS' | 'LAST_WEEK' | 'LAST_MONTH';
  country?: string[];
  locationRadius?: number;
  employmentType?: string[];
  careerLevel?: string[];
  discipline?: string[];
  industry?: string[];
  remote?: boolean;
  remoteOption?: string;
  salaryMin?: number;
  salaryMax?: number;
  daysOld?: number;
};

/**
 * Validates saved-search filters before they are persisted or sent to an Actor.
 */
export const validateSavedSearchFilters = (
  source: JobSource,
  filters: unknown,
): void => {
  if (source === JobSource.LINKEDIN) {
    validateLinkedInFilters(filters);
    return;
  }

  if (source === JobSource.XING) {
    validateXingFilters(filters);
    return;
  }

  invalid('source is unsupported.');
};

/**
 * Builds a bounded LinkedIn Actor input from a saved search.
 */
export const buildLinkedInActorInput = (
  search: SavedSearch,
  maxResults: number,
  actorId = 'worldunboxer/rapid-linkedin-scraper',
): LinkedInActorInput => {
  assertLinkedInLimit(maxResults);
  const filters = validateLinkedInFilters(search.filters);

  if (actorId.toLowerCase() === 'curious_coder/linkedin-jobs-scraper') {
    return {
      keywords: search.keyword,
      ...(search.location ? { location: search.location } : {}),
      limitPerSource: maxResults,
      autoConvertToAiSearch: true,
      companyIds: [],
      under10Applicants: false,
      scrapeCompany: false,
      splitByLocation: false,
    };
  }

  return {
    jobs_titles: [search.keyword],
    location: search.location ?? undefined,
    jobs_entries: maxResults,
    ...(filters.cities ? { cities: [...filters.cities] } : {}),
    ...(filters.companyNames
      ? { company_names: [...filters.companyNames] }
      : {}),
    ...(filters.experience ? { experience: filters.experience } : {}),
    ...(filters.employmentType
      ? { employment_type: filters.employmentType }
      : {}),
    ...(filters.workArrangement
      ? { work_arrangement: filters.workArrangement }
      : {}),
    ...(filters.postedWithin ? { posted_within: filters.postedWithin } : {}),
    ...(filters.jobPostTime ? { job_post_time: filters.jobPostTime } : {}),
    ...(filters.easyApply !== undefined ? { easy_apply: filters.easyApply } : {}),
  };
};

/**
 * Builds a bounded XING Actor input from a saved search.
 */
export const buildXingActorInput = (
  search: SavedSearch,
  maxResults: number,
  actorId = 'blackfalcondata/xing-scraper',
): XingActorInput => {
  assertXingLimit(maxResults);
  const filters = validateXingFilters(search.filters);

  if (actorId.toLowerCase() === 'shahidirfan/xing-jobs-scraper') {
    const datePosted = xingDatePosted(filters.daysOld);

    return {
      keyword: search.keyword,
      ...(search.location ? { location: search.location } : {}),
      results_wanted: maxResults,
      max_pages: 1,
      ...(datePosted ? { date_posted: datePosted } : {}),
    };
  }

  return {
    mode: 'jobs',
    queries: [search.keyword],
    locations: search.location ? [search.location] : [],
    maxResults,
    maxPages: 1,
    includeDetails: true,
    descriptionFormat: 'text',
    excludeEmptyFields: true,
    ...(filters.country ? { country: [...filters.country] } : {}),
    ...(filters.locationRadius
      ? { locationRadius: filters.locationRadius }
      : {}),
    ...(filters.employmentType
      ? { employmentType: [...filters.employmentType] }
      : {}),
    ...(filters.careerLevel ? { careerLevel: [...filters.careerLevel] } : {}),
    ...(filters.discipline ? { discipline: [...filters.discipline] } : {}),
    ...(filters.industry ? { industry: [...filters.industry] } : {}),
    ...(filters.remote !== undefined ? { remote: filters.remote } : {}),
    ...(filters.remoteOption ? { remoteOption: filters.remoteOption } : {}),
    ...(filters.salaryMin !== undefined ? { salaryMin: filters.salaryMin } : {}),
    ...(filters.salaryMax !== undefined ? { salaryMax: filters.salaryMax } : {}),
    ...(filters.daysOld ? { daysOld: filters.daysOld } : {}),
  };
};

/**
 * Enforces the shared source-specific result cap for saved-search settings.
 */
export const validateSourceResultLimit = (
  source: JobSource,
  value: number,
): void => {
  if (source === JobSource.LINKEDIN) {
    assertLinkedInLimit(value);
    return;
  }
  if (source === JobSource.XING) {
    assertXingLimit(value);
    return;
  }
  invalid('source is unsupported.');
};

type LinkedInFilters = {
  cities?: string[];
  companyNames?: string[];
  experience?: string;
  employmentType?: string;
  workArrangement?: string;
  postedWithin?: string;
  jobPostTime?: string;
  easyApply?: boolean;
};

type XingFilters = {
  country?: string[];
  locationRadius?: number;
  employmentType?: string[];
  careerLevel?: string[];
  discipline?: string[];
  industry?: string[];
  remote?: boolean;
  remoteOption?: string;
  salaryMin?: number;
  salaryMax?: number;
  daysOld?: number;
};

/**
 * Validates and returns the whitelisted LinkedIn filter values.
 */
const validateLinkedInFilters = (value: unknown): LinkedInFilters => {
  const filters = plainObject(value);
  assertOnlyKeys(filters, [
    'cities',
    'companyNames',
    'experience',
    'employmentType',
    'workArrangement',
    'postedWithin',
    'jobPostTime',
    'easyApply',
  ]);

  const result: LinkedInFilters = {};
  if ('cities' in filters) {
    result.cities = stringArray(filters.cities, 'cities');
  }
  if ('companyNames' in filters) {
    result.companyNames = stringArray(filters.companyNames, 'companyNames');
  }
  if ('experience' in filters) {
    result.experience = enumValue(
      filters.experience,
      'experience',
      LINKEDIN_EXPERIENCE,
    );
  }
  if ('employmentType' in filters) {
    result.employmentType = enumValue(
      filters.employmentType,
      'employmentType',
      LINKEDIN_EMPLOYMENT_TYPES,
    );
  }
  if ('workArrangement' in filters) {
    result.workArrangement = enumValue(
      filters.workArrangement,
      'workArrangement',
      LINKEDIN_WORK_ARRANGEMENTS,
    );
  }
  if ('postedWithin' in filters) {
    result.postedWithin = enumValue(
      filters.postedWithin,
      'postedWithin',
      LINKEDIN_POSTED_WITHIN,
    );
  }
  if ('jobPostTime' in filters) {
    const jobPostTime = stringValue(filters.jobPostTime, 'jobPostTime');
    if (!/^r\d+$/.test(jobPostTime)) {
      invalid('jobPostTime must use the form r<seconds>.');
    }
    result.jobPostTime = jobPostTime;
  }
  if ('easyApply' in filters) {
    result.easyApply = booleanValue(filters.easyApply, 'easyApply');
  }
  if (result.postedWithin && result.jobPostTime) {
    invalid('postedWithin and jobPostTime cannot be used together.');
  }

  return result;
};

/**
 * Validates and returns the whitelisted XING filter values.
 */
const validateXingFilters = (value: unknown): XingFilters => {
  const filters = plainObject(value);
  assertOnlyKeys(filters, [
    'country',
    'locationRadius',
    'employmentType',
    'careerLevel',
    'discipline',
    'industry',
    'remote',
    'remoteOption',
    'salaryMin',
    'salaryMax',
    'daysOld',
  ]);

  const result: XingFilters = {};
  for (const key of [
    'country',
    'employmentType',
    'careerLevel',
    'discipline',
    'industry',
  ] as const) {
    if (key in filters) {
      result[key] = stringArray(filters[key], key);
    }
  }
  if ('locationRadius' in filters) {
    result.locationRadius = positiveInteger(
      filters.locationRadius,
      'locationRadius',
    );
  }
  if ('remote' in filters) {
    result.remote = booleanValue(filters.remote, 'remote');
  }
  if ('remoteOption' in filters) {
    result.remoteOption = stringValue(filters.remoteOption, 'remoteOption');
  }
  for (const key of ['salaryMin', 'salaryMax'] as const) {
    if (key in filters) {
      result[key] = nonNegativeNumber(filters[key], key);
    }
  }
  if ('daysOld' in filters) {
    result.daysOld = positiveInteger(filters.daysOld, 'daysOld');
  }
  if (result.remote !== undefined && result.remoteOption) {
    invalid('remote and remoteOption cannot be used together.');
  }
  if (
    result.salaryMin !== undefined &&
    result.salaryMax !== undefined &&
    result.salaryMin > result.salaryMax
  ) {
    invalid('salaryMin cannot exceed salaryMax.');
  }

  return result;
};

/**
 * Converts the local recency limit to the configured XING Actor's enum.
 */
const xingDatePosted = (
  daysOld: number | undefined,
): XingActorInput['date_posted'] | undefined => {
  if (daysOld === undefined) {
    return undefined;
  }
  if (daysOld <= 1) {
    return 'LAST_24_HOURS';
  }
  if (daysOld <= 7) {
    return 'LAST_WEEK';
  }
  return 'LAST_MONTH';
};

/**
 * Enforces the Actor's minimum and the application safety ceiling.
 */
const assertLinkedInLimit = (value: number): void => {
  if (!Number.isInteger(value) || value < 10 || value > MAX_ACTOR_RESULTS) {
    invalid('LinkedIn max results must be an integer from 10 to 100.');
  }
};

/**
 * Enforces a positive, bounded maximum result count for XING.
 */
const assertXingLimit = (value: number): void => {
  if (!Number.isInteger(value) || value < 1 || value > MAX_ACTOR_RESULTS) {
    invalid('XING max results must be an integer from 1 to 100.');
  }
};

/**
 * Rejects any object that is not a plain JSON object.
 */
const plainObject = (value: unknown): Record<string, unknown> => {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    invalid('filters must be a plain object.');
  }

  return value as Record<string, unknown>;
};

/**
 * Rejects filter keys that are not part of the source-specific allowlist.
 */
const assertOnlyKeys = (
  filters: Record<string, unknown>,
  allowedKeys: string[],
): void => {
  const unsupported = Object.keys(filters).find((key) => !allowedKeys.includes(key));
  if (unsupported) {
    invalid(`filters contains unsupported key "${unsupported}".`);
  }
};

/**
 * Validates a non-empty scalar string value.
 */
const stringValue = (value: unknown, key: string): string => {
  if (typeof value !== 'string') {
    invalid(`${key} must be a non-empty string.`);
  }

  const text = (value as string).trim();
  if (!text) {
    invalid(`${key} must be a non-empty string.`);
  }

  return text;
};

/**
 * Validates a non-empty array of non-empty strings.
 */
const stringArray = (value: unknown, key: string): string[] => {
  if (!Array.isArray(value)) {
    invalid(`${key} must be a non-empty string array.`);
  }
  if (!(value as unknown[]).length) {
    invalid(`${key} must be a non-empty string array.`);
  }

  return (value as unknown[]).map((item: unknown) => stringValue(item, key));
};

/**
 * Validates a string against one approved Actor enum.
 */
const enumValue = (
  value: unknown,
  key: string,
  allowedValues: Set<string>,
): string => {
  const result = stringValue(value, key);
  if (!allowedValues.has(result)) {
    invalid(`${key} contains an unsupported value.`);
  }

  return result;
};

/**
 * Validates a boolean filter value.
 */
const booleanValue = (value: unknown, key: string): boolean => {
  if (typeof value !== 'boolean') {
    invalid(`${key} must be a boolean.`);
  }

  return value as boolean;
};

/**
 * Validates a strictly positive integer filter value.
 */
const positiveInteger = (value: unknown, key: string): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    invalid(`${key} must be a positive integer.`);
  }

  return value as number;
};

/**
 * Validates a finite non-negative numeric filter value.
 */
const nonNegativeNumber = (value: unknown, key: string): number => {
  if (typeof value !== 'number') {
    invalid(`${key} must be a non-negative number.`);
  }
  const numberValue = value as number;
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    invalid(`${key} must be a non-negative number.`);
  }

  return numberValue;
};

/**
 * Throws a 400-level error for an unsafe saved-search filter.
 */
const invalid = (message: string): never => {
  throw new BadRequestException(`Invalid saved-search filters: ${message}`);
};
