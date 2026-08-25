import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds a soft-archive timestamp so saved searches can be restored or deleted safely.
 */
export class AddSavedSearchArchive1784246403000 implements MigrationInterface {
  /**
   * Adds the nullable archive timestamp without changing existing searches.
   */
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "saved_searches" ADD "archived_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_saved_searches_archived_at" ON "saved_searches" ("archived_at")`,
    );
  }

  /**
   * Removes the archive timestamp and its lookup index.
   */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_saved_searches_archived_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_searches" DROP COLUMN "archived_at"`,
    );
  }
}
