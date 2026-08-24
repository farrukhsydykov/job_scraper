# Job collector MVP

Collect LinkedIn and XING job listings into PostgreSQL, refresh their current
data and lifecycle status, and review them in a small server-rendered dashboard.

## Start locally

```bash
cp .env.example .env
```

Edit `.env` before a test run. There are no API keys. Postgres values already
match `docker-compose.yml`. For a local pipeline test that does not call
LinkedIn or XING, set:

```env
COLLECTION_ENABLED=true
LINKEDIN_COLLECTION_ENABLED=true
XING_COLLECTION_ENABLED=true
COLLECTION_MODE=fixture
```

Then start the stack:

```bash
docker compose up -d postgres
npm install
npm run start:dev
```

Open `http://localhost:3000` to view collected jobs and
`http://localhost:3000/dashboard/searches` to create a saved search and click
**Run now**. Fixture mode reads HTML from `fixtures/` and should insert sample
jobs. Startup logs print the collection flags that were loaded from `.env`.

## Source collection

Collection is disabled by default until you turn it on in `.env`:

```env
COLLECTION_ENABLED=false
LINKEDIN_COLLECTION_ENABLED=false
XING_COLLECTION_ENABLED=false
COLLECTION_MODE=fixture
```

`COLLECTION_MODE=fixture` is the local test path. Set `COLLECTION_MODE=live`
only when the collection path is authorized for that account and use case.
The collectors do not use login credentials, CAPTCHA bypasses, or
access-control evasion. They stop a run on `401`, `403`, `429`, CAPTCHA, or
access-denied responses.

Set both the global flag and the source flag to `true` only after that
authorization is in place. `SOURCE_MAX_PAGES` bounds one run; the run is marked
`partial` if pagination cannot be confirmed as complete, and partial runs never
mark existing jobs unavailable.

## MVP behavior

- Saved searches run manually or on their configured 15–1440 minute interval.
- Jobs upsert by `(source, source_job_id)`.
- Re-observed jobs refresh stored fields and return to `active`.
- A fully covered run marks listings missing from all of their saved searches
  `unavailable`.
- Explicit source closure or an expired listing marks a job `closed`.
- The dashboard supports source, status, keyword, location, workplace,
  employment type, and published-date filters.

## Commands

```bash
npm run typecheck
npm test
npm run build
npm start
```
