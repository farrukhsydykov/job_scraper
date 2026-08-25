# Apify-only implementation guide

This document turns [`completion-plan.md`](completion-plan.md) into small,
ordered implementation tasks. Follow the tasks in order. Complete the
verification for one task before beginning the next one.

## Goal

Replace the direct LinkedIn and XING HTTP collectors with an Apify-only
ingestion path while preserving the existing NestJS, PostgreSQL, scheduler,
JSON API, and server-rendered dashboard.

The application must continue to use this flow:

```text
manual run or scheduler
  -> RunsService
  -> SourceCollectorsService
  -> source-specific JobCollector
  -> JobsService.persistCollection
  -> PostgreSQL jobs, job_searches, and collection_runs
```

Keep the existing same-source upsert key, `(source, source_job_id)`, and the
availability logic in `src/jobs/jobs.service.ts`. A partial run must never
make previously seen jobs unavailable.

## Non-goals and hard boundaries

- Do not keep a direct LinkedIn or XING HTTP fallback.
- Do not add browser automation, queues, webhooks, company-profile collection,
  employee collection, a provider marketplace, or cross-source deduplication.
- Do not persist contact emails, raw HTML descriptions, logos, applicant
  counts, raw Apify responses, actor inputs containing secrets, or webhook
  credentials.
- Do not enable collection by default.
- Do not put `APIFY_TOKEN` in a committed file, a test fixture, a log message,
  an error response, or a dashboard page.
- Do not deploy this dashboard publicly until authentication is added. Adding
  authentication is a deployment prerequisite, not part of this migration.

## Current-state facts to preserve

- `src/collectors/http-job.collectors.ts` is the only runtime path that
  directly calls `fetch()` against LinkedIn and XING. It and
  `src/collectors/job-posting.parser.ts` are temporary code to delete only
  after the Apify replacement is covered by tests.
- `CollectionResult` currently contains only `jobs` and `coverageComplete`;
  it needs Apify provenance and malformed-record accounting.
- `RunsService` currently writes a `CollectionRun`, calls a collector, and
  delegates all upsert and availability behavior to `JobsService`.
- `SavedSearch.filters` is stored as JSON but is not currently validated or
  read by collectors.
- `.env.example` already disables collection. Its problems are the legacy
  direct-collector variables and `DB_SYNCHRONIZE=true`, not enabled source
  flags.
- There is no TypeORM migration workflow, no `/health` route, and no CI
  workflow.

## Required human checkpoints

These are blocking decisions. A coding model may implement the local,
non-network tasks before them, but must not silently guess an answer.

### Checkpoint A: authorization and Actor contracts

Before enabling either source, an authorized operator must:

1. Run one bounded probe per Actor in the Apify Console or through an
   authorized token.
2. Use at most 10 requested results for each probe.
3. Inspect the Actor log and dataset.
4. Save only sanitized representative records as committed test fixtures.
5. Record the observed input/output fields in
   `docs/apify-actor-contracts.md`.

The repository guides are the initial contract:

- LinkedIn: `worldunboxer/rapid-linkedin-scraper`
- XING: `blackfalcondata/xing-scraper`

`initial-plan.md` names older Actors. Treat those names as superseded; do not
hard-code them. Actor IDs must remain environment-configurable. The live
Actor Input schema and the approved fixture are authoritative if they differ
from the repository guides.

### Checkpoint B: XING identity and dates

Use the fixture to confirm that `xingId` is stable across equivalent results.
If it is stable, use `xingId` as `sourceJobId` and use `jobId` only as a
fallback. If the fixture contradicts this, stop and ask for a decision before
persisting XING jobs.

Only parse `postedDate` and `activeUntil` when the actual value is an
unambiguous absolute date. Invalid or relative values become `null`. Do not
map the Actor's `changeType` directly to local job status.

### Checkpoint C: existing direct-scrape data

Before the first migration is applied to a non-disposable database, the owner
must choose one of these paths:

