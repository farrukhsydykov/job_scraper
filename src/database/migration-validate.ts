import dataSource from './data-source';

/**
 * Confirms that a database has no pending TypeORM migrations.
 */
const validateMigrations = async (): Promise<void> => {
  await dataSource.initialize();

  try {
    if (await dataSource.showMigrations()) {
      throw new Error('Pending TypeORM migrations remain.');
    }
  } finally {
    await dataSource.destroy();
  }
};

void validateMigrations()
  .then(() => {
    console.log('Migrations are current.');
  })
  .catch(() => {
    console.error('Migration validation failed.');
    process.exitCode = 1;
  });
