# Apify Actor contracts

## Status: pending authorization checkpoint

No live Actor probe has been run from this repository, and no representative
dataset fixtures are committed yet. This document is deliberately not an
approval to enable collection. The current adapters use the provisional field
names in the repository integration guides and remain disabled by default.

Before either source is enabled, an authorized operator must run one probe per
Actor with at most 10 requested results, inspect the Actor logs and dataset,
and replace this status with the observed contract. Commit only sanitized
records: never include tokens, contact emails, raw HTML descriptions, or full
Actor responses.

## Provisional contracts from repository guides

| Source | Actor ID | Stable ID | Required fields | Supported output mapping |
| --- | --- | --- | --- | --- |
| LinkedIn | `worldunboxer/rapid-linkedin-scraper` | `job_id` | `job_id`, `job_url`, `job_title` | `apply_url`, `company_name`, `company_url`, `location`, `job_description`, `employment_type` |
| XING | `blackfalcondata/xing-scraper` | `xingId`, then `jobId` only if the probe confirms the fallback is safe | stable ID, `portalUrl`, `title` | `applyUrl`, `company`, `location`, `description`, `employmentType`, `postedDate`, `activeUntil` |

The application currently treats capped Actor runs as partial coverage. It does
not use LinkedIn relative posting times, XING `changeType`, external remote
options, company-profile modes, employee modes, incremental state, webhooks,
or any raw/personal-data fields.

## Required probe record

After approval, record all of the following for each Actor:

1. Actor ID and review date.
2. Exact input fields, allowed values, and the bounded input used.
3. Actual output field names and types.
4. Confirmed stable identity behavior, particularly the XING `xingId` fallback.
5. URL, title, employer, location, date, and classification mappings.
6. Fields excluded from persistence.
7. Whether the Actor provides a trustworthy complete-coverage signal.

Update mapper tests and add one sanitized fixture per source before enabling a
new or changed live contract.