1. Reset the alpha database.
2. Export and quarantine existing direct-scrape data, then reset the
   application tables.
3. Leave historic data in place, clearly identified as legacy data without
   relabeling it as Apify-originated.

Do not invent provenance for old jobs or old collection runs.

## Target configuration contract

Replace every direct-source configuration variable with the following
Apify-specific contract:

```env
# Database: DATABASE_URL takes precedence over individual DB_* variables.
DB_SYNCHRONIZE=false

# Collection is opt-in. All three checks must pass before an Actor is called.
COLLECTION_ENABLED=false
APIFY_TOKEN=
APIFY_LINKEDIN_ENABLED=false
APIFY_XING_ENABLED=false

# Actor IDs are configurable so a validated contract can be replaced safely.
APIFY_LINKEDIN_ACTOR_ID=worldunboxer/rapid-linkedin-scraper
APIFY_XING_ACTOR_ID=blackfalcondata/xing-scraper

# Every run is bounded. Start with 10 while validating cost and mapping.
APIFY_LINKEDIN_MAX_RESULTS=10
APIFY_XING_MAX_RESULTS=10
APIFY_ACTOR_TIMEOUT_SECS=300
```

Remove these legacy variables from `.env.example`, runtime configuration, and
documentation:

```text
LINKEDIN_COLLECTION_ENABLED
XING_COLLECTION_ENABLED
SOURCE_MAX_PAGES
SOURCE_REQUEST_TIMEOUT_MS
SOURCE_REQUEST_DELAY_MS
```

Configuration behavior:

1. `COLLECTION_ENABLED` must equal the literal string `true`.
2. The source-specific `APIFY_<SOURCE>_ENABLED` flag must equal `true`.
3. `APIFY_TOKEN` must be non-empty.
4. The Actor ID, result limit, and timeout must be valid before calling
   Apify.
5. A missing token, disabled flag, or invalid local configuration throws
   `CollectionBlockedError` before an Actor request is attempted.
6. `APIFY_LINKEDIN_MAX_RESULTS` must be an integer from 10 through a
   deliberately documented local safety ceiling. `APIFY_XING_MAX_RESULTS`
   must be a positive bounded integer. Reject `0`; both Actors interpret
   unbounded limits dangerously.
7. Keep a conservative application-level maximum. If product requirements
   need a higher cap, require an explicit cost/authorization review rather
   than changing a default silently.

Use `DB_SYNCHRONIZE=false` in `.env.example` and all persistent environments.
Only a disposable, developer-owned database may temporarily opt into schema
synchronization, and it must not replace migration validation.

## Target TypeScript contracts

Extend `src/collectors/collector.types.ts` before writing an adapter:

```ts
export type CollectionProvenance = {
  provider: 'apify';
  actorId: string;
  externalRunId: string;
};

export type CollectionResult = {
  jobs: CollectedJob[];
  coverageComplete: boolean;
  provenance: CollectionProvenance;
  skippedCount: number;
};
```

Keep `JobCollector.collect(search)` unchanged. The collector boundary remains
the only path from a source-specific adapter to `RunsService`.

Add nullable fields to `CollectionRun` and a migration for them:

```ts
collectionProvider: string | null; // always "apify" on successful/partial runs
externalActorId: string | null;
externalRunId: string | null;
```

Use these exact database column names:

```text
collection_provider
external_actor_id
external_run_id
```

They must be nullable so existing rows and failures that occur before an
Actor starts remain valid. Successful and partial runs must always have all
three values.

## Task 1 — Freeze the direct bypass safely

**Objective:** make the target configuration and documentation Apify-only
without creating an enabled collection path.

**Depends on:** none.

**Modify:**

- `.env.example`
- `README.md`
- add configuration-gate tests under `src/collectors/`

**Instructions:**

1. Replace the old source flags and `SOURCE_*` settings with the target
   environment contract above.
