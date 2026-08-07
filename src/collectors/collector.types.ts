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
};

export interface JobCollector {
  readonly source: JobSource;

  /**
   * Collects a bounded search result from one authorized source.
   */
  collect(search: SavedSearch): Promise<CollectionResult>;
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
