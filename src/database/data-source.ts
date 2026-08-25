import 'reflect-metadata';
import { join } from 'node:path';
import { config as loadEnvironment } from 'dotenv';
import { DataSource } from 'typeorm';
import {
  CollectionRun,
  CollectionRunJob,
  Job,
  JobSearch,
  SavedSearch,
} from './entities';

loadEnvironment({ path: '.env.local' });
loadEnvironment({ path: '.env' });

const databaseUrl = process.env.DATABASE_URL;

/**
 * Supplies a standalone DataSource for TypeORM migration CLI commands.
 */
const dataSource = new DataSource({
  type: 'postgres',
  ...(databaseUrl
    ? { url: databaseUrl }
    : {
        host: process.env.DB_HOST ?? 'localhost',
        port: Number(process.env.DB_PORT ?? '5432'),
        database: process.env.DB_NAME ?? 'job_scraper',
        username: process.env.DB_USER ?? 'job_scraper',
        password: process.env.DB_PASSWORD ?? 'job_scraper',
      }),
  entities: [SavedSearch, CollectionRun, CollectionRunJob, Job, JobSearch],
  migrations: [join(__dirname, 'migrations/*{.ts,.js}')],
  synchronize: false,
  logging: process.env.DB_LOGGING === 'true',
});

export default dataSource;
