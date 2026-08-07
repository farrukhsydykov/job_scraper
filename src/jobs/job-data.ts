import { createHash } from 'node:crypto';
import { JobStatus } from '../database/entities';
import { CollectedJob } from '../collectors/collector.types';

/**
 * Produces a stable hash for the source fields that define a job listing.
 */
export const createJobDataHash = (job: CollectedJob): string => {
  const fields = {
    applyUrl: job.applyUrl,
    companyName: job.companyName,
    companyUrl: job.companyUrl,
    description: job.description,
    employmentType: job.employmentType,
    expiresAt: job.expiresAt?.toISOString() ?? null,
    location: job.location,
    publishedAt: job.publishedAt?.toISOString() ?? null,
    sourceUrl: job.sourceUrl,
    status: job.status,
    title: job.title,
    workplaceType: job.workplaceType,
  };

  return createHash('sha256').update(JSON.stringify(fields)).digest('hex');
};

/**
 * Determines whether an observed source job is explicitly closed.
 */
export const isClosedJob = (job: CollectedJob, observedAt: Date): boolean =>
  job.status === JobStatus.CLOSED ||
  (job.expiresAt !== null && job.expiresAt.getTime() < observedAt.getTime());
