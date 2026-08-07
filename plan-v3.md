# Plan v3: compliant, source-independent job discovery API

## 1. Executive decision

Build a NestJS backend for personal job discovery, not a generic web scraper. The system collects approved job data, normalizes it into a single catalogue, preserves observed history, and optionally ranks jobs against a user's explicit preferences.

The collection layer must be replaceable. An API, licensed feed, Apify Actor, or explicitly authorized browser integration can be swapped without changing the job API, database model, or ranking pipeline.

**Initial source policy**

| Source type | Production status | Rationale |
| --- | --- | --- |
| Official API or licensed job feed | Preferred | Contractual entitlement and the most stable data contract |
| Direct employer/ATS feed | Preferred after permission review | Clearer provenance and application destination |
| XING via Apify | Pilot only, feature-gated, after approval | The available actor is not an official XING integration |
| LinkedIn via Apify or direct browser collection | Disabled by default | LinkedIn prohibits automated scraping in its [User Agreement](https://www.linkedin.com/legal/user-agreement) |
| Any unapproved browser/network collection | Prohibited in production | A public page or JSON response is not automatically a supported API |

XING's [terms excerpt](https://faq.xing.com/en/security/blocked-xing-profile) also prohibits unauthorized mechanisms/scripts and copying content. Apify changes operational ownership, not entitlement or platform-policy risk.

## 2. Scope and non-goals

### In scope

- Germany/DACH-oriented job discovery, with multilingual descriptions and location data.
- Search profiles generated from explicit role aliases, locations, and work preferences.
- Canonical job search, source provenance, lifecycle history, and outbound application links.
- Optional personal job-to-preference ranking with explanations.
- Administrator-managed sources, schedules, and source-health monitoring.

### Out of scope for the initial release

- Candidate sourcing, employer-side recruitment decisions, application filtering, or automated hiring actions.
- Account automation, credential sharing, CAPTCHA bypassing, anti-bot evasion, or unrestricted crawling.
- Republishing a source's full data without a verified right to do so.
- Automatic job application submission.
- Treating inferred source data as ground truth.

This distinction matters: the EU AI Act identifies recruitment/selection use cases, including targeted job advertising and filtering applications, as potentially high-risk. A personal job-discovery feature should be assessed separately before release, and any employer-facing candidate or advertisement targeting feature requires a formal legal/compliance classification. See [Regulation (EU) 2024/1689](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689), Annex III.

## 3. Architecture

```text
Admin schedule or manual run
          |
          v
Source-query planner ──> policy/budget gate
          |                     |
          v                     v
  source-specific queue ──> JobSourceProvider
                                  |
                                  v
                      source observation (immutable)
                                  |
                                  v
                  validation -> normalization -> deduplication
                                  |
                   +--------------+--------------+
                   v                             v
          PostgreSQL history                outbox event
                                                 |
                                                 v
                                      async extraction/ranking
                                                 |
                                                 v
                                      search and read API
```

### Core implementation choices

- **NestJS** for modular API and worker composition.
- **PostgreSQL** as the source of truth for canonical jobs, history, source configuration, audit records, and user preferences.
- **Redis + BullMQ** for bounded asynchronous work: collection, normalization, enrichment, and ranking.
- **Object storage only when necessary** for allowed artifacts; do not use it as an uncontrolled raw-payload archive.

NestJS supports BullMQ through `@nestjs/bullmq`, and BullMQ supports global worker rate limiting. Use a separate queue or keyed application-level limiter per source: one global limiter cannot express different source policies safely. See the [Nest/BullMQ guidance](https://docs.bullmq.io/guide/nestjs) and [BullMQ rate limiting](https://docs.bullmq.io/guide/rate-limiting).

## 4. Source governance and collector contract

Every source has an auditable configuration:

```text
sourceKey
collectionPath: official_api | licensed_feed | apify | approved_browser
approvalStatus: draft | approved | suspended | disabled
allowedHosts[]
termsUrl
dataUsePurpose
allowedFields[]
retentionPolicy
rateBudget
owner
approvalEvidence
reviewedAt
```

Only `approved` sources may be scheduled. A source configuration change requires an audit event and administrator role; `suspended` immediately blocks new work.

```ts
interface JobSourceProvider {
  readonly sourceKey: string;

  collect(
    query: SourceQuery,
    context: CollectionContext,
  ): AsyncIterable<SourceObservation>;
}
```

`CollectionContext` supplies a run ID, cancellation signal, per-source budget, and correlation IDs. It never supplies shared browser credentials or a mechanism to bypass source controls.

### Collection controls

For a source that explicitly permits browser collection:

- use a real browser only when that collection path is approved;
- use low per-domain concurrency and a source-specific request budget;
- wait for required page state or an expected response rather than relying on fixed sleeps;
- schedule only needed searches, normally a few times per day;
- stop on `401`, `403`, CAPTCHA, access-control, or source-policy signals;
- apply exponential backoff to temporary errors and honor `429`/`Retry-After`;
- never increase parallelism automatically to recover a backlog.

This is load management, not a strategy to appear human or evade controls.

### Structured responses

A documented or authorized JSON response is usually more stable to map than rendered HTML. An observed browser request is not automatically an API: private endpoints may change, expose extra personal data, and retain the same authorization limits as the UI. Unsupported network interception is not eligible for production.

## 5. Query planning

Maintain versioned, explicit query profiles rather than one broad keyword or an uncontrolled Cartesian product.

```text
Role aliases
- Machine Learning Engineer
- ML Engineer
- AI Engineer
- LLM Engineer
- Python Engineer
- Data Engineer
- Backend AI
- MLOps
- Research Engineer

Locations
- Berlin
- Munich
- Hamburg
- Frankfurt
- Remote
- Germany
- EU Remote
```

Normalize source filters separately:

```text
employmentType: full_time | contract | part_time | internship | unknown
workplaceType: remote | hybrid | onsite | unknown
```

`Full Time` and `Contract` are employment types; `Hybrid` and `Remote` are workplace types. Store the original source values alongside the normalized values for troubleshooting.

`source_queries` should contain:

- source key and query-profile version;
- role alias, location, source-specific filters, and generated-query ID;
- schedule, budget, enabled state, and last successful run;
- coverage metadata such as result count, pagination boundary, and source-reported total when available.

The planner should remove invalid combinations before scheduling, cap total work per source, and prioritize recently successful/high-value query profiles.

## 6. Canonical model and data quality

Validate an observation against a source-specific schema before mapping it into a canonical job.

```text
Job
  id, source, sourceJobId, sourceUrl, applyUrl
  title, companyName, companyUrl
  locations[], countryCode
  workplaceType, employmentType
  description, descriptionHash, language
  salary, publishedAt, expiresAt
  requiredSkills[], preferredSkills[]
  visaSponsorship, relocationOffered, germanLanguageRequirement
  firstSeenAt, lastSeenAt
```

Use four related record types:

- `source_observations`: immutable allowlisted fields received in one run, checksum, run ID, and observation timestamp.
- `job_occurrences`: current normalized representation of a source listing.
- `jobs`: canonical record exposed by the API.
- `job_versions` and `job_events`: immutable material changes and lifecycle transitions.

Deduplicate first by `source + sourceJobId`. Cross-source matching creates a **candidate link**, based on normalized company, title, city, and application URL; it must not silently merge records that disagree.

Data-quality rules:

- reject malformed URLs, invalid date ranges, and impossible salaries;
- retain source confidence and field provenance;
- distinguish missing values from inferred values;
- preserve original source title/location for debugging;
- reject or quarantine schema drift rather than silently dropping unknown values;
- paginate read APIs using stable cursors, not offsets.

## 7. History, freshness, and closure

Never overwrite a job's history:

```text
discovered -> seen_again -> updated -> closed -> archived
```

`closed` requires verified source evidence: an explicit closed/expired status, a confirmed source removal rule, or a source-defined expiry date. A missed scan creates `unavailable`, not `closed`, until a source-specific confidence rule is satisfied.

Track:

- source and canonical first/last seen times;
- content hash changes;
- source removal/expiry evidence;
- query coverage and run completeness;
- source freshness and stale-job rate.

This supports reporting on time open, recurring hiring, source reliability, and newly appearing roles without inventing false job status.

## 8. Privacy, security, and retention

Job data can contain personal data, including recruiter names, contact details, and free-text descriptions. Apply field allowlists before persistence; do not save contact emails, user IDs, applicant data, cookies, session data, or browser traces unless a documented purpose and approval require them.

This is consistent with GDPR Article 5's purpose limitation, data-minimisation, accuracy, and storage-limitation principles, and Article 25's data-protection-by-design requirement. See [GDPR](https://eur-lex.europa.eu/eli/reg/2016/679).

Required controls:

- encrypt data in transit and at rest; store vendor credentials in a secret manager, never in source configuration or logs;
- use least-privilege service identities and role-based access control for source management, raw observations, and user preference profiles;
- keep administrative source changes and manual ingestion actions in an audit log;
- redact secrets and personal data from application logs, error reports, queue payloads, and analytics;
- isolate tenants/users in every query; do not expose raw source payloads through public APIs;
- support retention expiry and deletion for user preference profiles and raw observations;
- assess vendor data processing terms, data residency, subprocessors, and cross-border transfers before sending data to Apify or an LLM vendor;
- use outbound network allowlists for collection workers where practical.

## 9. Ranking and extraction

Use deterministic filters first, then perform optional AI-assisted extraction and ranking asynchronously.

**Input:** an allowlisted canonical job and an explicit preference profile: skills, seniority, locations, work preferences, and optional compensation target.

**Output:**

```text
matchScore: 0..100
matched: Python, LLM, AWS, Remote, Senior
missing: Kubernetes
requiredSkills[]
preferredSkills[]
visaSponsorship
salaryMentions
germanLanguageRequirement
relocationOffered
leadershipResponsibilities
evidence[]
```

Guardrails:

- score jobs against user-stated criteria only; do not infer protected or sensitive characteristics;
- present a score as a recommendation, not an eligibility or hiring decision;
- retain model identifier, prompt version, profile version, input hash, output schema version, and evidence;
- cache by `descriptionHash + preferenceProfileVersion + rankingPolicyVersion`;
- validate structured model output before storing it;
- treat job descriptions as untrusted input: isolate them from system instructions, do not allow tool invocation from their content, and reject unexpected output;
- allow users to inspect why a score was assigned and disable ranking.

Before introducing job-ad personalization or any employer-facing candidate ranking, complete a legal and AI-risk assessment. Do not assume a personal ranking feature is outside the EU AI Act's employment provisions.

## 10. API, authorization, and operations

### Initial endpoints

```text
POST   /v1/ingestion-runs                 admin only; enabled queries only
GET    /v1/ingestion-runs/:id             admin/source operator
GET    /v1/jobs                           authenticated search with stable cursor
GET    /v1/jobs/:id                       canonical job, provenance summary, history
POST   /v1/job-matches                    caller's own preference profile only
GET    /v1/jobs/:id/history               provenance and lifecycle events
DELETE /v1/source-records/:source/:id     authorized takedown workflow
```

### Operational requirements

- idempotency key on manual ingestion requests;
- leader/lease protection so schedules do not run twice during a deployment;
- transactional persistence of observations and an outbox event for downstream ranking;
- at-least-once queue processing with idempotent consumers;
- retry classification: transient network failure, source throttling, schema failure, and permanent policy/access failure;
- per-source circuit breaker and automatic suspension after configured failures;
- dead-letter queues with operator review, not infinite retries;
- metrics for run success, valid-record rate, freshness, duplicate rate, source cost, rate-limit events, schema drift, and ranking latency;
- alerts for zero-result anomalies, source policy failures, high stale rate, and raw-data retention violations.

## 11. Test strategy and acceptance gates

Avoid relying on live, unapproved sources in automated tests.

| Layer | Required verification |
| --- | --- |
| Provider | Contract fixtures, pagination, rate-budget behavior, cancellation, and error classification |
| Normalization | Schema validation, enum mapping, bad data quarantine, provenance, and dates/salary edge cases |
| Deduplication | Stable same-source identity and conservative cross-source candidate matching |
| History | Repeated observation, material update, unavailable, closure, and archival transitions |
| Ranking | Structured-output validation, cache behavior, evidence, prompt-injection resistance, and non-sensitive criteria |
| API | Authorization, tenant isolation, cursors, idempotency, and takedown authorization |
| Operations | Retry/backoff, lease conflict, circuit breaker, outbox delivery, and dead-letter review |

A source can move from pilot to regular collection only when it has:

1. documented approval/entitlement and owner;
2. an approved field and retention policy;
3. successful contract and failure-path tests;
4. measured data quality, freshness, and cost within agreed thresholds;
5. monitoring, suspension, and takedown procedures;
6. a documented rollback path.

## 12. Delivery sequence

1. **Foundation:** PostgreSQL schema, source governance, RBAC, audit log, fixture provider, canonical read API, and retention jobs.
2. **Reliable ingestion:** source-query planner, scheduling lease, source queues, rate budgets, idempotent observations, outbox, and observability.
3. **Data quality:** validation, normalization, conservative deduplication, history, and API cursors.
4. **Approved source pilot:** enable one approved source—XING only if approval is recorded—behind a feature flag and bounded query matrix.
5. **Operational review:** assess quality, coverage, cost, source stability, privacy controls, and takedown workflow.
6. **AI assistance:** add structured extraction and optional ranking with user controls, audit metadata, and quality review.
7. **Additional sources:** add licensed or direct employer/ATS integrations through the same adapter contract. Consider LinkedIn only after explicit approval.

## 13. Decisions required before implementation

1. Is the product strictly personal job discovery, or will it ever serve recruiters/employers?
2. Which source entitlements or licensed feeds are available?
3. Can full descriptions be stored, or should the product retain only metadata and an outbound link?
4. What are the retention windows for observations, canonical jobs, and preference profiles?
5. Which identity/tenant model and administrator roles are required?
6. Which LLM vendor, data-processing agreement, and data-residency requirements are acceptable?
7. What quality, freshness, cost, and source-risk thresholds permit a pilot to become regular collection?
