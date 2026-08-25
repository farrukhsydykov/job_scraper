---
name: apify-completion
overview: Replace the current direct LinkedIn/XING HTTP collectors with an Apify-only ingestion path while preserving the existing NestJS, PostgreSQL, scheduler, API, and dashboard MVP. The saved project document will be `job_scraper/apify-only-completion-plan.md` after approval.
todos:
  - id: freeze-direct-bypass
    content: Disable the direct collector and make configuration/documentation safe by default.
    status: pending
  - id: boot-and-migrations
    content: Fix TypeORM boot issues and introduce migration-backed schema management.
    status: pending
  - id: validate-actors
    content: Approve actor contracts, fixtures, input limits, and legacy-data disposition.
    status: pending
  - id: build-apify-collectors
    content: Implement bounded Apify adapters and remove all direct HTTP collector code.
    status: pending
  - id: provenance-and-tests
    content: Persist Apify provenance and add integration, regression, and smoke coverage.
    status: pending
  - id: finish-operations
    content: Complete scheduler resilience, health checks, dashboard feedback, and CI.
    status: pending
isProject: false
---

# Apify-Only Job Scraper Completion Plan

## Objective
Make `job_scraper` collect newly persisted jobs exclusively through Apify Actor datasets. Preserve the existing NestJS/PostgreSQL MVP rather than rebuilding its saved-search, run, job, API, or dashboard layers.

## Confirmed findings
- [`src/collectors/http-job.collectors.ts`](/Users/norman/Desktop/post-labour/job_scraper/src/collectors/http-job.collectors.ts) directly calls LinkedIn and XING with `fetch()`, so the current runtime is not Apify-only.
- [`src/collectors/collectors.module.ts`](/Users/norman/Desktop/post-labour/job_scraper/src/collectors/collectors.module.ts) registers those direct collectors, while [`src/runs/runs.service.ts`](/Users/norman/Desktop/post-labour/job_scraper/src/runs/runs.service.ts) routes every manual and scheduled run to them.
- Apify is documented in `apify-rapid-linkedin-scraper-guide.md` and `apify-xing-scraper-guide.md`, but no runtime code, dependency, environment variable, or provenance field currently uses it.
- The local `.env.example` currently enables the direct collection flags; this conflicts with the safe disabled posture in [`README.md`](/Users/norman/Desktop/post-labour/job_scraper/README.md).
- Typecheck and the five current unit tests pass, but the runtime must be fixed before release: [`src/main.ts`](/Users/norman/Desktop/post-labour/job_scraper/src/main.ts) lacks `reflect-metadata`, and several inferred TypeORM column types in [`src/database/entities.ts`](/Users/norman/Desktop/post-labour/job_scraper/src/database/entities.ts) are unsafe for nullable unions.

## Non-goals
- Do not retain a direct LinkedIn/XING HTTP fallback.
- Do not add company-profile or employee collection modes, browser automation, webhooks, queues, a generic provider marketplace, or cross-source deduplication.
- Do not persist contact-email fields or raw source responses.

## Implementation sequence

### 1. Freeze the direct collection bypass
- Restore disabled defaults in `.env.example` and require local collection to remain disabled until the Apify adapter is complete.
- Remove the existing direct-source collection flags and `SOURCE_*` settings from the target configuration contract.
- Align [`README.md`](/Users/norman/Desktop/post-labour/job_scraper/README.md) with the final Apify-only configuration.
- Verify a disabled run records a blocked result without making a source request.

### 2. Establish a bootable, migration-backed foundation
- Add `reflect-metadata` before Nest/TypeORM imports in [`src/main.ts`](/Users/norman/Desktop/post-labour/job_scraper/src/main.ts).
- Give entity columns explicit PostgreSQL types in [`src/database/entities.ts`](/Users/norman/Desktop/post-labour/job_scraper/src/database/entities.ts), especially nullable strings and all fields currently relying on decorator inference.
- Add a TypeORM migration/data-source workflow; use migrations rather than `DB_SYNCHRONIZE=true` for persistent environments.
- Document `DATABASE_URL` and default `DB_SYNCHRONIZE` to false outside disposable local development.
- Verify the app starts against a migrated PostgreSQL database and its existing dashboard/API routes respond.

