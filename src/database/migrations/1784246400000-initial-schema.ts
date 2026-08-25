import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the schema that existed before Apify provenance was introduced.
 */
export class InitialSchema1784246400000 implements MigrationInterface {
  /**
   * Creates all MVP tables, enum types, keys, and indexes for a fresh database.
   */
  async up(queryRunner: QueryRunner): Promise<void> {
    const tableNames = [
      'saved_searches',
      'collection_runs',
      'jobs',
      'job_searches',
    ];
    const existingTables: boolean[] = [];
    for (const table of tableNames) {
      existingTables.push(await queryRunner.hasTable(table));
    }

    // Older local runs may have created this complete schema via synchronization.
    if (existingTables.every(Boolean)) {
      return;
    }
    if (existingTables.some(Boolean)) {
      throw new Error(
        'Cannot baseline a partially initialized job_scraper schema.',
      );
    }

    await queryRunner.query(
      `CREATE TYPE "public"."saved_searches_source_enum" AS ENUM('linkedin', 'xing')`,
    );
    await queryRunner.query(
      `CREATE TABLE "saved_searches" (
        "id" SERIAL NOT NULL,
        "source" "public"."saved_searches_source_enum" NOT NULL,
        "keyword" character varying NOT NULL,
        "location" character varying,
        "filters_json" jsonb NOT NULL DEFAULT '{}',
        "enabled" boolean NOT NULL DEFAULT true,
        "schedule_minutes" integer NOT NULL DEFAULT 360,
        "last_completed_at" TIMESTAMP WITH TIME ZONE,
        "last_attempted_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_saved_searches_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."collection_runs_source_enum" AS ENUM('linkedin', 'xing')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."collection_runs_status_enum" AS ENUM('running', 'succeeded', 'partial', 'failed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "collection_runs" (
        "id" SERIAL NOT NULL,
        "saved_search_id" integer NOT NULL,
        "source" "public"."collection_runs_source_enum" NOT NULL,
        "status" "public"."collection_runs_status_enum" NOT NULL,
        "coverage_complete" boolean NOT NULL DEFAULT false,
        "found_count" integer NOT NULL DEFAULT 0,
        "upserted_count" integer NOT NULL DEFAULT 0,
        "error_message" text,
        "started_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "finished_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_collection_runs_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d4dfd583d8b05b5a32e3e58e4f" ON "collection_runs" ("saved_search_id", "started_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "collection_runs" ADD CONSTRAINT "FK_b4df8fb87b9db341e4f2831cb32" FOREIGN KEY ("saved_search_id") REFERENCES "saved_searches"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."jobs_source_enum" AS ENUM('linkedin', 'xing')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."jobs_workplace_type_enum" AS ENUM('remote', 'hybrid', 'onsite', 'unknown')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."jobs_employment_type_enum" AS ENUM('full_time', 'part_time', 'contract', 'internship', 'unknown')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."jobs_status_enum" AS ENUM('active', 'unavailable', 'closed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "jobs" (
        "id" SERIAL NOT NULL,
        "source" "public"."jobs_source_enum" NOT NULL,
        "source_job_id" character varying NOT NULL,
        "source_url" text NOT NULL,
        "apply_url" text,
        "title" character varying NOT NULL,
        "company_name" character varying,
        "company_url" text,
        "location" character varying,
        "workplace_type" "public"."jobs_workplace_type_enum" NOT NULL DEFAULT 'unknown',
        "employment_type" "public"."jobs_employment_type_enum" NOT NULL DEFAULT 'unknown',
        "description" text,
        "published_at" TIMESTAMP WITH TIME ZONE,
        "expires_at" TIMESTAMP WITH TIME ZONE,
        "status" "public"."jobs_status_enum" NOT NULL DEFAULT 'active',
        "data_hash" character varying NOT NULL,
        "first_seen_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "last_seen_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_jobs_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_500625c712fb96cd82335a8c8f" ON "jobs" ("status", "last_seen_at")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_59c03f0eaaaca54c101dff376c" ON "jobs" ("source", "source_job_id")`,
    );
    await queryRunner.query(
      `CREATE TABLE "job_searches" (
        "saved_search_id" integer NOT NULL,
        "job_id" integer NOT NULL,
        "is_available" boolean NOT NULL DEFAULT true,
        "first_seen_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "last_seen_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_job_searches_saved_search_job" PRIMARY KEY ("saved_search_id", "job_id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f98ccfec97ad02fc00c7643321" ON "job_searches" ("job_id", "is_available")`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_searches" ADD CONSTRAINT "FK_b90ee37ff01a714142efdddc634" FOREIGN KEY ("saved_search_id") REFERENCES "saved_searches"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_searches" ADD CONSTRAINT "FK_2e692d1eb1fc3e3c5421c50a665" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  /**
   * Removes the pre-provenance schema in reverse dependency order.
   */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "job_searches"`);
    await queryRunner.query(`DROP TABLE "jobs"`);
    await queryRunner.query(`DROP TYPE "public"."jobs_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."jobs_employment_type_enum"`);
    await queryRunner.query(`DROP TYPE "public"."jobs_workplace_type_enum"`);
    await queryRunner.query(`DROP TYPE "public"."jobs_source_enum"`);
    await queryRunner.query(`DROP TABLE "collection_runs"`);
    await queryRunner.query(`DROP TYPE "public"."collection_runs_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."collection_runs_source_enum"`);
    await queryRunner.query(`DROP TABLE "saved_searches"`);
    await queryRunner.query(`DROP TYPE "public"."saved_searches_source_enum"`);
  }
}