2. Change the example `DB_SYNCHRONIZE` value to `false`.
3. Update the README setup and collection sections to state that:
   - Apify is the only eventual ingestion provider.
   - collection is disabled by default;
   - all three enablement checks are required;
   - the result limit is an explicit cost and lifecycle bound;
   - a missing token or disabled flag produces a blocked run and no source
     request.
4. Do not delete the current HTTP collector in this task. Its gate test is a
   temporary behavioral baseline until the Apify collector replaces it.

**Verify:**

```bash
npm run typecheck
npm test
```

Add a unit test that uses disabled configuration and asserts that the current
HTTP collector throws `CollectionBlockedError` before a stubbed `fetch()` is
called. In Task 4, replace that implementation-specific assertion with the
same behavioral test against the Apify client port. The no-request guarantee
must remain after the direct collector is deleted.

## Task 2 — Make boot and schema management deterministic

**Objective:** boot Nest reliably and replace implicit schema changes with
migrations.

**Depends on:** Task 1 and Checkpoint C for a persistent database.

**Modify or create:**

- `src/main.ts`
- `src/database/entities.ts`
- `src/database/data-source.ts`
- `src/database/migrations/<timestamp>-initial-schema.ts`
- `src/database/migrations/<timestamp>-add-collection-run-provenance.ts`
- `src/database/database.config.ts`
- `package.json`
- `README.md`

**Instructions:**

1. Put `import 'reflect-metadata';` as the first import in `src/main.ts`,
   before Nest or local imports.
2. Give every TypeORM `@Column()` that currently relies on inference an
   explicit PostgreSQL type. At minimum, make these explicit:
   - `SavedSearch.keyword` and nullable `SavedSearch.location`: `varchar`
   - `SavedSearch.enabled`: `boolean`
   - `CollectionRun.savedSearchId`: `integer`
   - `CollectionRun.coverageComplete`: `boolean`
   - `Job.sourceJobId`, `Job.title`, and `Job.dataHash`: `varchar`
   - nullable `Job.companyName` and `Job.location`: `varchar`
   - `JobSearch.isAvailable`: `boolean`
3. Preserve all existing column names, enum values, defaults, indexes, and
   relationships. This task fixes inference; it is not a schema redesign.
4. Create a standalone TypeORM `DataSource` configuration for the migration
   CLI. It must use the same database URL/DB variable precedence as
   `createDatabaseOptions`, explicitly list the four entities, and explicitly
   discover the migration files.
5. Create an initial migration that represents the complete existing schema
   for a fresh database. Create a later migration that adds the three
   provenance fields to `collection_runs`. Do not depend on
   `synchronize: true` to create either schema.
6. Add TypeORM-compatible scripts for generating, running, reverting, and
   validating migrations. Check the installed TypeORM CLI help and its
   TypeScript data-source support before committing the script syntax; do not
   guess a CLI command that the installed version cannot execute.
7. Keep `createDatabaseOptions()` defaulting `DB_SYNCHRONIZE` to `false`.
   Document that `DATABASE_URL` takes precedence over individual DB settings.

**Verify:**

```bash
docker compose up -d postgres
npm run migration:run
npm run typecheck
npm run build
npm start
```

With `DB_SYNCHRONIZE=false`, the application must start against a newly
migrated database and serve the existing dashboard/API routes. Run the
migration validation command against an empty disposable database in CI.

## Task 3 — Freeze Actor inputs and fixtures

**Objective:** turn the external Actor output into a testable, versioned
contract before persisting it.

**Depends on:** Checkpoint A.

**Create:**

- `docs/apify-actor-contracts.md`
- `src/collectors/fixtures/apify-linkedin-item.json`
- `src/collectors/fixtures/apify-xing-item.json`

**Instructions:**

1. Use exactly one small, approved probe per Actor with a maximum requested
   result count of 10.
2. Save sanitized records only. Remove contact emails, raw HTML, token values,
   user data, and any unnecessary personal data.