### 3. Validate and freeze the external Actor contracts
- Run small, authorized manual probes (maximum 10 results) for the LinkedIn and XING Actors documented in the repository.
- Resolve the discrepancy between actor names in `initial-plan.md` and the newer Apify guides before hard-coding configuration.
- Capture sanitized representative dataset items as test fixtures; record the required identity, URL, title, employer, location, date, and classification fields.
- Define the allowed per-source `filters_json` keys and reject unsupported input instead of forwarding arbitrary Actor payloads.
- Decide how to handle pre-existing direct-scrape data: reset an alpha database or export/quarantine it. Never relabel it as Apify-originated.

### 4. Add a constrained Apify provider boundary
- Add `apify-client` to [`package.json`](/Users/norman/Desktop/post-labour/job_scraper/package.json).
- Replace the direct collector implementation with Apify-backed collectors while retaining the existing `JobCollector` boundary in [`src/collectors/collector.types.ts`](/Users/norman/Desktop/post-labour/job_scraper/src/collectors/collector.types.ts).
- Require every collector result to declare `provider: 'apify'`, actor ID, and external Apify run ID alongside normalized listings.
- Configure only `APIFY_TOKEN`, per-source Apify feature flags, actor IDs, bounded result limits, and actor timeout values.
- Update [`src/collectors/collectors.module.ts`](/Users/norman/Desktop/post-labour/job_scraper/src/collectors/collectors.module.ts) and [`src/runs/runs.service.ts`](/Users/norman/Desktop/post-labour/job_scraper/src/runs/runs.service.ts) to use the new service.

### 5. Implement source-specific mapping and lifecycle safety
- LinkedIn adapter: map `job_id`, `job_url`, `apply_url`, title, company, location, and supported filters from the approved actor contract.
- XING adapter: use only `mode: 'jobs'`; map stable ID, portal URL, title, company, dates, apply URL, and supported filters.
- Read every page of an Apify dataset, validate required identifiers/URLs/titles, deduplicate by stable source ID, and make malformed output a partial result rather than silently saving it.
- Set `coverageComplete` to false unless the actor contract provides a trustworthy complete-result signal and the configured result cap was not reached.
- Preserve existing same-source upsert behavior in [`src/jobs/jobs.service.ts`](/Users/norman/Desktop/post-labour/job_scraper/src/jobs/jobs.service.ts); do not mark jobs unavailable after partial or uncertain coverage.

### 6. Enforce and audit Apify-only provenance
- Add migration-backed run fields in [`src/database/entities.ts`](/Users/norman/Desktop/post-labour/job_scraper/src/database/entities.ts): collection provider, external actor ID, and external run ID.
- Persist those values on every successful or partial run.
- Delete the direct HTML collector, source host allowlists, and HTML parser path once adapter tests replace them; remove obsolete parser tests too.
- Add a regression test that prevents collector runtime code from adding direct source-page `fetch()` calls or direct LinkedIn/XING URL construction.

### 7. Complete test coverage and operational readiness
- Add mapper fixture tests, configuration-gate tests, dataset-pagination tests, malformed-record tests, and mocked Apify-client integration tests.
- Add PostgreSQL integration tests for job upserts, changed listings, complete versus partial availability transitions, and closure logic.
- Test scheduler error isolation so one failed/double-started search does not prevent later due searches.
- Add a database-backed `/health` endpoint, concise run-start/run-finish/run-failure logging, and CI commands for typecheck, test, build, and migration validation.
- Show run completion, partial/failure reason, and Apify provenance in the dashboard; add authentication before any public deployment.

## Acceptance criteria
- No collector runtime path requests LinkedIn or XING directly.
- Enabled collection invokes an approved Apify Actor, reads its dataset, and persists normalized jobs.
- Every successful or partial `collection_runs` row records `apify`, its actor ID, and the external run ID.
- Missing token, disabled collection, malformed actor records, and actor failure are safely handled without corrupting availability state.
- The app boots against a migrated Postgres database; typecheck, tests, build, migration validation, mocked e2e tests, and a bounded real-Actor smoke test all pass.
- Documentation, environment examples, and runtime behavior tell one consistent Apify-only story.
