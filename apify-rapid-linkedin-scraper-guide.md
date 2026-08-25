# Using Apify's Rapid LinkedIn Jobs Scraper

This guide explains how to use the [`worldunboxer/rapid-linkedin-scraper`](https://apify.com/worldunboxer/rapid-linkedin-scraper) Actor for bounded LinkedIn job-listing collection.

> Scope: this is a usage and integration guide for the Apify Actor. It does not enable or change the application's built-in direct LinkedIn collector.

## What the Actor does

The Actor searches public LinkedIn job listings without supplying a LinkedIn account or cookies. It accepts search titles, locations, companies, and job filters, then writes structured job records to an Apify dataset.

The Actor page displayed pricing of **from $0.45 per 1,000 results** when this guide was reviewed. That is an Actor-store price, not a fixed billing quote: confirm current pricing and estimate the number of returned records before scheduling a run.

The Actor's current OpenAPI schema accepts `jobs_entries` from `10` to `100000`, with a default of `1000`. Its README still describes support for up to 10,000 jobs. Treat the current **Input** tab and OpenAPI schema as authoritative, and start with 10 results regardless of the documented upper limit.

## Before you start

1. Review LinkedIn's current terms, the permitted purpose for collection, and applicable privacy law.
2. Define the minimum fields and retention period needed for the job-search use case.
3. Create an Apify account and ensure this Actor is available to it.
4. Start with an explicit, small `jobs_entries` value. Do not begin with the default `1000` or a large search universe.
5. Store an Apify token only in a local environment variable or secret manager. Never commit it to this repository.

“No login required” means the Actor does not need your LinkedIn credentials. It does not establish that a particular collection, retention, or reuse is authorized.

## Run a safe first search in Apify Console

1. Open the [Actor page](https://apify.com/worldunboxer/rapid-linkedin-scraper) and sign in to Apify.
2. Select **Input**.
3. Paste the bounded input below.
4. Select **Start**.
5. When the run completes, inspect both **Log** and **Dataset** before increasing volume.
6. Export the dataset only after confirming the record shape and result count are suitable.

```json
{
  "jobs_titles": ["software engineer"],
  "location": "Germany",
  "cities": ["Berlin"],
  "jobs_entries": 10,
  "experience": "Mid-Senior",
  "employment_type": "Full-time",
  "work_arrangement": "Hybrid",
  "posted_within": "Past Week",
  "easy_apply": false
}
```

This request has a clear search target and a hard result cap. A returned count below 10 does not necessarily mean the Actor failed; it can mean fewer postings matched the full filter combination.

## Configure the input

### Search targets

- `jobs_titles` — array of job-title queries. This is the canonical field for new integrations. The Actor searches each supplied title and merges the results.
- `job_title` — legacy single-title field. If it is supplied with `jobs_titles`, the values are combined rather than one replacing the other. Avoid it in new input to prevent accidental extra searches.
- `location` — broad location or full search string, such as `"Germany"`, `"Worldwide"`, or `"San Francisco, CA"`.
- `cities` — optional array of specific cities. Set `location` to the relevant country or region when using it; the Actor loops through each city.
- `company_names` — optional array that restricts results to named companies.

Multiple titles and cities expand the number of searches. Test one title and one city first, then increase scope intentionally.

### Volume control

- `jobs_entries` — requested maximum number of job listings. The current schema requires an integer between `10` and `100000`, defaulting to `1000`.

Use `10` for the first validation run, then raise the cap only after reviewing the dataset, expected cost, and downstream deduplication behavior. Treat it as a request limit, not a guarantee that every matching listing will be returned.

### Supported filters

Use the exact human-readable values below:

- `experience`: `Intern`, `Assistant`, `Junior`, `Mid-Senior`, `Director`, or `Executive`.
- `employment_type`: `Full-time`, `Part-time`, `Contract`, `Temporary`, `Volunteer`, `Internship`, or `Other`.
- `work_arrangement`: `On-site`, `Remote`, or `Hybrid`.
- `posted_within`: `Any Time`, `Past 24 hours`, `Past Week`, or `Past Month`.
- `easy_apply`: Boolean. Set to `true` only when jobs with LinkedIn's simplified application flow are specifically required.

`job_post_time` is an advanced custom recency filter. It overrides `posted_within` and uses an `r` prefix followed by seconds: `r86400` requests one day and `r172800` requests two days.

Do not use the obsolete inputs in new integrations:

- `start_jobs` has no effect.
- `experience_level` is legacy; use `experience`.
- `job_type` is legacy; use `employment_type`.
- `work_schedule` is legacy; use `work_arrangement`.

The Actor README contains older names for some fields. The current OpenAPI schema explicitly marks the fields above as legacy, so use the canonical names even if a README example differs.

## Common input examples

### Remote jobs across a broad region

```json
{
  "jobs_titles": ["backend engineer", "platform engineer"],
  "location": "Europe",
  "jobs_entries": 25,
  "work_arrangement": "Remote",
  "posted_within": "Past 24 hours",
  "easy_apply": false
}
```

### Company-restricted search

```json
{
  "jobs_titles": ["data analyst"],
  "location": "United Kingdom",
  "cities": ["London"],
  "company_names": ["Example Company"],
  "jobs_entries": 10,
  "employment_type": "Full-time",
  "posted_within": "Past Week"
}
```

### Custom two-day recency window

```json
{
  "jobs_titles": ["product manager"],
  "location": "Canada",
  "jobs_entries": 10,
  "job_post_time": "r172800"
}
```

Do not send `posted_within` and `job_post_time` expecting both filters to apply; the custom field takes precedence.

## Inspect and export the results

Each completed run writes its records to the run's default Apify dataset. In Apify Console, open **Dataset** to inspect records and export them as JSON, CSV, XML, Excel, HTML table, RSS, or JSONL.

The Actor documents these job-level fields:

- Identity and links: `job_id`, `job_url`, `apply_url`, and `search_keyword`.
- Core job data: `job_title`, `location`, `time_posted`, `salary_range`, `job_description`, and `job_description_raw_html`.
- Company data: `company_name`, `company_url`, and `company_logo_url`.
- Classification data: `seniority_level`, `employment_type`, `job_function`, `industries`, and `easy_apply`.
- Optional enrichment: `num_applicants` and `contact_email`.

Fields may be absent or empty for individual listings. In particular, `time_posted` is documented as relative text such as `"2 days ago"`; it is not a stable ISO timestamp.

Minimize personal-data handling. `contact_email` is extracted from a job description when present, but it is not required by this application’s job model and should not be persisted by default.

## Use the Actor programmatically

Install the official Apify client only when implementing an Apify-backed collector:

```bash
npm install apify-client
export APIFY_TOKEN="replace-with-an-Apify-token"
```

Run this from an async TypeScript context:

```ts
import { ApifyClient } from 'apify-client';

const token = process.env.APIFY_TOKEN;

if (!token) {
  throw new Error('APIFY_TOKEN is required.');
}

const client = new ApifyClient({ token });
const input = {
  jobs_titles: ['software engineer'],
  location: 'Germany',
  cities: ['Berlin'],
  jobs_entries: 10,
  posted_within: 'Past Week',
};

const run = await client
  .actor('worldunboxer/rapid-linkedin-scraper')
  .call(input);
const { items } = await client.dataset(run.defaultDatasetId).listItems();

console.dir(items);
```

`call()` waits for the run to complete, then `defaultDatasetId` identifies the dataset containing the job records. For large runs, retrieve dataset pages rather than assuming one `listItems()` response contains the full result set.

The Actor also exposes a synchronous dataset endpoint through Apify's REST API:

```bash
curl --fail-with-body \
  -X POST "https://api.apify.com/v2/acts/worldunboxer~rapid-linkedin-scraper/run-sync-get-dataset-items" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${APIFY_TOKEN}" \
  --data '{
    "jobs_titles": ["software engineer"],
    "location": "Germany",
    "jobs_entries": 10
  }'
```

Use the asynchronous run endpoint for long-running or high-volume workflows, then read the returned run's default dataset. Keep tokens out of terminal history, source files, browser URLs, logs, and issue comments where possible.

For manual command-line use, the Actor documents this Apify CLI form:

```bash
printf '%s\n' '{
  "jobs_titles": ["software engineer"],
  "location": "Germany",
  "jobs_entries": 10
}' | apify call worldunboxer/rapid-linkedin-scraper --silent --output-dataset
```

The Actor page also provides an [MCP configurator](https://mcp.apify.com/?tools=actors,docs,worldunboxer/rapid-linkedin-scraper) for MCP-compatible tools. Use that route only when interactive agent access is the intended workflow; an application collector should use the API or official client so its inputs, validation, retries, and persistence remain explicit.

## How this relates to this repository

The existing [`LinkedInJobCollector`](src/collectors/http-job.collectors.ts) directly fetches LinkedIn public pages. Enabling `LINKEDIN_COLLECTION_ENABLED` does **not** make it call this Apify Actor.

To add this Actor later, implement a separate Apify-backed `JobCollector` that:

1. Converts one saved search and its supported filters into a bounded Actor input.
2. Runs `worldunboxer/rapid-linkedin-scraper` and reads every page from the default dataset.
3. Validates and normalizes each record before creating a `CollectedJob`.
4. Deduplicates records by the stable LinkedIn `job_id`.
5. Uses a conservative lifecycle policy for listings not seen in a subsequent run.

The local model can normally map the documented fields as follows:

- `job_id` → `sourceJobId`
- `job_url` → `sourceUrl`
- `apply_url` → `applyUrl`
- `job_title` → `title`
- `company_name` → `companyName`
- `company_url` → `companyUrl`
- `location` → `location`
- `job_description` → `description`
- documented `employment_type` values → the local `EmploymentType` enum where a direct equivalent exists

Set `source` to `JobSource.LINKEDIN`. Map `Part-time`, `Temporary`, `Volunteer`, and `Other` to `EmploymentType.UNKNOWN` unless the local enum is deliberately expanded. Do not derive a listing's `workplaceType` from the search input: the documented dataset fields do not guarantee a per-listing remote, hybrid, or on-site value, so use `WorkplaceType.UNKNOWN` unless an authoritative item field is present.

Leave `publishedAt` and `expiresAt` as `null` unless a future Actor output provides trustworthy absolute timestamps. Parsing the relative `time_posted` text as a database date is brittle. Do not import `contact_email`, raw description HTML, logo URLs, or applicant counts into the current contract without an explicit product and data-governance decision.

This Actor does not document incremental-state inputs such as `stateKey` or change-event output. For scheduled use, maintain deduplication and last-seen state in this application. A capped query is not proof of complete search coverage, so do not mark unseen jobs unavailable merely because they are missing from a partial or capped run.

## Troubleshooting checklist

- No results: start with a single title and broad `location`, then add cities and filters one at a time.
- More results than expected: remove legacy `job_title`; it is combined with `jobs_titles`.
- A filter appears ignored: verify capitalization and exact values, such as `"Full-time"` and `"Past Week"`.
- Unexpected posting-time range: remove `job_post_time` when using `posted_within`, because the custom range overrides it.
- Duplicate listings: deduplicate with `job_id`, especially when multiple titles or cities overlap.
- High cost or slow runs: lower `jobs_entries`, reduce title/city combinations, and inspect the first dataset before scheduling.
- Missing data fields: treat Actor output as sparse and validate required fields before persistence.

## Sources

- [Actor page](https://apify.com/worldunboxer/rapid-linkedin-scraper)
- [Actor Markdown documentation](https://apify.com/worldunboxer/rapid-linkedin-scraper.md)
- [Actor OpenAPI definition](https://api.apify.com/v2/actors/JkfTWxtpgfvcRQn3p/builds/B2HlngCQKJViodqTk/openapi.json)
- [Apify REST API authentication](https://docs.apify.com/api/v2)

Reviewed on 2026-08-08. Actor pricing, input schema, output fields, and supported integrations can change; verify the current Apify Console schema before running a new or scheduled workflow.