3. In `docs/apify-actor-contracts.md`, record:
   - the Actor ID and review date;
   - exact input names and allowed values used;
   - actual output field names and types;
   - the stable identity field;
   - URL, title, employer, location, date, and classification mappings;
   - fields deliberately excluded from persistence;
   - whether the Actor gives a trustworthy complete-coverage signal.
4. Treat a missing, renamed, or type-changed required field as schema drift.
   Update the fixture and mapper test first, then make an explicit mapping
   decision. Do not simply loosen validation to make a run pass.
5. For the MVP, record that neither capped Actor run proves complete search
   coverage unless the approved Actor contract supplies a reliable signal.

**Verify:**

- Both fixtures parse as JSON.
- Neither fixture contains `APIFY_TOKEN`, `contact_email`, raw description
  HTML, or a raw full Actor response.
- The documented field names match the inspected dataset.

## Task 4 — Add the Apify provider boundary

**Objective:** introduce a testable Apify client wrapper and source adapters
without changing job persistence semantics.

**Depends on:** Tasks 1–3.

**Modify or create:**

- `package.json`
- `src/collectors/apify-client.service.ts`
- `src/collectors/apify-collector.base.ts`
- `src/collectors/apify-linkedin.collector.ts`
- `src/collectors/apify-xing.collector.ts`
- `src/collectors/source-collectors.service.ts`
- `src/collectors/collector.types.ts`
- `src/collectors/collectors.module.ts`
- `src/runs/runs.service.ts`

**Instructions:**

1. Add the official `apify-client` package.
2. Wrap `ApifyClient` in an injectable local service/port. The source
   collectors must depend on that local port, not construct a client directly.
   This makes pagination and actor failures unit-testable without a live
   token.
3. Give the port operations with these responsibilities:
   - call an Actor with its ID and validated input;
   - return the Apify run ID and `defaultDatasetId`;
   - read every page of the default dataset;
   - fail when the run has no dataset ID or the Actor invocation fails.
4. Use the installed `apify-client` typings for the exact call options. The
   repository guides establish the required flow:

   ```ts
   const run = await client.actor(actorId).call(input);
   const { items } = await client.dataset(run.defaultDatasetId).listItems();
   ```

   Do not replace this with a direct REST `fetch()` call.
5. Paginate until the dataset is exhausted. Use an offset and a fixed page
   size, advance by the number of items returned, and stop only after a page
   contains fewer than the requested page size. Do not assume a single
   `listItems()` result contains all records.
6. Apply `APIFY_ACTOR_TIMEOUT_SECS` in the wrapper using the option supported
   by the installed client or an explicit bounded application wait. Confirm
   the implementation in the installed package typings. A timeout is a failed
   run; do not automatically retry it.
7. Put the common enablement assertion in the base collector. It must check
   the global flag, source flag, token, Actor ID, result cap, and timeout
   before calling the client.
8. Each source collector implements the existing `JobCollector` interface,
   calls its configured Actor, maps the full dataset, deduplicates valid jobs,
   and returns `CollectionResult` with:

   ```ts
   {
     jobs,
     coverageComplete: false,
     provenance: {
       provider: 'apify',
       actorId,
       externalRunId: run.id,
     },
     skippedCount,
   }
   ```

9. Keep `SourceCollectorsService` as the one-source router. Move it out of
   `http-job.collectors.ts` into `source-collectors.service.ts`, inject the
   two Apify collectors, and update `RunsService` and `CollectorsModule`
   imports.

**Verify:**

- A mock client proves that no client method is called when each gate fails.
- A mock actor run with multiple dataset pages returns items from all pages.
- A missing `defaultDatasetId`, client rejection, or timeout becomes a failed
  collection run, not a direct-source request.
- `npm run typecheck` and `npm test` pass.

## Task 5 — Validate saved-search filters and build bounded Actor inputs

**Objective:** prevent arbitrary `filters_json` from being forwarded to an
Actor.

