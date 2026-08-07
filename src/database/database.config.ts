import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

/**
 * Builds the PostgreSQL connection options from the environment.
 */
export const createDatabaseOptions = (
  config: ConfigService,
): TypeOrmModuleOptions => {
  const databaseUrl = config.get<string>('DATABASE_URL');

  return {
    type: 'postgres',
    ...(databaseUrl
      ? { url: databaseUrl }
      : {
          host: config.get<string>('DB_HOST', 'localhost'),
          port: Number(config.get<string>('DB_PORT', '5432')),
          database: config.get<string>('DB_NAME', 'job_scraper'),
          username: config.get<string>('DB_USER', 'job_scraper'),
          password: config.get<string>('DB_PASSWORD', 'job_scraper'),
        }),
    autoLoadEntities: true,
    synchronize: config.get<string>('DB_SYNCHRONIZE', 'false') === 'true',
    logging: config.get<string>('DB_LOGGING', 'false') === 'true',
  };
};
