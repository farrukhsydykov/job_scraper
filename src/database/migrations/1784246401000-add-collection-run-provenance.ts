import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds nullable Apify provenance to completed collection runs.
 */
export class AddCollectionRunProvenance1784246401000
  implements MigrationInterface
{
  /**
   * Adds the provenance columns without inventing values for historic runs.
   */
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "collection_runs" ADD "collection_provider" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "collection_runs" ADD "external_actor_id" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "collection_runs" ADD "external_run_id" character varying`,
    );
  }

  /**
   * Removes the provenance columns if this migration is reverted.
   */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "collection_runs" DROP COLUMN "external_run_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "collection_runs" DROP COLUMN "external_actor_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "collection_runs" DROP COLUMN "collection_provider"`,
    );
  }
}
