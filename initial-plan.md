# Initial plan: job-listing collection API

## Direction

Do not build direct LinkedIn or XING scrapers for production. Apify offers actors for both, but it does not make collection sanctioned: it moves the scraping infrastructure and maintenance to a third party.

| Source | Direct scraping | Apify actor | Recommendation |
| --- | --- | --- | --- |
| LinkedIn | Maximum control, but bot detection, proxies, parsing breakage, and account/IP enforcement are your responsibility. LinkedIn explicitly prohibits scripts, robots, crawlers, and copying its service data. | Faster integration and managed proxies. The current [`bebity/linkedin-jobs-scraper`](https://apify.com/bebity/linkedin-jobs-scraper) is a community actor, currently priced at $29.99/month plus platform usage. Legal/platform risk remains unchanged. | Do not use without explicit legal approval and a narrowly scoped use case. Prefer licensed feeds or direct employer/ATS sources. |
| XING | Same operational responsibility and XING's terms prohibit unauthorized scripts and copying website content. | Apify has [`shahidirfan/xing-jobs-scraper`](https://apify.com/shahidirfan/xing-jobs-scraper), aimed at DACH listings. It supports keyword, location, date filters, and structured detail output; currently $1/1,000 results. It uses XING GraphQL and residential proxies, so it is also fragile and not an official integration. | Suitable only for a controlled, approved pilot. It is not a compliant substitute for a licensed feed. |

Neither official platform API solves aggregation:

- LinkedIn's [Job Posting API](https://learn.microsoft.com/en-us/linkedin/talent/job-postings/api/overview?view=li-lts-2025-04) is partner-gated and designed to publish/manage an organization's jobs, not search the full market.
- XING's [E-Recruiting API](https://dev.xing.com/partners/job_integration/api_docs) supports contracted customers publishing/managing their own ads, not market-wide search.

## NestJS architecture

```text
Scheduler / manual API
        |
        v
Ingestion Run (queued)
        |
        +-- Source adapter: LinkedIn / XING / future licensed feeds
        |       +-- fetch -> validate -> map to canonical job
        |
        v
Raw source record + normalized occurrence
        |
        v
Deduplication / job canonicalization
        |
        v
PostgreSQL -> search/read API
```

Modules:

- `SourcesModule`: source registry, credentials, enabled/disabled status, terms URL, and retention policy.
- `IngestionModule`: queue-backed runs, retries, throttling, run logs, and manual replays.
- `ProvidersModule`: one adapter per source; Apify is an implementation detail rather than a domain dependency.
- `JobsModule`: canonical records, deduplication, lifecycle/status, and search API.
- `ComplianceModule`: provenance, deletion/takedown workflow, field redaction, and retention controls.
- `ObservabilityModule`: source success rate, empty-result alerts, schema-drift alerts, and ingestion latency.

Use a provider contract so an Apify actor can later be replaced with a licensed API or feed without changing the public API or data model:

```ts
interface JobSourceProvider {
  readonly source: 'linkedin' | 'xing';
  collect(query: SourceQuery, runId: string): AsyncIterable<SourceJob>;
}
```

## Data model

- `source_queries`: source, keyword, location, filters, and schedule.
- `ingestion_runs`: query, status, actor run ID, item counts, errors, and timestamps.
- `source_job_records`: immutable source ID, source URL, normalized payload, payload checksum, and first/last-seen timestamps.
- `jobs`: canonical title, employer, location, remote mode, employment type, description, application URL, and published/expiry timestamps.
- `job_occurrences`: link between a canonical job and each source listing.

Deduplicate first by `source + externalJobId`; only then use a conservative fingerprint such as normalized `company + title + city + application URL`. Do not merge records based only on title or description.

## API surface

- `POST /v1/ingestion-runs`: trigger a configured source query.
- `GET /v1/ingestion-runs/:id`: return source-level status and errors.
- `GET /v1/jobs`: filter by keyword, location, remote, source, and posted date.
- `GET /v1/jobs/:id`: return a canonical job with provenance.
- `DELETE /v1/source-records/:source/:externalId`: execute the takedown/removal workflow.
- Internal-only endpoints manage source configuration and scheduled queries.

## Pilot

1. Establish legal and product boundaries: decide whether data is for internal analytics, job discovery links, or republishing; obtain approval for each source; and avoid ingesting contact emails or other personal data by default.
2. Build the generic ingestion pipeline with a fixture provider first, so it is testable without external scraping.
3. Add Apify adapters behind `APIFY_LINKEDIN_ENABLED` and `APIFY_XING_ENABLED` feature flags.
4. Run a small German-market evaluation across Berlin, Munich, Hamburg, remote roles, several keywords, and fresh-listing windows. Measure completeness, duplicate rate, stale postings, actor failures, and per-listing cost.
5. Promote only approved sources that meet quality criteria; otherwise replace those adapters with licensed feeds or direct employer ATS integrations.

Key evidence: the [LinkedIn User Agreement](https://www.linkedin.com/legal/user-agreement) prohibits automated scraping; [XING's terms excerpt](https://faq.xing.com/en/security/blocked-xing-profile) prohibits unauthorized mechanisms/scripts and copying content.
