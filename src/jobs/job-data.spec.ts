import { describe, expect, it } from 'vitest';
import {
  EmploymentType,
  JobSource,
  JobStatus,
  WorkplaceType,
} from '../database/entities';
import { CollectedJob } from '../collectors/collector.types';
import { createJobDataHash, isClosedJob } from './job-data';

const job: CollectedJob = {
  source: JobSource.XING,
  sourceJobId: '42',
  sourceUrl: 'https://www.xing.com/jobs/example-42',
  applyUrl: 'https://example.test/apply',
  title: 'Backend Engineer',
  companyName: 'Example GmbH',
  companyUrl: null,
  location: 'Hamburg',
  workplaceType: WorkplaceType.HYBRID,
  employmentType: EmploymentType.FULL_TIME,
  description: 'Build services.',
  publishedAt: new Date('2026-08-01T00:00:00Z'),
  expiresAt: null,
  status: JobStatus.ACTIVE,
};

describe('job data helpers', () => {
  it('keeps the hash stable until a visible source field changes', () => {
    const originalHash = createJobDataHash(job);

    expect(createJobDataHash({ ...job })).toBe(originalHash);
    expect(createJobDataHash({ ...job, title: 'Platform Engineer' })).not.toBe(
      originalHash,
    );
  });

  it('treats explicit closure and past expiry as closed', () => {
    const now = new Date('2026-08-07T00:00:00Z');

    expect(isClosedJob({ ...job, status: JobStatus.CLOSED }, now)).toBe(true);
    expect(
      isClosedJob(
        { ...job, expiresAt: new Date('2026-08-06T00:00:00Z') },
        now,
      ),
    ).toBe(true);
    expect(isClosedJob(job, now)).toBe(false);
  });
});
