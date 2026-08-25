import {
  EmploymentType,
  JobSource,
  JobStatus,
  SavedSearch,
  WorkplaceType,
} from '../database/entities';

export type CollectedJob = {
  source: JobSource;
  sourceJobId: string;
  sourceUrl: string;
  applyUrl: string | null;
  title: string;
  companyName: string | null;
  companyUrl: string | null;
  location: string | null;
  workplaceType: WorkplaceType;
  employmentType: EmploymentType;
  description: string | null;
  publishedAt: Date | null;
  expiresAt: Date | null;
  status: JobStatus;
};

export type CollectionResult = {
  jobs: CollectedJob[];
  coverageComplete: boolean;
  provenance: CollectionProvenance;
  skippedCount: number;
};

export type CollectionOptions = {
  deadlineAt: Date;
};

export type CollectionProvenance = {
  provider: 'apify';
  actorId: string;
  externalRunId: string;
};

export interface JobCollector {
  readonly source: JobSource;

  /**
   * Collects a bounded search result from one authorized source.
   */
  collect(
    search: SavedSearch,
    options?: CollectionOptions,
  ): Promise<CollectionResult>;
}

export class CollectionBlockedError extends Error {
  /**
   * Creates a source-access error that must not be retried automatically.
   */
  constructor(message: string) {
    super(message);
    this.name = 'CollectionBlockedError';
  }
}
