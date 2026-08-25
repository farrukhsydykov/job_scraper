import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds bounded search controls and the run-to-job discovery relationship.
 */
export class AddSearchRunControlsAndJobProvenance1784246402000
  implements MigrationInterface
{
  /**
   * Adds safe defaults so existing searches remain schedulable as before.
   */
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "saved_searches"
        ADD "result_limit" integer NOT NULL DEFAULT 10,
        ADD "run_window_minutes" integer NOT NULL DEFAULT 5,
        ADD "request_delay_seconds" integer NOT NULL DEFAULT 0,
        ADD "request_jitter_seconds" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "collection_runs"
        ADD "requested_count" integer NOT NULL DEFAULT 10,
        ADD "run_window_minutes" integer NOT NULL DEFAULT 5,
        ADD "progress_count" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `CREATE TABLE "collection_run_jobs" (
        "run_id" integer NOT NULL,
        "job_id" integer NOT NULL,
        "found_order" integer NOT NULL,
        "found_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_collection_run_jobs_run_job" PRIMARY KEY ("run_id", "job_id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_collection_run_jobs_run_order"
        ON "collection_run_jobs" ("run_id", "found_order")`,
    );
    await queryRunner.query(
      `ALTER TABLE "collection_run_jobs"
        ADD CONSTRAINT "FK_collection_run_jobs_run"
        FOREIGN KEY ("run_id") REFERENCES "collection_runs"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "collection_run_jobs"
        ADD CONSTRAINT "FK_collection_run_jobs_job"
        FOREIGN KEY ("job_id") REFERENCES "jobs"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  /**
   * Removes the run provenance and configurable controls.
   */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "collection_run_jobs"
        DROP CONSTRAINT "FK_collection_run_jobs_job"`,
    );
    await queryRunner.query(
      `ALTER TABLE "collection_run_jobs"
        DROP CONSTRAINT "FK_collection_run_jobs_run"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_collection_run_jobs_run_order"`,
    );
    await queryRunner.query(`DROP TABLE "collection_run_jobs"`);
    await queryRunner.query(
      `ALTER TABLE "collection_runs"
        DROP COLUMN "progress_count",
        DROP COLUMN "run_window_minutes",
        DROP COLUMN "requested_count"`,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_searches"
        DROP COLUMN "request_jitter_seconds",
        DROP COLUMN "request_delay_seconds",
        DROP COLUMN "run_window_minutes",
        DROP COLUMN "result_limit"`,
    );
  }
}
