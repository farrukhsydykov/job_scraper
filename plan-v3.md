# MVP plan: LinkedIn and XING job collection

## Goal

Collect jobs from LinkedIn and XING, keep the latest listing data and lifecycle status in PostgreSQL, and provide a small dashboard to review the collected jobs.

Automated collection from either platform must be enabled only when its terms and the account's authorization permit it. The collectors must not use credentials shared by users, CAPTCHA bypassing, or other access-control evasion.

## MVP user flow

1. An administrator creates a saved search for LinkedIn or XING.
2. A scheduler, or the dashboard's **Run now** control, runs that search.
3. The source collector returns listings, which are validated and upserted into PostgreSQL.
4. Re-observed listings refresh their data and return to `active`; material changes update the stored values.
5. After a successful complete run, listings absent from that search become `unavailable`. Only explicit source evidence or an expiry date marks a listing `closed`.
6. The dashboard lists jobs and lets the administrator filter and open a job's details.

## Scope

### In scope

- LinkedIn and XING collectors behind separate enablement flags.
- Configured keyword, location, and source filters.
- Manual runs and a simple periodic schedule.
- PostgreSQL persistence, same-source upserts, data refresh, and status updates.
- A dashboard for jobs, search runs, and basic filtering.

### Out of scope

- AI extraction, matching, ranking, recommendations, or user preference profiles.
- Cross-source deduplication. A LinkedIn listing and a XING listing remain separate records.
- Multi-tenant accounts, RBAC, audit logs, source approval workflows, or retention automation.
- Redis, queues, outbox processing, object storage, and generic provider marketplaces.
- Full raw-payload storage, recruiter contact details, job applications, notifications, and public APIs.
- Automatic job application submission or account automation.

## Minimal architecture

```text
Dashboard / scheduler
         |
         v
  collection run
         |
         v
LinkedIn collector / XING collector
         |
         v
 validate + normalize + upsert
         |
         v
     PostgreSQL
         |
         v
 dashboard reads jobs and runs
```

Use one NestJS application process:

- A source-specific collector returns normalized source listings.
- A scheduled task starts enabled saved searches one at a time.
- The same ingestion service serves manual runs.
- PostgreSQL is the only required runtime dependency.
- The dashboard is a small server-rendered UI or minimal client using the existing web stack; do not introduce a separate frontend service.

## Data model

### `saved_searches`

```text
id
source                  linkedin | xing
keyword
location
filters_json
enabled
schedule_minutes
last_completed_at
last_attempted_at
created_at
updated_at
```

### `collection_runs`

```text
id
saved_search_id
source
status                  running | succeeded | partial | failed
coverage_complete
started_at
finished_at
found_count
upserted_count
error_message
```

### `jobs`

```text
id
source
source_job_id
source_url
apply_url
title
company_name
location
workplace_type          remote | hybrid | onsite | unknown
employment_type         full_time | part_time | contract | internship | unknown
description
published_at
expires_at
status                  active | unavailable | closed
data_hash
first_seen_at
last_seen_at
created_at
updated_at
```

### `job_searches`

```text
saved_search_id
job_id
is_available
first_seen_at
last_seen_at
```

Enforce a unique constraint on `(source, source_job_id)`. `job_searches` is needed because a listing can be returned by multiple saved searches; it prevents one incomplete match from making a job unavailable globally. Store only fields needed to view a job and link to its source or application. Do not persist session data, cookies, browser traces, or raw responses.

## Collection and update rules

- Each collector accepts one `saved_search` and returns a stable source job ID, source URL, and the supported job fields.
- Validate required identifiers and URLs before persistence. Missing optional fields remain `null`.
- Upsert by `(source, source_job_id)`.
- On every observation, update the job fields, `data_hash`, `last_seen_at`, and set `status` to `active`.
- A changed `data_hash` means the source data has changed; overwrite the current job values. The MVP does not retain field-level history.
- Mark a missing search-to-job link unavailable only when pagination completed successfully; mark the job `unavailable` only when no active saved search still observes it. Do not change statuses after failed or partial runs.
- Mark a job `closed` only when the source explicitly reports closure, the listing has an expiry date in the past, or a checked listing page confirms it is closed.
- Collectors stop and report a failed run on access-control, policy, or CAPTCHA responses.

## Dashboard

Provide three small views:

1. **Jobs** — default view with newest/last-seen ordering and filters for source, status, keyword, location, remote mode, and published date.
2. **Job detail** — current stored fields, first/last seen times, status, and links to the source and application.
3. **Runs and searches** — saved searches, last result, enable/disable control, and a manual **Run now** action.

Show empty, loading, and failed-run states. Pagination can use a simple limit and cursor.

## Endpoints

```text
GET    /jobs
GET    /jobs/:id
GET    /saved-searches
POST   /saved-searches
PATCH  /saved-searches/:id
POST   /saved-searches/:id/runs
GET    /collection-runs
GET    /collection-runs/:id
```

The dashboard is the only planned consumer of these endpoints in the MVP, so add only the fields it needs.

## Implementation sequence

1. Create the PostgreSQL schema and job/search/run modules.
2. Implement the shared validation and same-source upsert/status-update service, with fixture-based tests.
3. Add the LinkedIn and XING collectors behind independent configuration flags and run them only when authorized.
4. Add scheduling and the dashboard views.
5. Test successful refreshes, changed job data, failed/partial runs, unavailable transitions, explicit closure, and dashboard filters.

## MVP acceptance criteria

- An enabled LinkedIn or XING saved search can be run manually.
- A successful run creates jobs in PostgreSQL.
- Re-running a search updates existing jobs rather than creating duplicates.
- Changed source fields appear in the job detail page.
- A complete successful run marks missing listings `unavailable`; failed or partial runs do not.
- The dashboard can filter and view collected jobs and displays each run's result.