**Depends on:** Task 4 and the approved Actor contracts from Task 3.

**Create or modify:**

- `src/collectors/apify-inputs.ts`
- `src/collectors/apify-inputs.spec.ts`
- `src/searches/searches.service.ts`
- optionally `src/contracts.ts` only if stronger DTO validation is needed

**Instructions:**

1. Implement pure input-builder functions, one per source. They receive a
   `SavedSearch` and validated environment limits; they return a plain Actor
   input object.
2. Validate filters in `SearchesService.create()` and `update()` so bad input
   receives a 400 response when saved. Validate again in the input builder as
   defense in depth for existing rows or manually edited data.
3. Reject unknown keys, nested arbitrary payloads, non-plain objects, and
   unsafe Actor controls. In particular, never accept `startUrls`,
   `incrementalMode`, `stateKey`, `maxResults`, `maxPages`, `jobs_entries`,
   `mode`, webhooks, company modes, or employee modes from `filters_json`.
4. The dashboard does not currently expose `filters_json`. Keep it API-only
   in this migration rather than adding a generic JSON editor.

### LinkedIn input rules

Always build these values from the saved search and configuration:

```ts
{
  jobs_titles: [search.keyword],
  location: search.location ?? undefined,
  jobs_entries: configuredMaxResults,
}
```

Allow only these friendly `filters_json` keys and map them to Actor input:

```text
cities             -> cities                 (string[])
companyNames       -> company_names          (string[])
experience         -> experience             (approved string enum)
employmentType     -> employment_type        (approved string enum)
workArrangement    -> work_arrangement       ("On-site" | "Remote" | "Hybrid")
postedWithin       -> posted_within          (approved string enum)
jobPostTime        -> job_post_time          (/^r\d+$/)
easyApply          -> easy_apply             (boolean)
```

Reject a search that supplies both `postedWithin` and `jobPostTime`; do not
rely on the Actor's precedence rule. Never send the legacy `job_title`,
`experience_level`, `job_type`, or `work_schedule` inputs.

### XING input rules

Always build these values:

```ts
{
  mode: 'jobs',
  queries: [search.keyword],
  locations: search.location ? [search.location] : [],
  maxResults: configuredMaxResults,
  maxPages: 1,
  includeDetails: true,
  descriptionFormat: 'text',
  excludeEmptyFields: true,
}
```

Allow only these `filters_json` keys after validating their documented types:

```text
country
locationRadius
employmentType
careerLevel
discipline
industry
remote
remoteOption
salaryMin
salaryMax
daysOld
```

Reject both `remote` and `remoteOption` together unless the approved Actor
contract explicitly defines their combined behavior. Do not enable
`companyProfiles`, `companyEmployees`, `startUrls`, `incrementalMode`, or
`stateKey` in this MVP.

**Verify:**

- Valid filters produce exactly the expected Actor input.
- Each unknown key and invalid type is rejected.
- The LinkedIn minimum result limit is enforced.
- `postedWithin` plus `jobPostTime` is rejected.
- XING input always has `mode: 'jobs'`, `maxPages: 1`, and a positive,
  bounded `maxResults`.

## Task 6 — Map, validate, and deduplicate dataset records

**Objective:** allow malformed Actor data to produce a truthful partial run
without corrupting job lifecycle state.

**Depends on:** Tasks 3–5.

**Create:**

- `src/collectors/apify-mappers.ts`
- `src/collectors/apify-mappers.spec.ts`

**Instructions:**

1. Write pure mapper functions that accept `unknown` input and return either a
   valid `CollectedJob` or `null`. Do not cast an unvalidated external item
   directly to `CollectedJob`.
2. Validate required stable ID, source URL, and title. The source URL must be
   an absolute `http:` or `https:` URL. Skip the item when a required field is
   missing or invalid.
