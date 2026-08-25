# Using Apify's Black Falcon Data XING Scraper

This guide explains how to use the [`blackfalcondata/xing-scraper`](https://apify.com/blackfalcondata/xing-scraper) Actor safely and predictably for XING job-market collection.

> Scope: this is a usage guide for the Apify Actor. It does not enable or modify the application's built-in direct XING collector.

## Before you start

1. Review XING's current terms, your intended-use authorization, and applicable privacy law before collecting data.
2. Start with the `jobs` mode. Do not collect employee records, contact information, or company-profile enrichment unless there is a documented business purpose and lawful basis.
3. Create an Apify account and make sure the Actor is available to it.
4. Set a small, explicit result limit for the first run. Never use unbounded collection (`maxResults: 0` or `maxPages: 0`) for an initial or scheduled run.
5. Keep API tokens and webhook credentials in Apify secrets or environment variables. Do not commit them to this repository.

The Actor is paid per result. At the time this guide was reviewed, the Actor page listed `$0.90 / 1,000 results`, with a documented `$0.0005` run-start charge and `$0.0009` per returned record. Verify current pricing in Apify before scheduling recurring work.

## Choose the correct mode

| Mode | Use it for | Avoid it when |
| --- | --- | --- |
| `jobs` | Collecting job listings by keyword, location, filters, or pasted XING job/search URLs | You need a company entity or employee list instead |
| `companyProfiles` | Looking up company metadata from a company slug or XING company URL | A job-search run is sufficient |
| `companyEmployees` | A narrowly authorized employee-roster use case | Building a job collector or collecting personal data without a documented need |

Use one mode per run. For the `job_scraper` project, `jobs` is the appropriate mode.

## Run a safe first job-search probe

In Apify Console:

1. Open the [XING Scraper Actor](https://apify.com/blackfalcondata/xing-scraper).
2. Select the **Input** tab.
3. Paste a tightly scoped input such as the following.
4. Select **Start**.
5. Wait for the run to finish, then inspect the **Dataset** and **Log** tabs before increasing scope.

```json
{
  "mode": "jobs",
  "queries": ["backend engineer"],
  "locations": ["Berlin"],
  "country": ["DE"],
  "maxResults": 10,
  "maxPages": 1,
  "includeDetails": true,
  "descriptionFormat": "text",
  "descriptionMaxLength": 4000,
  "compact": false,
  "excludeEmptyFields": true
}
```

This is deliberately bounded to ten results and one page. The Actor documents that detail enrichment is enabled by default, but declaring `includeDetails` explicitly makes the run's behavior clear and repeatable.

## Configure a normal job-search run

### Search targets

- `queries` is an array of job-search keywords.
- `locations` is an array of cities or regions. Leave it empty only when a country-wide search is intentional.
- The Actor evaluates multiple queries and locations as a Cartesian product. For example, two queries and three locations can create six searches, so increase limits only after estimating the resulting volume.
- `startUrls` is an alternative to `queries` and `locations` when you want to scrape a specific XING job detail URL or a saved XING search URL.

### Filters

Use only filters relevant to the collection objective:

- `country` — country code filter.
- `locationRadius` — radius in kilometres around each supplied location; the documented default is `30`.
- `employmentType` — one or more values, such as `FULL_TIME`.
- `careerLevel` — one or more values, such as `PROFESSIONAL`.
- `discipline` and `industry` — functional-area and industry filters.
- `remote` or `remoteOption` — remote-work filters.
- `salaryMin`, `salaryMax`, and `daysOld` — optional salary and recency constraints.

Use the Actor's current input schema when selecting enum values; it is the source of truth if values change.

### Volume and payload controls

| Input | Recommended use |
| --- | --- |
| `maxResults` | Set a hard maximum for the entire run. Use a small number for testing; `0` means unlimited. |
| `maxPages` | Bound pages per query/location combination. `0` means unlimited; do not use it without an explicit collection budget. |
| `includeDetails` | Include full job detail data, including descriptions and apply fields. |
| `includeCompanyProfile` | Add deeper company enrichment only when needed; the Actor documents roughly one additional second per unique company. |
| `descriptionMaxLength` | Limit description size for lower storage, transfer, and LLM-context cost. `0` means no truncation. |
| `descriptionFormat` | Choose `text`, `html`, `markdown`, or `all`. Prefer one format rather than `all` unless every representation is needed. |
| `compact` | Return core fields only. Prefer it for MCP/LLM workflows that do not need the full job description. |
| `excludeEmptyFields` | Omit null, empty-string, and empty-array fields to reduce payload size. |

Example filtered search:

```json
{
  "mode": "jobs",
  "queries": ["software engineer"],
  "locations": ["Hamburg"],
  "country": ["DE"],
  "employmentType": ["FULL_TIME"],
  "careerLevel": ["PROFESSIONAL"],
  "remote": true,
  "daysOld": 14,
  "maxResults": 50,
  "maxPages": 3,
  "includeDetails": true,
  "descriptionFormat": "text",
  "excludeEmptyFields": true
}
```

## Use paste mode for an existing XING URL

Use `startUrls` when a browser search has already produced the exact job or search URL you need. Do not combine this workflow with broad, unbounded queries.

```json
{
  "mode": "jobs",
  "startUrls": [
    {
      "url": "https://www.xing.com/jobs/search?keywords=data%20scientist&location=Berlin"
    }
  ],
  "maxResults": 25,
  "maxPages": 2,
  "includeDetails": true,
  "descriptionFormat": "text",
  "excludeEmptyFields": true
}
```

## Set up recurring incremental monitoring

For recurring monitoring, run a successful bounded baseline first. Then configure an Apify schedule with the same search definition and a stable `stateKey`.

```json
{
  "mode": "jobs",
  "queries": ["product manager"],
  "locations": ["München"],
  "country": ["DE"],
  "maxResults": 100,
  "maxPages": 5,
  "includeDetails": true,
  "descriptionFormat": "text",
  "incrementalMode": true,
  "stateKey": "xing-jobs:product-manager:munich:de",
  "skipReposts": true,
  "emitUnchanged": false,
  "emitExpired": true,
  "excludeEmptyFields": true
}
```

Important incremental-mode behavior:

- Use a unique, stable `stateKey` for each tracked search universe. Changing its query, location, or filters should use a new key so unrelated searches do not share state.
- By default, the Actor emits `NEW`, `UPDATED`, and `REAPPEARED` jobs. Enable `emitUnchanged` or `emitExpired` only when downstream processing needs those events.
- `skipReposts: true` omits listings detected as reposts of previously seen jobs.
- Do not change the collection definition under an existing `stateKey` without treating the next run as a potentially misleading comparison.
- Schedule only after reviewing the baseline dataset and expected cost. Start with a conservative cadence.

## Use company modes only when needed

Company profile lookup:

```json
{
  "mode": "companyProfiles",
  "companyInputs": ["sap"]
}
```

Employee-list lookup:

```json
{
  "mode": "companyEmployees",
  "companyInputs": ["https://www.xing.com/pages/sap/employees"],
  "maxEmployees": 25,
  "employeeSort": "CONNECTION_DEGREE",
  "employeeFilters": {
    "hasPhoto": true
  }
}
```

`companyEmployees` can return personal data such as names, occupation, profile URLs, and photos. Do not use it as part of job collection by default. Establish retention, access, and deletion controls before running it.

## Retrieve results

Each completed run writes structured records to its default Apify dataset. In Apify Console, use the **Dataset** tab to review or export JSON, CSV, or Excel.

Typical job fields include:

- Identity and source: `jobId`, `xingId`, `globalId`, `portalUrl`, `slug`
- Job content: `title`, `description`, `applyUrl`, `employmentType`, `careerLevel`, `discipline`
- Company and location: `company`, `companyId`, `location`, `countryCode`, `remoteOption`
- Compensation: `salaryMin`, `salaryMax`, `salaryCurrency`, `salaryType`
- Dates and lifecycle: `postedDate`, `refreshedAt`, `activeUntil`, `changeType`, `scrapedAt`

For the local `job_scraper` data model, a future Apify adapter would normally map:

| Actor field | Local field |
| --- | --- |
| `xingId` or `jobId` | `sourceJobId` |
| `portalUrl` | `sourceUrl` |
| `applyUrl` | `applyUrl` |
| `title` | `title` |
| `company` | `companyName` |
| `location` | `location` |
| `description` | `description` |
| `postedDate` | `publishedAt` |
| `activeUntil` | `expiresAt` |

Validate the source fields and normalize enum values before saving them. Do not treat the actor's `changeType` as a direct replacement for the application's job lifecycle status without defining that mapping.

## Use the Actor programmatically

The Actor documentation provides this official JavaScript pattern. Keep the token outside source control:

```bash
npm install apify-client
export APIFY_TOKEN="replace-with-an-Apify-token"
```

```ts
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: process.env.APIFY_TOKEN });
const input = {
  mode: 'jobs',
  queries: ['software engineer'],
  locations: ['Berlin'],
  maxResults: 10,
  includeDetails: true,
  descriptionFormat: 'text',
  excludeEmptyFields: true,
};

const run = await client.actor('blackfalcondata/xing-scraper').call(input);
const { items } = await client.dataset(run.defaultDatasetId).listItems();

console.dir(items);
```

For a large dataset, retrieve it with the Apify client's pagination or iteration facilities rather than assuming one response contains every item.

The documented CLI form is:

```bash
printf '%s\n' '{
  "mode": "jobs",
  "queries": ["software engineer"],
  "locations": ["Berlin"],
  "maxResults": 10,
  "includeDetails": true,
  "descriptionFormat": "text",
  "excludeEmptyFields": true
}' | apify call blackfalcondata/xing-scraper --silent --output-dataset
```

## Notifications and webhooks

The Actor supports Telegram, Slack, Discord, WhatsApp Cloud API, and a generic `webhookUrl`. Use a webhook only after confirming:

1. The endpoint authenticates requests.
2. Any authorization header is stored as a secret, not in Git or a shared input template.
3. The receiving service validates the payload and deduplicates events.
4. The notification limit is set deliberately with `notificationLimit`.
5. Incremental notifications use `notifyOnlyChanges: true` when the goal is alerting on new or changed jobs.

Do not add a webhook token to `.env.example`, a committed JSON input file, or this guide.

## How this relates to this repository

The existing `XingJobCollector` in [`src/collectors/http-job.collectors.ts`](src/collectors/http-job.collectors.ts) fetches XING pages directly. Turning on `XING_COLLECTION_ENABLED` does **not** use this Apify Actor.

To use this Actor in the application, implement a separate Apify-backed collector/provider that:

1. Sends the bounded input to `blackfalcondata/xing-scraper`.
2. Waits for the run and reads the default dataset.
3. Maps and validates Actor records into the local `CollectedJob` contract.
4. Treats `NEW`, `UPDATED`, `REAPPEARED`, and `EXPIRED` records according to an explicit lifecycle policy.
5. Keeps `APIFY_TOKEN` in an uncommitted environment variable or secret manager.

Until such an adapter exists, use the Actor independently through Apify Console, the official client, CLI, REST API, or Apify's MCP service.

## Operating checklist

- [ ] The collection purpose, source authorization, and data-retention policy are documented.
- [ ] The first run is bounded by explicit `maxResults` and `maxPages`.
- [ ] The baseline dataset and logs have been reviewed.
- [ ] Incremental searches have a stable, unique `stateKey`.
- [ ] API tokens and webhook credentials are not committed.
- [ ] Personal-data fields are minimized, access-controlled, and retained only as long as necessary.
- [ ] Schedule frequency and cost expectations are reviewed before enabling recurrence.
- [ ] Output mapping, deduplication, and lifecycle handling are tested before importing into this application.

## Sources

- [Actor page](https://apify.com/blackfalcondata/xing-scraper)
- [Actor Markdown documentation](https://apify.com/blackfalcondata/xing-scraper.md)
- Reviewed on 2026-08-08. Actor input schema, pricing, and available options can change; verify the current Apify Console schema before running a new workflow.
