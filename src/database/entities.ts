import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum JobSource {
  LINKEDIN = 'linkedin',
  XING = 'xing',
}

export enum JobStatus {
  ACTIVE = 'active',
  UNAVAILABLE = 'unavailable',
  CLOSED = 'closed',
}

export enum WorkplaceType {
  REMOTE = 'remote',
  HYBRID = 'hybrid',
  ONSITE = 'onsite',
  UNKNOWN = 'unknown',
}

export enum EmploymentType {
  FULL_TIME = 'full_time',
  PART_TIME = 'part_time',
  CONTRACT = 'contract',
  INTERNSHIP = 'internship',
  UNKNOWN = 'unknown',
}

export enum CollectionRunStatus {
  RUNNING = 'running',
  SUCCEEDED = 'succeeded',
  PARTIAL = 'partial',
  FAILED = 'failed',
}

@Entity({ name: 'saved_searches' })
export class SavedSearch {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'enum', enum: JobSource })
  source!: JobSource;

  @Column()
  keyword!: string;

  @Column({ nullable: true })
  location!: string | null;

  @Column({ name: 'filters_json', type: 'jsonb', default: () => "'{}'" })
  filters!: Record<string, unknown>;

  @Column({ default: true })
  enabled!: boolean;

  @Column({ name: 'schedule_minutes', type: 'integer', default: 360 })
  scheduleMinutes!: number;

  @Column({ name: 'last_completed_at', type: 'timestamptz', nullable: true })
  lastCompletedAt!: Date | null;

  @Column({ name: 'last_attempted_at', type: 'timestamptz', nullable: true })
  lastAttemptedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => CollectionRun, (run) => run.savedSearch)
  runs!: CollectionRun[];

  @OneToMany(() => JobSearch, (jobSearch) => jobSearch.savedSearch)
  jobSearches!: JobSearch[];
}

@Entity({ name: 'collection_runs' })
@Index(['savedSearchId', 'startedAt'])
export class CollectionRun {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'saved_search_id' })
  savedSearchId!: number;

  @Column({ type: 'enum', enum: JobSource })
  source!: JobSource;

  @Column({ type: 'enum', enum: CollectionRunStatus })
  status!: CollectionRunStatus;

  @Column({ name: 'coverage_complete', default: false })
  coverageComplete!: boolean;

  @Column({ name: 'found_count', type: 'integer', default: 0 })
  foundCount!: number;

  @Column({ name: 'upserted_count', type: 'integer', default: 0 })
  upsertedCount!: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @CreateDateColumn({ name: 'started_at', type: 'timestamptz' })
  startedAt!: Date;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt!: Date | null;

  @ManyToOne(() => SavedSearch, (savedSearch) => savedSearch.runs, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'saved_search_id' })
  savedSearch!: SavedSearch;
}

@Entity({ name: 'jobs' })
@Index(['source', 'sourceJobId'], { unique: true })
@Index(['status', 'lastSeenAt'])
export class Job {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'enum', enum: JobSource })
  source!: JobSource;

  @Column({ name: 'source_job_id' })
  sourceJobId!: string;

  @Column({ name: 'source_url', type: 'text' })
  sourceUrl!: string;

  @Column({ name: 'apply_url', type: 'text', nullable: true })
  applyUrl!: string | null;

  @Column()
  title!: string;

  @Column({ name: 'company_name', nullable: true })
  companyName!: string | null;

  @Column({ name: 'company_url', type: 'text', nullable: true })
  companyUrl!: string | null;

  @Column({ nullable: true })
  location!: string | null;

  @Column({
    name: 'workplace_type',
    type: 'enum',
    enum: WorkplaceType,
    default: WorkplaceType.UNKNOWN,
  })
  workplaceType!: WorkplaceType;

  @Column({
    name: 'employment_type',
    type: 'enum',
    enum: EmploymentType,
    default: EmploymentType.UNKNOWN,
  })
  employmentType!: EmploymentType;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  @Column({ type: 'enum', enum: JobStatus, default: JobStatus.ACTIVE })
  status!: JobStatus;

  @Column({ name: 'data_hash' })
  dataHash!: string;

  @Column({ name: 'first_seen_at', type: 'timestamptz' })
  firstSeenAt!: Date;

  @Column({ name: 'last_seen_at', type: 'timestamptz' })
  lastSeenAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => JobSearch, (jobSearch) => jobSearch.job)
  jobSearches!: JobSearch[];
}

/**
 * Records which saved searches have recently observed a job.
 * A job can be unavailable for one search but active for another.
 */
@Entity({ name: 'job_searches' })
@Index(['jobId', 'isAvailable'])
export class JobSearch {
  @PrimaryColumn({ name: 'saved_search_id' })
  savedSearchId!: number;

  @PrimaryColumn({ name: 'job_id' })
  jobId!: number;

  @Column({ name: 'is_available', default: true })
  isAvailable!: boolean;

  @CreateDateColumn({ name: 'first_seen_at', type: 'timestamptz' })
  firstSeenAt!: Date;

  @Column({ name: 'last_seen_at', type: 'timestamptz' })
  lastSeenAt!: Date;

  @ManyToOne(() => SavedSearch, (savedSearch) => savedSearch.jobSearches, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'saved_search_id' })
  savedSearch!: SavedSearch;

  @ManyToOne(() => Job, (job) => job.jobSearches, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'job_id' })
  job!: Job;
}