3. Normalize missing optional values to `null`. If an optional `applyUrl` or
   `companyUrl` is invalid, set that optional field to `null`; do not let it
   cause `JobsService.validateListing()` to fail the entire run.
4. Keep a `skippedCount` for every input item that cannot map safely. Do not
   save the raw malformed item or its raw error text.
5. Deduplicate only valid mapped jobs by `sourceJobId` with a `Map`. Do not
   deduplicate LinkedIn and XING jobs against one another.

### LinkedIn mapping

| Actor field | Local field |
| --- | --- |
| `job_id` | `sourceJobId` |
| `job_url` | `sourceUrl` |
| `apply_url` | `applyUrl` |
| `job_title` | `title` |
| `company_name` | `companyName` |
| `company_url` | `companyUrl` |
| `location` | `location` |
| `job_description` | `description` |

Set:

```ts
source: JobSource.LINKEDIN
status: JobStatus.ACTIVE
workplaceType: WorkplaceType.UNKNOWN
publishedAt: null
expiresAt: null
```

Map employment values as follows:

```text
Full-time  -> FULL_TIME
Part-time  -> PART_TIME
Contract   -> CONTRACT
Internship -> INTERNSHIP
all other or missing values -> UNKNOWN
```

Do not infer `workplaceType` from the search filter. Do not parse relative
`time_posted` text. Exclude `contact_email`, `job_description_raw_html`,
`company_logo_url`, `num_applicants`, and other fields outside
`CollectedJob`.

### XING mapping

| Actor field | Local field |
| --- | --- |
| approved stable ID (`xingId`, then `jobId` fallback) | `sourceJobId` |
| `portalUrl` | `sourceUrl` |
| `applyUrl` | `applyUrl` |
| `title` | `title` |
| `company` | `companyName` |
| `location` | `location` |
| `description` | `description` |
| valid `postedDate` | `publishedAt` |
| valid `activeUntil` | `expiresAt` |

Set `source` to `JobSource.XING` and initially set `status` to
`JobStatus.ACTIVE`. Map XING employment values to the existing local enum
where an exact equivalent exists; use `UNKNOWN` rather than extending the
enum in this migration. Leave `workplaceType` as `UNKNOWN` unless the
approved fixture defines a reliable per-item `remoteOption` mapping.

Do not use `changeType` as local job status. `JobsService` remains responsible
for closing a job whose valid `expiresAt` is in the past.

**Verify:**

- A valid fixture maps to all expected `CollectedJob` fields.
- Records missing required ID, URL, or title return `null`.
- Invalid optional URLs become `null`.
- Duplicate source IDs collapse to one job.
- LinkedIn dates remain `null`.
- A valid XING expiry date can exercise existing closure behavior through
  `JobsService` tests.

## Task 7 — Persist provenance and preserve lifecycle safety

**Objective:** make every successful or partial collection auditable without
changing the existing upsert model.

**Depends on:** Tasks 2, 4, and 6.

**Modify:**

- `src/database/entities.ts`
- `src/database/migrations/<timestamp>-add-collection-run-provenance.ts`
- `src/runs/runs.service.ts`
- `src/runs/runs.service.spec.ts`

**Instructions:**

1. Add the nullable provenance columns and migration described in the target
   contract section.
2. After a collector returns successfully, copy
   `result.provenance.provider`, `actorId`, and `externalRunId` to the
   current `CollectionRun` before saving it.
3. Compute one effective coverage value before calling `JobsService`:

   ```ts
   const coverageComplete =
     result.coverageComplete && result.skippedCount === 0;
   ```

   Pass this value, not `result.coverageComplete`, to
   `JobsService.persistCollection()`, persist it on `CollectionRun`, and pass
   it to `recordRunAttempt()`. A malformed item means the run is partial and
   must not trigger unavailable-job transitions.
4. Set `foundCount` to the number of valid, deduplicated jobs in
   `result.jobs`. Continue to use `upsertedCount` from
   `JobsService.persistCollection()`.
