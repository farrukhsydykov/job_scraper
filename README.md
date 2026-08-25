# Job collector MVP

Collect authorized LinkedIn and XING job listings through Apify into PostgreSQL,
refresh their current data and lifecycle status, and review them in a small
server-rendered dashboard.

## Start locally

```bash
cp .env.example .env
```

Edit `.env` before starting the app. Postgres values match
`docker-compose.yml`; use the local compose override if port 5432 is already in
use. Run the schema migrations before starting:

```bash
npm install
docker compose up -d postgres
npm run migration:run
npm run start:dev
```

Open `http://localhost:3000` to view collected jobs and
`http://localhost:3000/dashboard/searches` to create a saved search and click
**Run now**. Collection remains disabled until the Apify gates below are
configured. Startup logs print the loaded collection configuration.

## Source collection

Collection is disabled by default. An enabled run requires all of the following
in `.env`:

```env
COLLECTION_ENABLED=true
APIFY_TOKEN=replace-with-an-authorized-token
APIFY_LINKEDIN_ENABLED=true
# or APIFY_XING_ENABLED=true
APIFY_LINKEDIN_MAX_RESULTS=10
```

The result limit is an explicit cost and lifecycle bound. Keep it small until
the Actor output has been reviewed and authorized for the intended use.
Missing or invalid configuration records a blocked run without calling Apify.
The application does not use source credentials, direct source requests, or
access-control evasion.

Apify dataset results are validated, deduplicated, and read page by page. Runs
are marked `partial` when coverage is uncertain or malformed records are
skipped; partial runs never mark existing jobs unavailable.

## MVP behavior

- Saved searches run manually or on their configured 15–1440 minute interval.
- Each search stores a result cap (1–100, with LinkedIn requiring at least 10),
  a 1–15 minute run window, and bounded request/page pacing with optional
  jitter. The saved-search cap cannot exceed the stricter per-source
  `APIFY_*_MAX_RESULTS` environment cap.
- Because source requests execute inside authorized Apify Actors, the dashboard
  pacing controls delay this app's bounded dataset-page requests; Actor-level
  source pacing remains governed by the approved Actor contract.
- Jobs upsert by `(source, source_job_id)`.
- Re-observed jobs refresh stored fields and return to `active`.
- A fully covered run marks listings missing from all of their saved searches
  `unavailable`.
- Explicit source closure or an expired listing marks a job `closed`.
- Every run records its requested budget, progress, outcome, and the jobs found
  by that run. The searches dashboard exposes those results in a collapsible
  clickable list.
- Changing a brief's source through the dashboard clears source-specific
  filters unless a new valid filter object is supplied.
- Descriptions are stored as normalized plain text with paragraph and list
  breaks preserved. Source HTML is never rendered or persisted.
- The dashboard supports source, status, keyword, location, workplace,
  employment type, and published-date filters.

## Commands

```bash
npm run typecheck
npm test
npm run build
npm run migration:validate
npm start
```
