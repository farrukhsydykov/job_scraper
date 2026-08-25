import { describe, expect, it } from 'vitest';
import {
  EmploymentType,
  JobSource,
  JobStatus,
  WorkplaceType,
} from '../database/entities';
import {
  mapDatasetItems,
  mapLinkedInItem,
  mapXingItem,
} from './apify-mappers';

const linkedInItem = {
  job_id: 'linkedin-42',
  job_url: 'https://www.linkedin.com/jobs/view/42',
  apply_url: 'https://example.test/apply',
  job_title: 'Backend Engineer',
  company_name: 'Example GmbH',
  company_url: 'https://example.test/company',
  location: 'Berlin',
  employment_type: 'Full-time',
  job_description: '<p>Build APIs.</p>',
};

const currentLinkedInActorItem = {
  id: 'linkedin-99',
  link: 'https://www.linkedin.com/jobs/view/99',
  title: 'Software Developer',
  companyName: 'Example Ltd',
  companyWebsite: 'https://example.test',
  location: 'Bishkek',
  employmentType: 'Full-time',
  descriptionText: 'Build TypeScript services.',
  postedAt: '2026-08-04',
};

const xingItem = {
  xingId: 'xing-42',
  jobId: 'fallback-42',
  portalUrl: 'https://www.xing.com/jobs/backend-engineer-42',
  applyUrl: 'https://example.test/apply',
  title: 'Backend Engineer',
  company: 'Example GmbH',
  location: 'Berlin',
  employmentType: 'FULL_TIME',
  description: 'Build APIs.',
  postedDate: '2026-08-01T12:00:00Z',
  activeUntil: '2026-09-01',
  changeType: 'EXPIRED',
};

const currentXingActorItem = {
  job_id: 'xing-99',
  url: 'https://www.xing.com/jobs/software-developer-99',
  title: 'Software Developer',
  company: 'Example AG',
  company_public_profile: 'https://www.xing.com/pages/example-ag',
  location: 'Hamburg',
  remote: 'Hybrid',
  job_type: 'Full-time',
  date_posted: '2026-08-04T12:00:00Z',
  active_until: '2026-09-01',
  apply_url: 'https://example.test/apply',
  description_text: 'Build TypeScript services.',
};

describe('Apify dataset mappers', () => {
  it('maps a valid LinkedIn item without persisting raw HTML or relative dates', () => {
    expect(mapLinkedInItem(linkedInItem)).toEqual({
      source: JobSource.LINKEDIN,
      sourceJobId: 'linkedin-42',
      sourceUrl: 'https://www.linkedin.com/jobs/view/42',
      applyUrl: 'https://example.test/apply',
      title: 'Backend Engineer',
      companyName: 'Example GmbH',
      companyUrl: 'https://example.test/company',
      location: 'Berlin',
      workplaceType: WorkplaceType.UNKNOWN,
      employmentType: EmploymentType.FULL_TIME,
      description: 'Build APIs.',
      publishedAt: null,
      expiresAt: null,
      status: JobStatus.ACTIVE,
    });
  });

  it('maps the observed configured LinkedIn Actor field names', () => {
    expect(mapLinkedInItem(currentLinkedInActorItem)).toMatchObject({
      source: JobSource.LINKEDIN,
      sourceJobId: 'linkedin-99',
      sourceUrl: 'https://www.linkedin.com/jobs/view/99',
      title: 'Software Developer',
      companyName: 'Example Ltd',
      companyUrl: 'https://example.test/',
      description: 'Build TypeScript services.',
      publishedAt: new Date('2026-08-04'),
    });
  });

  it('keeps description paragraphs and list items readable without HTML', () => {
    expect(
      mapLinkedInItem({
        ...currentLinkedInActorItem,
        descriptionText:
          '<p>Lead the team.</p><ul><li>Own APIs.</li><li>Ship safely.</li></ul><script>alert(1)</script>',
      }),
    ).toMatchObject({
      description: 'Lead the team.\n\n• Own APIs.\n• Ship safely.\n\nalert(1)',
    });
  });

  it('maps XING’s approved identity preference and absolute dates only', () => {
    const mapped = mapXingItem(xingItem);

    expect(mapped).toMatchObject({
      source: JobSource.XING,
      sourceJobId: 'xing-42',
      workplaceType: WorkplaceType.UNKNOWN,
      employmentType: EmploymentType.FULL_TIME,
      status: JobStatus.ACTIVE,
    });
    expect(mapped?.publishedAt).toEqual(new Date('2026-08-01T12:00:00Z'));
    expect(mapped?.expiresAt).toEqual(new Date('2026-09-01'));
    expect(
      mapXingItem({ ...xingItem, postedDate: '2 days ago', activeUntil: 'soon' }),
    ).toMatchObject({ publishedAt: null, expiresAt: null });
  });

  it('maps the observed configured XING Actor field names', () => {
    expect(mapXingItem(currentXingActorItem)).toMatchObject({
      source: JobSource.XING,
      sourceJobId: 'xing-99',
      sourceUrl: 'https://www.xing.com/jobs/software-developer-99',
      title: 'Software Developer',
      companyName: 'Example AG',
      companyUrl: 'https://www.xing.com/pages/example-ag',
      workplaceType: WorkplaceType.HYBRID,
      employmentType: EmploymentType.FULL_TIME,
      publishedAt: new Date('2026-08-04T12:00:00Z'),
      expiresAt: new Date('2026-09-01'),
    });
  });

  it('skips invalid required fields and normalizes invalid optional URLs', () => {
    expect(mapLinkedInItem({ ...linkedInItem, job_id: '' })).toBeNull();
    expect(mapLinkedInItem({ ...linkedInItem, job_url: 'file:///tmp/job' })).toBeNull();
    expect(
      mapLinkedInItem({ ...linkedInItem, apply_url: 'javascript:alert(1)' }),
    ).toMatchObject({ applyUrl: null });
  });

  it('deduplicates valid source IDs while counting malformed records', () => {
    const result = mapDatasetItems(
      [
        linkedInItem,
        { ...linkedInItem, job_title: 'Updated Backend Engineer' },
        { ...linkedInItem, job_id: null },
      ],
      mapLinkedInItem,
    );

    expect(result.skippedCount).toBe(1);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.title).toBe('Updated Backend Engineer');
  });
});