5. Treat the run as `PARTIAL` when effective `coverageComplete` is false. For
   the MVP, both Apify collectors return `coverageComplete: false`, so
   successful actor calls are partial until a validated complete-coverage
   signal is introduced.
6. Put a concise reason in `errorMessage`, for example:

   ```text
   Coverage was not confirmed; job availability was not changed. 3 malformed records were skipped.
   ```

   Omit raw records, token values, request bodies, and stack traces.
7. Keep failed runs as `FAILED`. If an error occurs before a collector returns
   a result, provenance fields remain null. Preserve the existing bounded
   error-message behavior.
8. Leave `JobsService.persistCollection()` and its availability condition
   intact. It may call `markMissingJobsUnavailable()` only when
   `coverageComplete` is true.

**Verify:**

- A mocked partial result persists provider, Actor ID, external run ID, counts,
  and a partial reason.
- A result with skipped records remains partial even if a future collector
  claims complete coverage, and it does not mark missing jobs unavailable.
- A failed/blocked run does not mark jobs unavailable.
- Existing same-source job upsert behavior still passes its tests.

## Task 8 — Remove the direct collection implementation

**Objective:** ensure there is no remaining runtime path to LinkedIn or XING
through direct HTTP or HTML parsing.

**Depends on:** Tasks 4–7 and their replacement tests.

**Delete:**

- `src/collectors/http-job.collectors.ts`
- `src/collectors/job-posting.parser.ts`
- `src/collectors/job-posting.parser.spec.ts`

**Modify:**

- `src/collectors/collectors.module.ts`
- `src/runs/runs.service.ts`
- any import that references the deleted files
- `package.json`
- add `src/collectors/collectors.regression.spec.ts`

**Instructions:**

1. Delete the direct collector only after the new Apify collector,
   mapper, pagination, and blocked-gate tests pass.
2. Remove `cheerio` only after a repository search confirms no remaining
   runtime imports require it.
3. Add a regression test that inspects runtime collector source files
   (excluding tests and fixtures) and fails if it finds:
   - a direct `fetch(` call;
   - direct LinkedIn job-search URL construction;
   - direct XING job-search URL construction;
   - the retired direct collector class names.
4. Allow Actor IDs and mapper field names to contain source names. The
   regression test is specifically preventing direct source-page access, not
   mentions of LinkedIn or XING.

**Verify:**

```bash
rg "fetch\(" src/collectors --glob "*.ts" --glob "!*.spec.ts"
rg "linkedin\.com/jobs|xing\.com/jobs" src/collectors --glob "*.ts" --glob "!*.spec.ts"
npm run typecheck
npm test
```

The first two commands must have no runtime matches after the migration.

## Task 9 — Finish operational behavior and user feedback

**Objective:** make failures visible, keep scheduled searches isolated, and
verify the migration continuously.

**Depends on:** Tasks 1–8.

**Create or modify:**

- `src/runs/runs.scheduler.ts`
- `src/runs/runs.service.ts`
- `src/health/health.controller.ts`
- `src/health/health.module.ts`
- `src/app.module.ts`
- `src/views/searches.ejs`
- `src/runs/runs.scheduler.spec.ts`
- health endpoint tests
- PostgreSQL integration tests for `JobsService`
- `.github/workflows/ci.yml`
- `package.json`

**Instructions:**

1. Add concise Nest `Logger` messages for run start, finish, and failure.
   Log search ID, source, status, counts, and external Apify run ID when
   available. Never log the token, Actor input, raw dataset item, or stack
   trace as a user-facing message.
2. Wrap each scheduled `runsService.start(search.id)` call in its own
   `try/catch`. Log that search's failure and continue to the next due search.
   Keep the current serial scheduler; do not add concurrent scheduling.
3. Add `GET /health`. It must execute a lightweight database query such as
   `SELECT 1`, return a small status payload on success, and return a 503
   without credentials or stack details when the database is unavailable.
