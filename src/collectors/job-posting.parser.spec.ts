import { describe, expect, it } from 'vitest';
import {
  extractDetailUrls,
  extractJsonLdJobs,
  hasNextPage,
  sourceJobIdFromUrl,
} from './job-posting.parser';
import {
  EmploymentType,
  JobSource,
  JobStatus,
  WorkplaceType,
} from '../database/entities';

describe('job posting parser', () => {
  it('maps a LinkedIn JSON-LD job posting into the MVP fields', () => {
    const html = `
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "JobPosting",
          "title": "Senior Backend Engineer",
          "url": "https://www.linkedin.com/jobs/view/123456789",
          "datePosted": "2026-08-01T12:00:00Z",
          "validThrough": "2099-08-30T12:00:00Z",
          "employmentType": "FULL_TIME",
          "jobLocationType": "TELECOMMUTE",
          "hiringOrganization": { "name": "Example GmbH", "url": "https://example.test" },
          "jobLocation": {
            "address": {
              "addressLocality": "Berlin",
              "addressCountry": "DE"
            }
          },
          "description": "<p>Build resilient APIs.</p>"
        }
      </script>
    `;

    expect(
      extractJsonLdJobs(
        html,
        JobSource.LINKEDIN,
        'https://www.linkedin.com/jobs/search/',
      ),
    ).toEqual([
      expect.objectContaining({
        source: JobSource.LINKEDIN,
        sourceJobId: '123456789',
        title: 'Senior Backend Engineer',
        companyName: 'Example GmbH',
        location: 'Berlin, DE',
        description: 'Build resilient APIs.',
        employmentType: EmploymentType.FULL_TIME,
        workplaceType: WorkplaceType.REMOTE,
        status: JobStatus.ACTIVE,
      }),
    ]);
  });

  it('limits detail links to the requested source and detects pagination', () => {
    const html = `
      <a href="/jobs/view/123456789">Valid job</a>
      <a href="https://www.xing.com/jobs/example-123">Other source</a>
      <a rel="next" href="/jobs/search/?start=25">Next</a>
    `;

    expect(
      extractDetailUrls(
        html,
        JobSource.LINKEDIN,
        'https://www.linkedin.com/jobs/search/',
      ),
    ).toEqual(['https://www.linkedin.com/jobs/view/123456789']);
    expect(hasNextPage(html)).toBe(true);
  });

  it('uses the source URL hash only when no known source identifier exists', () => {
    expect(
      sourceJobIdFromUrl('https://www.linkedin.com/jobs/view/987654321'),
    ).toBe('987654321');
    expect(
      sourceJobIdFromUrl('https://www.xing.com/jobs/example-role'),
    ).toHaveLength(64);
  });
});
