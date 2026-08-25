import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { JobSource, SavedSearch } from '../database/entities';
import {
  buildLinkedInActorInput,
  buildXingActorInput,
} from './apify-inputs';

const savedSearch = (
  source: JobSource,
  filters: Record<string, unknown> = {},
): SavedSearch =>
  ({
    id: 1,
    source,
    keyword: 'backend engineer',
    location: 'Berlin',
    filters,
  }) as SavedSearch;

describe('Apify Actor inputs', () => {
  it('builds a LinkedIn input from only approved filters', () => {
    expect(
      buildLinkedInActorInput(
        savedSearch(JobSource.LINKEDIN, {
          cities: ['Berlin'],
          companyNames: ['Example GmbH'],
          experience: 'Mid-Senior',
          employmentType: 'Full-time',
          workArrangement: 'Hybrid',
          postedWithin: 'Past Week',
          easyApply: false,
        }),
        10,
      ),
    ).toEqual({
      jobs_titles: ['backend engineer'],
      location: 'Berlin',
      jobs_entries: 10,
      cities: ['Berlin'],
      company_names: ['Example GmbH'],
      experience: 'Mid-Senior',
      employment_type: 'Full-time',
      work_arrangement: 'Hybrid',
      posted_within: 'Past Week',
      easy_apply: false,
    });
  });

  it('builds the configured Curious Coder LinkedIn input contract', () => {
    expect(
      buildLinkedInActorInput(
        savedSearch(JobSource.LINKEDIN),
        10,
        'curious_coder/linkedin-jobs-scraper',
      ),
    ).toEqual({
      keywords: 'backend engineer',
      location: 'Berlin',
      limitPerSource: 10,
      autoConvertToAiSearch: true,
      companyIds: [],
      under10Applicants: false,
      scrapeCompany: false,
      splitByLocation: false,
    });
  });

  it('rejects unknown LinkedIn filters, conflicting recency, and unsafe limits', () => {
    expect(() =>
      buildLinkedInActorInput(
        savedSearch(JobSource.LINKEDIN, { startUrls: ['https://example.test'] }),
        10,
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      buildLinkedInActorInput(
        savedSearch(JobSource.LINKEDIN, {
          jobPostTime: 'r86400',
          postedWithin: 'Past Week',
        }),
        10,
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      buildLinkedInActorInput(savedSearch(JobSource.LINKEDIN), 9),
    ).toThrow(BadRequestException);
  });

  it('builds a bounded jobs-only XING input', () => {
    expect(
      buildXingActorInput(
        savedSearch(JobSource.XING, {
          country: ['DE'],
          employmentType: ['FULL_TIME'],
          careerLevel: ['PROFESSIONAL'],
          remote: true,
          daysOld: 14,
        }),
        10,
      ),
    ).toEqual({
      mode: 'jobs',
      queries: ['backend engineer'],
      locations: ['Berlin'],
      maxResults: 10,
      maxPages: 1,
      includeDetails: true,
      descriptionFormat: 'text',
      excludeEmptyFields: true,
      country: ['DE'],
      employmentType: ['FULL_TIME'],
      careerLevel: ['PROFESSIONAL'],
      remote: true,
      daysOld: 14,
    });
  });

  it('builds the configured Shahid Irfan XING input contract', () => {
    expect(
      buildXingActorInput(
        savedSearch(JobSource.XING, { daysOld: 7 }),
        10,
        'shahidirfan/Xing-Jobs-Scraper',
      ),
    ).toEqual({
      keyword: 'backend engineer',
      location: 'Berlin',
      results_wanted: 10,
      max_pages: 1,
      date_posted: 'LAST_WEEK',
    });
  });

  it('rejects unsafe XING controls and conflicting remote filters', () => {
    expect(() =>
      buildXingActorInput(
        savedSearch(JobSource.XING, { maxPages: 0 }),
        10,
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      buildXingActorInput(
        savedSearch(JobSource.XING, { remote: true, remoteOption: 'REMOTE' }),
        10,
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      buildXingActorInput(savedSearch(JobSource.XING), 0),
    ).toThrow(BadRequestException);
  });
});