4. Update the Recent runs table in `src/views/searches.ejs` to show:
   - completion status;
   - the partial/failure reason;
   - collection provider;
   - Actor ID;
   - external run ID.

   Render absent provenance as `—`, not as a fabricated Apify value.
5. Add CI steps that install dependencies, run typecheck, test, build, and
   migration validation against a disposable PostgreSQL service. CI must use
   disabled collection flags and no real `APIFY_TOKEN`.
6. Add a PostgreSQL integration test suite that covers:
   - first insert and same-source upsert;
   - a changed listing refresh;
   - a partial run leaving missing jobs active;
   - a complete run making missing jobs unavailable;
   - an expired listing closing through the existing lifecycle helper.

**Verify:**

```bash
npm run typecheck
npm test
npm run build
npm run migration:validate
```

Then start the application against a migrated database and request:

```bash
curl --fail http://localhost:3000/health
```

The response must be successful only while PostgreSQL is reachable.

## Required test matrix

Run these tests without a live token:

1. Configuration gates: disabled global/source flags, missing token, bad
   limits, and bad timeout never call the client.
2. Input builders: allowed keys map correctly; unknown or conflicting keys are
   rejected.
3. Mappers: valid fixtures map correctly; malformed items skip safely; enum
   and date handling are deterministic.
4. Dataset pagination: a mock client returns several pages and all pages are
   consumed.
5. Collector integration: provenance and `skippedCount` are returned from
   source collectors.
6. Runs service: provenance persists; partial/failed status and messages are
   truthful; no partial run changes availability.
7. Jobs integration: upsert and complete-versus-partial lifecycle behavior
   work against PostgreSQL.
8. Scheduler: one duplicate/disabled/failing saved search does not prevent
   later due searches from running.
9. Direct-access regression: no collector runtime file reintroduces direct
   source-page fetching or URL construction.
10. Health endpoint: database success and database failure responses are
    correct.

## Bounded manual smoke test

Run this only after Checkpoint A, with an authorized token and deliberate
cost approval.

1. Keep `COLLECTION_ENABLED=false` until the ready-to-test source is chosen.
2. Enable only one source:

   ```env
   COLLECTION_ENABLED=true
   APIFY_LINKEDIN_ENABLED=true
   APIFY_LINKEDIN_MAX_RESULTS=10
   ```

3. Start the app against a migrated disposable database.
4. Create one saved search and run it once.
5. Verify its newest `collection_runs` row has:
   - `status = partial` unless a validated completeness signal exists;
   - `collection_provider = apify`;
   - the configured Actor ID;
   - a non-empty external Apify run ID;
   - counts matching valid deduplicated records.
6. Confirm the dashboard displays the same status, reason, and provenance.
7. Disable the source again after the probe. Repeat separately for XING.

Do not use an unbounded Actor setting, a recurring schedule, or both sources
at once for the first smoke test.

## Final acceptance checklist

- [ ] No runtime collector code requests LinkedIn or XING directly.
- [ ] No direct HTML parser or source-host allowlist remains.
- [ ] A disabled/misconfigured run makes no Actor or source request and
      records a safe failure.
- [ ] An enabled source uses its configured Apify Actor, reads every dataset
      page, validates records, deduplicates by stable source ID, and persists
      normalized jobs.
- [ ] Every successful or partial run records `apify`, Actor ID, and external
      Apify run ID.
- [ ] Malformed records are skipped, counted, and reported as partial without
      changing job availability.
- [ ] Capped or uncertain collection never marks missing jobs unavailable.
- [ ] The app starts with `DB_SYNCHRONIZE=false` after migrations run.
- [ ] Typecheck, unit tests, PostgreSQL integration tests, build, and migration
      validation pass.
- [ ] CI never needs a live Apify token.
- [ ] A bounded, authorized manual smoke test passes for each approved Actor.
- [ ] README, `.env.example`, runtime behavior, and dashboard all describe the
      same Apify-only model.
