# Multi-tenant architecture — decision proposal (5 → 200+ customers)

**Status:** ✅ **APPROVED 2026-05-05.** All decisions D1-D8, S1, N1-N10, and open questions Q1-Q7 signed off. This is now the canonical architectural record. Implementation may begin against the week-by-week plan in §6. Subsequent revisions to this doc go through the same sign-off block at the bottom.

**Author:** Principal/Staff engineering review, 2026-05-04
**Approved by:** Repository owner, 2026-05-05 (signal: "Agree with all")
**Sibling docs:**
- `docs/MVP_IMPLEMENTATION_ROADMAP.md` — phases (this doc shapes Phase 1.5 / Phase 5 infra)
- `docs/AGENTS_SUBDOMAIN_DEPLOY_RUNBOOK.md` — current Azure layout (marketing site only; this doc adds the platform plane)
- `docs/SCALING_STRATEGY.md` — TS-only-to-1000+-tenants framing
- `docs/ENGINEERING_BOOTSTRAP_DECISIONS.md` — read-path/write-path locks (this doc honors all of them)
- `docs/SPIKE_REPORT_AUDIT_LOG_COMPLETENESS.md` — WI-05 evidence

---

## 1. Why this doc, why now

We have:
- A working `@kavachiq/core` Phase 1 pipeline (normalize → correlate → detect) tested against real WI-05 audit evidence (67 tests, 3 of 4 change classes shipped).
- A live marketing site at `agents.kavachiq.com` with a fixture-driven `/demo` and an `/evidence` page.
- A design partner with a non-prod Microsoft Entra tenant willing to point at our system, with a 6-8 week patience window confirmed.
- Stub services for `@kavachiq/api`, `@kavachiq/workers`, `@kavachiq/execution`. Zero production storage, zero queueing, zero per-tenant credential plumbing.

We are about to write the runtime that takes the existing pure-function pipeline and runs it against real customer tenants. **Every architectural decision made here will be revisited at customer 30+ if we get it wrong.** Some decisions are 1 week to revisit, some are 12. This doc names which is which and recommends a path for each.

**The brief, restated:** design a platform that can carry us from 5 customers (where we are now) to 200+ without an incremental rewrite. Get the irreversible decisions right; defer everything else.

This doc covers two layers: **structural decisions** (D1-D8 — what we build) and **runtime / non-functional decisions** (N1-N10 — how it behaves under load, failure, and replay). Both are required for sign-off.

---

## 2. Decision summary

### Structural decisions

| # | Decision | Recommended | Reversibility | Sign-off |
|---|---|---|---|---|
| D1 | Tenant identity model | Multi-tenant Microsoft app | **Hard** (forces re-onboard) | ✅ |
| D2 | Per-tenant data isolation | Postgres RLS + per-tenant DEK for credentials | **Hard** (rewrite every query) | ✅ |
| D3 | Storage layer | Postgres (state) + Blob (raw archive) | **Hard** (data migration) | ✅ |
| D4 | Job orchestration | Azure Service Bus + Container Apps | **Hard** (rewrite worker entry points) | ✅ |
| D5 | Operator auth | Microsoft Entra External ID; federated SSO option per-customer | Medium | ✅ |
| D6 | Region strategy | Single region (Central US), designed for multi-region | Medium | ✅ |
| D7 | Observability | OpenTelemetry + Azure Application Insights, day one | Easy | ✅ |
| D8 | Code preservation | Strangler Fig — wrap `@kavachiq/core`, do not rewrite | Hard (architecturally) | ✅ |
| S1 | Sequencing | Option B: skip Sprint 0, ship production architecture in 6 weeks | Strategic | ✅ |

### Runtime / non-functional decisions

| # | Decision | Recommended | Reversibility | Sign-off |
|---|---|---|---|---|
| N1 | Idempotency keys | Deterministic IDs derived from immutable inputs; UNIQUE constraints | **Hard** (data dedup retrofit) | ✅ |
| N2 | Delivery + handlers | At-least-once delivery; idempotent handlers; `INSERT … ON CONFLICT DO NOTHING` | **Hard** (rewrite every handler) | ✅ |
| N3 | Cross-service events | Outbox pattern — same DB transaction writes entity + outbox row | Medium | ✅ |
| N4 | Polling state | Per-tenant delta token in Postgres; transactional commit with Blob archive | Medium | ✅ |
| N5 | Correlation state | **Stateless batch** for v1 (pull last-K-min from DB, run, write); stateful sliding-window deferred | Easy | ✅ |
| N6 | External call resilience | Circuit breaker + retry with jitter + DLQ; per-downstream config | Easy | ✅ |
| N7 | Per-tenant fairness | Service Bus session-keyed by `tenant_id`; bounded prefetch; per-tenant token-bucket rate limit | Medium | ✅ |
| N8 | Autoscale | Container Apps KEDA scalers — queue length for workers, HTTP RPS for API; per-worker-type scaling profile | Easy | ✅ |
| N9 | Liveness / shutdown | Liveness + readiness probes; SIGTERM drain + bounded grace period | Easy | ✅ |
| N10 | Replay & schema evolution | Blob is immutable source of truth; reprocess any window; `schemaVersion` per entity, forward-compatible reads | Hard (replay must be designed-in) | ✅ |

Easy-to-reverse decisions are listed in §11 and explicitly deferred.

---

## 3. Structural decisions (D1-D8)

### D1. Tenant identity model — multi-tenant Microsoft app

**Chosen:** Register a single multi-tenant Microsoft app in our own Entra tenant. Each customer admin clicks one consent URL (`agents.kavachiq.com/onboard?…`), Microsoft records the consent in their tenant, we obtain tokens via OAuth `client_credentials` per (tenant, resource).

**Rejected alternatives:**

- **Single-tenant SP per customer (the "Sprint 0" path).** Customer creates an SP in their tenant, hands us the client secret. Works at 1, painful at 5, broken at 50: 50 manual onboarding flows, 50 secrets to lose, 50 rotation runbooks. Microsoft's own audit log does not show our calls as easily because we're impersonating a different SP per tenant. Compliance reviewers ask hard questions.
- **App+user delegated tokens.** Customer admin signs in interactively; we get user-scoped tokens. Doesn't work for unattended workers (tokens expire, need refresh, refresh fails when admin leaves the company).

**Rationale:**

- Onboarding becomes "share the consent URL", not "schedule a screen-share to make an SP."
- Revocation is the customer admin removing consent in their portal — clean, customer-controlled, audit-logged on their side.
- Microsoft handles the trust plumbing, not us.
- At customer 50, this is the difference between 50 working integrations and 50 stuck ones.

**Cost to reverse:** every existing customer must re-onboard if we switch later. At 5 customers, manageable. At 50, you lose customers. Get it right at customer 1.

**Caveats:**

- AppSource publication requires Microsoft review. **NOT** required for direct private invitation links — defer publication until self-serve onboarding is desired.
- Scopes are namespaced and additive. We start with read-only (`AuditLog.Read.All`, `Directory.Read.All`); each Phase 4 write scope is a separate consent prompt — customers love this — staged trust.

**Sign-off:** ✅ Approved 2026-05-05

---

### D2. Per-tenant data isolation — Postgres RLS + per-tenant DEK for credentials

**Chosen:** Single Postgres database, single schema. Every multi-tenant table has a `tenant_id uuid not null` column. Postgres Row-Level Security policy enforces `tenant_id = current_setting('app.tenant_id')::uuid`. The application sets `app.tenant_id` per request from the JWT claim. **Plus:** sensitive fields (customer SP credentials, baseline JSONs containing user PII, raw event payloads) encrypted with envelope encryption — per-tenant Data Encryption Key wrapped by a master key in Azure Key Vault.

**Rejected alternatives:**

- **Schema-per-tenant.** Strong isolation, but every schema migration multiplies by N. At 200 tenants, every schema change is a 200-step rollout. Backup/restore-per-tenant adds operational burden. Most multi-tenant SaaS that picks this regrets it by ~50 customers.
- **Database-per-tenant.** Stronger isolation, even more painful migrations. Justifiable only for HIPAA-grade isolation requirements; Microsoft Entra audit data is sensitive but not at that level.
- **"We'll add `WHERE tenant_id = ?` everywhere"** without RLS. One forgotten clause = cross-tenant leak. Code review cannot reliably catch every case at scale.

**Rationale:**

- RLS is the enforcement that survives every developer mistake. A missing WHERE clause returns zero rows, not the wrong tenant's rows.
- Per-tenant DEK means even a database compromise doesn't expose customer credentials in plaintext. Belt + suspenders pattern used by Salesforce, Notion, Linear.
- Schema migrations are simple — one schema, normal `ALTER TABLE`.

**Cost to reverse:** if we picked "WHERE clauses" and want to add RLS later, we have to audit every query, every code path, and write the policies. ~3-6 weeks of focused work plus cross-tenant leak risk during the transition. Get it right at customer 1.

**Caveats:**

- RLS adds query overhead — minimal, but profile under load.
- Application code must reliably set `app.tenant_id` at every connection acquisition. Enforcement: a connection-pool middleware that refuses to hand out a connection without `app.tenant_id` set.
- Cross-tenant analytics queries (e.g., "incidents in last 24h across all tenants") run as a privileged service identity that bypasses RLS — separate role.

**Sign-off:** ✅ Approved 2026-05-05

---

### D3. Storage layer — Postgres for state, Blob for raw archive

**Chosen:**

- **Azure Database for PostgreSQL Flexible Server**: state. Tables: `tenants`, `incidents`, `correlated_change_bundles`, `normalized_changes`, `baselines` (snapshot metadata), `sensitivity_lists`, `operator_users`, `operator_action_audit`, `tenant_credentials` (encrypted), `polling_state` (delta tokens), `outbox` (cross-service event publishing — see N3). Indexed for the Phase 1 access patterns.
- **Azure Blob Storage Standard**: raw audit event archive (`RawEvent[]` JSON files), large baseline state JSONs (group memberships, app role assignments), classification-rationale archives. Per-tenant container with lifecycle policies. Append-only, immutable, cheap. The legal record of "what did Microsoft tell us happened in this tenant."

**Rejected alternatives:**

- **Cosmos DB.** Cost surprises at scale; query model fights multi-tenant patterns; vendor-locked. Postgres beats it on every dimension that matters here (cost predictability, query expressiveness, operational maturity).
- **MongoDB.** Multi-tenant isolation is harder, schema enforcement is application-side, every multi-tenant SaaS at scale that picked Mongo migrated off within 3-5 years.
- **JSON files only** (Sprint 0 shape). Works at 1 customer, can't satisfy "show me last-24h incidents across all tenants" for ops, can't index, can't do RLS.
- **Storage tier consolidation** (one Postgres for everything). Raw event JSONs are too large to live in Postgres rows efficiently and are write-once-read-rarely; Blob fits the access pattern.

**Rationale:**

- Postgres scales linearly to ~100k tenants with proper indexing. Beyond that we add read replicas or shard, but we are nowhere near that.
- Blob storage is essentially free for the volumes audit logs produce.
- Switching providers later (Azure → AWS RDS → GCP Cloud SQL) is config, not rewrite. They're all Postgres.

**Cost to reverse:** picking the wrong provider is config; picking the wrong topology (no Postgres at all) is a 6-8 week rewrite plus customer-data migration with downtime risk.

**Caveats:**

- Postgres Flexible Server has a 16TB ceiling per instance. At 200 customers each producing ~100MB/year of normalized data, we're at ~20GB/year for the hot path — three orders of magnitude under the ceiling.
- Backup retention 35 days on Flex Server is sufficient; longer-term archival is the Blob copy.

**Sign-off:** ✅ Approved 2026-05-05

---

### D4. Job orchestration — Azure Service Bus + Container Apps

**Chosen:**

- **Azure Service Bus** (Standard tier) with three queues:
  - `poll-tenant` — global cron enqueues one message per active tenant per polling interval.
  - `process-events` — emitted by polling workers after archiving raw events.
  - `notify-operator` — emitted on incident materialization.
- **Session-keyed delivery** with `tenant_id` as the session ID — ensures FIFO per tenant and natural rate limiting (one tenant can't starve others). See N7.
- **Workers run on Azure Container Apps** with scale-to-zero. One worker pool per queue type. Replicas scale on queue length via KEDA — see N8.
- **Dead-letter queues** with operator alerting when messages enter them.
- **Retry policy** with exponential backoff, max 5 attempts, then DLQ. See N6.

**Rejected alternatives:**

- **Cron + processes per tenant.** Works at 1-5, breaks at 30. Per-tenant rate limiting requires custom code. No fairness across tenants. Adding a queue at customer 30 means rewriting every worker entry point.
- **Azure Storage Queues** (lighter than Service Bus). Acceptable for v1 if Service Bus feels heavy — same producer/consumer pattern, simpler API, ~$0/mo. Migration to Service Bus later is one SDK swap. **Recommended fallback** if D4 specifics are pushed back on; the architectural commitment is "queue-based from day one", not "Service Bus specifically."
- **Azure Functions.** Timer triggers add cold-start latency (5-30s) which compounds across the pipeline. Container Apps with scale-to-zero is faster to warm up and cheaper at meaningful load.
- **AKS / Kubernetes.** Overkill for current scale. Container Apps is "Kubernetes you don't have to operate" for our shape.

**Rationale:**

- Queue-based from day one is the architectural commitment. Adding a queue at customer 1 is 1-2 weeks; adding it at customer 30 is 6-8 weeks plus migration.
- Container Apps scale-to-zero means customer 1 costs ~$0/mo for compute. Customer 30 still costs <$100/mo because most workers idle most of the time.
- Tenant-scoped sessions on Service Bus are exactly the per-tenant fairness primitive we need.

**Cost to reverse:** if we picked "no queue", every worker entry point gets rewritten. Adding the queue layer mid-flight is the textbook cause of multi-tenant outages.

**Sign-off:** ✅ Approved 2026-05-05

---

### D5. Operator auth — Microsoft Entra External ID, federated SSO option

**Chosen:**

- **Microsoft Entra External ID** (formerly Azure AD B2C) for KavachIQ-issued operator identities. Free tier covers 50,000 MAU. Handles MFA, password reset, anomalous-sign-in detection, account lockout.
- **Federated SSO** via OIDC for enterprise-tier customers who want their own AD to log in their operators. Per-customer toggle; do not build speculatively.
- **Inside the platform**: services authenticate to each other via Container Apps **managed identity**. Database access via managed identity → Postgres (no DB credentials in env vars). API issues short-lived JWTs to the console with `tenant_id` + `operator_id` claims.

**Rejected alternatives:**

- **Roll our own auth.** No.
- **API keys per customer.** Static secrets, rotation hell, breach blast radius. Anti-pattern at every multi-tenant SaaS over 10 customers.
- **Auth0 / Okta.** Both work; Microsoft Entra External ID is cheaper and integrates more cleanly with the customer-side Entra story we're already telling.

**Rationale:**

- "I forgot my password" doesn't go to our support queue.
- MFA enforcement, anomalous-sign-in detection, GDPR-compliant data subject deletion — Microsoft handles all of it.
- Federated SSO is the enterprise-deal lubricant; offering it as a per-customer feature is faster to sell than "you all use our login screen."

**Cost to reverse:** medium. Migrating from External ID to a different IdP is 2-3 weeks of code change plus a customer-side migration prompt.

**Sign-off:** ✅ Approved 2026-05-05

---

### D6. Region strategy — single region now, designed for multi-region

**Chosen:**

- **Day 1:** single region — **Azure Central US** (matches existing marketing-site infra).
- **Design now:** every entity carries an implicit `region` (derivable from `tenant.region`). Every storage handle, every queue, every Container Apps environment is region-scoped. Tenant data never crosses region boundaries. Cross-region operator auth is a separate concern (one External ID instance can serve multiple regions).
- **Day N (likely customer 30-50):** when an EU customer asks for data residency, deploy a second region (probably West Europe or North Europe). New customers go to the right one based on consent. Existing customers stay where they are.

**Rejected alternatives:**

- **Multi-region from day one.** Premature; doubles cost without any customer benefit at this scale.
- **No multi-region planning.** At customer 30, retrofitting "tenant routes to a region" is ~3-4 weeks of code change plus data migration of customers who land in the wrong region first.

**Rationale:**

- Designing for multi-region while deploying single-region adds a few enums and a few config values. Marginal cost.
- Not designing for it adds 3-4 weeks at the worst possible moment (when an enterprise EU prospect is mid-evaluation).

**Cost to reverse:** medium. Code change + data migration if we didn't design for it.

**Sign-off:** ✅ Approved 2026-05-05

---

### D7. Observability — OpenTelemetry + Azure Application Insights from day one

**Chosen:**

- **OpenTelemetry** instrumentation in every service (poll worker, pipeline worker, API, console). Trace IDs propagate via Service Bus message headers and HTTP request headers.
- **Azure Application Insights** as the OTel backend. Free tier covers 5GB/mo, sufficient through ~10-20 customers.
- **Per-tenant metrics** from day 1: events polled/min, normalization throughput, incidents/day, error rate by tenant, polling lag. Customers will eventually ask for their own dashboards; build the metrics now, expose them later.
- **Operator-action audit log** as a first-class table (`operator_action_audit`): who-viewed-which-customer's-incident-when. Required for SOC 2 and customer trust.
- **Structured JSON logs** (already in place via `@kavachiq/platform/observability`) on every service.

**Rejected alternatives:**

- **"We'll add tracing later."** No multi-tenant system survives without distributed tracing. Adding it later means re-instrumenting every service while debugging a live customer outage.
- **Datadog / New Relic.** Both work; Application Insights is cheaper and cleaner integration with Container Apps. Switch later if we outgrow it.

**Rationale:**

- Without trace propagation poll → normalize → correlate → detect → notify, debugging customer issues at 30 customers is brutal.
- Per-tenant metrics enable per-tenant SLA conversations later.
- Operator-action audit is non-negotiable for SOC 2; cheaper to build now than retrofit.

**Cost to reverse:** easy. OTel can swap backends with config.

**Sign-off:** ✅ Approved 2026-05-05

---

### D8. Code preservation — Strangler Fig, do not rewrite `@kavachiq/core`

**Chosen:**

- The existing `@kavachiq/core` package (normalize/correlate/detect — ~67 tests, 3 of 4 change classes done) is **tenant-agnostic pure functions**. They take inputs, return outputs. They do not know about Postgres, Service Bus, JWTs, or customers.
- Multi-tenant orchestration wraps these functions. **Adds**, never modifies:
  - `@kavachiq/orchestration` — new package. Per-tenant pipeline driver. Loads tenant context (creds, baselines, sensitivity list), calls core functions, persists results.
  - `@kavachiq/storage` — new package. Postgres + Blob clients. RLS-aware queries.
  - `@kavachiq/auth` — new package. JWT validation, tenant-context extraction, External ID integration.
- The existing 67 unit tests **stay unit tests**. They test pure functions. Multi-tenant integration tests are added on top, do not replace.
- Existing `platform/fixtures/canonical/` becomes the integration-test corpus, not the source of demo data eventually.
- Marketing site at root **stays unchanged** for sales (`/demo` stays fixture-driven, `/evidence` stays as-is). Operator console is a **separate** Next.js app — same monorepo, different surface, auth-walled.

**Rejected alternatives:**

- **"Refactor `@kavachiq/core` to take tenant context."** Pollutes pure functions with infrastructure concerns. Existing tests must change. Future Phase 2/3/4 work fights against tenant-aware signatures. Anti-pattern.
- **Throw it all out, start over.** No. The existing pipeline is the most expensive thing we've built. It's tested, it works against real WI-05 evidence, it has clear domain boundaries. Wrap, don't rewrite.

**Rationale:**

- Strangler Fig is the lowest-risk pattern for adding infrastructure around pure domain logic.
- 67 passing tests are a real asset; preserving them is preserving velocity.
- Future Phase 2 (blast radius) and Phase 3 (recovery) work also benefits from staying tenant-agnostic at the core.

**Cost to reverse:** architectural commitment. Reversing means rewriting the core, which we'd never do.

**Sign-off:** ✅ Approved 2026-05-05

---

## 4. Non-functional requirements (N1-N10)

The structural decisions in §3 say **what** we build. The NFRs in this section say **how it behaves** under load, failure, and replay. NFRs are equally non-negotiable; missing one of these at customer 30 typically causes a multi-day outage or data-integrity incident.

The four properties this section guarantees:

- **Fault tolerance** — Microsoft Graph 429s, customer tenant outages, Postgres failover, Service Bus broker hiccups, Container Apps replica restarts must not corrupt data or lose work.
- **Idempotency** — every operation can be safely retried; "exactly-once effect" via "at-least-once delivery + idempotency keys."
- **Resilience** — graceful degradation, circuit breakers, per-tenant fairness, autoscaling, graceful shutdown.
- **State management** — explicit contracts on what state lives where, durability guarantees, replay capability.

---

### N1. Idempotency keys — deterministic IDs from immutable inputs

**Chosen:**

- Every entity that originates from external input has a **deterministic ID** derived from its immutable identity:
  - `RawEvent.rawEventId = "raw_" + sha256(tenant_id + ":" + microsoft_event_id)` — Microsoft Graph events have stable IDs; same event ingested twice produces the same `rawEventId`.
  - `NormalizedChange.changeId = "chg_" + sha256(tenant_id + ":" + raw_event_id + ":" + change_class + ":" + target_object_id)` — same RawEvent normalized again produces the same `changeId`.
  - `CorrelatedChangeBundle.bundleId` and `Incident.incidentId` can stay random UUIDs **but** have UNIQUE constraints on their natural keys (`(tenant_id, change_ids_hash)` for bundles; `(tenant_id, bundle_id)` for incidents). Same bundle promoted twice = same incident, second insert fails the UNIQUE constraint and the handler treats it as success.
- **Postgres UNIQUE constraints** on every natural key. Database is the final guard.

**Rejected alternatives:**

- **Random UUIDs everywhere, dedup in app code.** Application-layer dedup races; databases catch the cases code misses.
- **Microsoft event ID as primary key directly.** Coupling — Microsoft can change ID format; we need a stable internal namespace.

**Rationale:** at-least-once delivery (N2) plus idempotent handlers requires stable, derivable identity. The platform must be safe to re-run from any point. Reprocessing a week of audit data must produce the same incidents — not duplicates.

**Cost to reverse:** painful. Retrofitting deterministic IDs onto a system with random IDs and accumulated duplicates means a data dedup pass + ID rewrites. Get it right at customer 1.

**Sign-off:** ✅ Approved 2026-05-05

---

### N2. Delivery + handlers — at-least-once + idempotent

**Chosen:**

- **Service Bus delivery:** at-least-once. Messages are redelivered on consumer crash, on ack timeout, on retry exhaustion. Consumers MUST be idempotent.
- **All write handlers:** `INSERT … ON CONFLICT DO NOTHING` for new rows; `INSERT … ON CONFLICT DO UPDATE` for upserts; `MERGE` for compound updates. No naked `INSERT` against a table that has a UNIQUE constraint.
- **Service Bus message-ID dedup window** (10-min built-in) reduces but does not eliminate duplicates. The database is the final dedup layer.
- **Test invariant:** every handler is run by a test that delivers the same message twice. Output must be identical.

**Rejected alternatives:**

- **Exactly-once delivery via two-phase commit.** Distributed 2PC across Service Bus + Postgres + Blob is heavyweight and brittle. The "at-least-once + idempotent" pattern is industry standard.
- **"Just don't retry."** Silently drops work on transient failures. Worst possible outcome.

**Rationale:** distributed systems guarantee at-least-once delivery; "exactly-once effect" is the application's responsibility. With deterministic IDs (N1) + UNIQUE constraints + ON CONFLICT, exactly-once effect is free.

**Sign-off:** ✅ Approved 2026-05-05

---

### N3. Cross-service events — outbox pattern

**Chosen:**

- When a service writes an entity AND wants to emit an event (e.g., pipeline-worker creates an `Incident` and wants `notify-operator` to fire), it does **both writes in the same Postgres transaction**:
  1. `INSERT INTO incidents (…)` — the entity
  2. `INSERT INTO outbox (event_type, payload, created_at, published_at IS NULL)` — the outbox row
- A separate **outbox-publisher** worker (or a small in-process publisher loop) reads `outbox WHERE published_at IS NULL`, emits to Service Bus, marks `published_at = now()`. Backoff on Service Bus failures; dead-letter on persistent failure.
- **Survives every failure mode**: pipeline-worker crashes between Incident insert and Service Bus emit → outbox row exists, publisher retries. Service Bus is down → publisher backs off, retries when it recovers.

**Rejected alternatives:**

- **Insert + emit-to-Service-Bus in the same handler.** Crash between operations = inserted Incident with no notification. Customer never knows. Common cause of "we have the incident but nobody got paged."
- **Change Data Capture (Debezium / Postgres logical replication).** Operationally heavyweight; outbox pattern achieves the same correctness with less infra.

**Rationale:** outbox pattern is the standard solution to "transactional event publishing" in distributed systems. Used by Stripe, Shopify, every multi-tenant SaaS at scale.

**Sign-off:** ✅ Approved 2026-05-05

---

### N4. Polling state durability — per-tenant delta tokens in Postgres

**Chosen:**

- Per-tenant `polling_state` table: `tenant_id, last_delta_token, last_poll_started_at, last_poll_completed_at, last_event_observed_at`.
- Polling worker flow:
  1. Read `last_delta_token` for tenant.
  2. Call Microsoft Graph `/auditLogs/directoryAudits?$deltatoken=…`.
  3. Write `RawEvent[]` JSON to Blob (immutable, atomic at object level).
  4. Postgres transaction: insert `RawEvent` rows referencing the Blob URL + update `polling_state.last_delta_token`. Commit.
  5. Enqueue `process-events` message via outbox (N3).
- **Crash anywhere**: re-poll same delta window. Microsoft event IDs (N1) dedup the redelivered events. No data loss, no duplicates.

**Rejected alternatives:**

- **Delta token in memory.** Lost on worker restart; full re-poll from scratch. Acceptable at 1 customer, painful at 30 (full re-poll = 30 days of events × 30 tenants = throttling).
- **Delta token in Service Bus message.** Couples message lifetime to state lifetime; Service Bus messages are not durable beyond their retention period.

**Rationale:** polling state must survive every restart. Postgres is the right store; transactional commit with downstream effects (Blob archive, outbox) makes the whole step atomic.

**Sign-off:** ✅ Approved 2026-05-05

---

### N5. Correlation state — stateless batch for v1, stateful sliding-window deferred

**Chosen for v1:** stateless batch correlation. Every N seconds (default 60s), a `correlator` worker:
1. Pulls `normalized_changes WHERE bundle_id IS NULL AND tenant_id = ? AND observed_at > now() - INTERVAL '5 minutes'`.
2. Calls existing `correlateNormalizedChanges` (pure function, unchanged from `@kavachiq/core`).
3. Writes resulting `CorrelatedChangeBundle` rows. Updates `normalized_changes.bundle_id`.

**Latency:** event → bundle = up to 60s (one correlation cycle) + processing time. Acceptable for shadow-mode pilot. At 5+ customers we measure real latency and tune the interval.

**Deferred (Phase 2+):** stateful sliding-window correlator. Workers maintain per-tenant in-memory windows; events stream in via Service Bus; bundles emit when windows close. Latency drops to ~5-10s, but adds: state externalization (Redis or Postgres), worker affinity (one tenant pinned to one worker for window consistency), graceful state handoff on scaling.

**Rationale:** stateless batch is simpler, has no new state to manage, and is sufficient until Phase 4 execution work creates a hard latency requirement. The pure-function design of `correlateNormalizedChanges` makes upgrading to streaming correlation later a wrapper change, not a core rewrite.

**Cost to reverse:** easy. Stateful streaming correlator is a wrapper around the same `correlateNormalizedChanges`; both can coexist behind the same outbox emission pattern.

**Sign-off:** ✅ Approved 2026-05-05

---

### N6. External call resilience — circuit breaker + retry with jitter

**Chosen:**

- Every external call (Microsoft Graph, Slack webhook, Resend email, Key Vault) wrapped in:
  - **Timeout** — aggressive per-call timeout (Graph: 30s; Slack: 10s; Key Vault: 5s).
  - **Retry policy** — exponential backoff with full jitter (`min(cap, base * 2^attempt) ± random_jitter`), max 3 attempts in-handler.
  - **Circuit breaker** (e.g., `opossum`): after 5 sustained failures within 30s, circuit opens for 30s. Calls during open circuit fail-fast, do not block worker pool.
  - **DLQ on retry exhaustion** — Service Bus message moves to DLQ with full failure context. Operator alerted. Replay tool exists.
- **Per-downstream config** — Microsoft Graph 429 handling honors `Retry-After` header; other downstreams use the standard policy.
- **Transient vs permanent classification** — 429, 503, 504, network reset = transient (retry). 401, 403 = permanent for this credential (do not retry; flag credential rotation needed); ack message and surface alert.

**Rejected alternatives:**

- **Naive retry without jitter.** Synchronizes retries across workers, magnifies the original outage. Anti-pattern.
- **No circuit breaker.** A sustained downstream failure burns through worker pool capacity. Customer A's Graph throttle starves customer B.
- **Infinite retry.** Eventually fills the queue; consumes resources without progress. DLQ + alert > infinite retry.

**Rationale:** external dependencies fail. The platform's job is to fail gracefully and recover, not crash or amplify the outage.

**Sign-off:** ✅ Approved 2026-05-05

---

### N7. Per-tenant fairness — Service Bus session-keyed delivery + token-bucket rate limit

**Chosen:**

- **Service Bus session ID = `tenant_id`.** Sessions provide FIFO per session and natural fairness — workers process tenants round-robin, no single tenant can starve others.
- **Per-session prefetch capped** at small number (e.g., 4 messages). One tenant's burst doesn't pin a worker for minutes.
- **Per-tenant token-bucket rate limit at the application layer.** Tracks ops/min per tenant; blocks excessive load with backoff. Configurable per tenant (defaults: 100 ops/min normalize, 1000 ops/min Graph polling).
- **Quota tracking in Postgres** (low-frequency writes) for cross-restart durability + per-tenant metrics.

**Rejected alternatives:**

- **Per-tenant queue.** N customers = N queues. Operationally painful (provisioning, monitoring, capacity). Sessions on a shared queue achieve the same isolation without the operational overhead.
- **No per-tenant fairness.** One tenant with a runaway agent floods our pipeline; every other customer's incidents are delayed.

**Rationale:** at customer 30, one tenant generating 100x the events of others is the norm, not the exception. Fairness is non-negotiable infrastructure.

**Cost to reverse:** medium. Adding sessions to an existing non-session queue is a queue config change + worker code change to honor sessions. Possible but disruptive.

**Sign-off:** ✅ Approved 2026-05-05

---

### N8. Autoscale — KEDA scalers per worker type

**Chosen:**

- **Container Apps autoscaling via KEDA** (built-in):
  - **Polling worker**: scales on cron schedule (one tick = N messages enqueued = scale up). Min 0, max 10 replicas. Replica processes one tenant per message; scales linearly with active tenant count.
  - **Pipeline worker**: scales on `process-events` queue **session count** + queue depth. Min 0, max 20 replicas. Each replica handles one session (one tenant) at a time. Replica count tracks concurrent active tenants.
  - **Notification worker**: scales on `notify-operator` queue depth. Min 0, max 5 replicas. Mostly idle.
  - **API**: scales on HTTP RPS via Container Apps' built-in HTTP scaler. Min 1 replica (no cold-start for operator clicks), max 10 replicas.
  - **Console (Next.js)**: served from existing App Service; B1 plan absorbs current load. Migrate to Container Apps + scale-to-zero when traffic warrants.
- **Cooldown** 5 min before scale-down to avoid thrashing.
- **Postgres connection pool sized to max-replica scenario.** Max replicas × max-conn-per-replica must fit Postgres `max_connections` (default 100 on Flex B1ms; tier up if needed).

**Rejected alternatives:**

- **Fixed-size worker pool.** Wastes capacity at low load, throttles at high load. Container Apps consumption pricing makes scale-to-zero strictly better.
- **Aggressive autoscale (no cooldown).** Thrash on bursty load; replicas come up and immediately scale down before they're useful.
- **Predictive autoscale.** Premature optimization at 5-50 customers. Reactive on queue depth is sufficient.

**Rationale:** queue depth is the correct scaling signal for async workers. HTTP RPS is correct for API. Per-worker-type independent scaling means polling delays don't affect API latency and vice versa.

**Caveats:**

- **Postgres connection storms** during scale-up — every new replica acquires connections at startup. Mitigation: connection pooler (PgBouncer in transaction mode) sits between workers and Postgres, multiplexes.
- **Cold starts** ~2-5s. Acceptable for queue messages (they wait), tolerable for API (first request slow). Min-1-replica on API avoids it.

**Sign-off:** ✅ Approved 2026-05-05

---

### N9. Liveness, readiness, and graceful shutdown

**Chosen:**

- **Every service exposes**:
  - `/health/live` — process is alive (always 200 unless deadlocked). Container Apps restarts on failure.
  - `/health/ready` — service can take traffic: Postgres pool healthy, Service Bus connection open, Key Vault reachable. 503 if not. Container Apps removes from rotation.
- **Graceful shutdown** on SIGTERM:
  1. Stop accepting new messages / requests (mark not-ready).
  2. Wait for in-flight work to complete with bounded grace period (60s default).
  3. Flush logs + telemetry.
  4. Exit clean.
- **Container Apps `terminationGracePeriodSeconds: 90`** (default 30 — too short for some pipeline operations).

**Rationale:** orchestrators kill replicas frequently (deploys, scale-down, host migration). Without graceful shutdown, in-flight messages get redelivered (handled by N2 idempotency, but creates noise). With graceful shutdown, redelivery is a rare exception.

**Sign-off:** ✅ Approved 2026-05-05

---

### N10. Replay & schema evolution — Blob is the source of truth

**Chosen:**

- **Blob raw event archive is the immutable source of truth.** Every audit event Microsoft Graph returned to us is preserved verbatim, forever. Lifecycle: hot tier 30 days → cool tier 90 days → archive tier indefinitely.
- **Reprocessing is a first-class operation.** A `reprocess-tenant` operator command:
  1. Picks a time window: `(tenant_id, from, to)`.
  2. Reads RawEvents from Blob.
  3. Re-runs the entire pipeline (normalize → correlate → detect) under current code + current sensitivity list + current baseline.
  4. Writes results idempotently (N1 + N2 means duplicates are no-ops; legitimately changed outputs replace prior versions via UPSERT).
  5. Audit-logged in `operator_action_audit` (who reprocessed, when, why).
- **Reprocessing is required for**: classification rule changes (e.g., new high-sensitivity group added → re-classify last 30 days); platform bug fixes (e.g., M3 mapper bug → re-normalize); customer requests ("can you re-run last quarter under the new policy?").
- **Schema evolution**:
  - Every entity has `schemaVersion: number`. Already established in `@kavachiq/schema`.
  - **Forward-compatible reads**: every reader handles current and current-1 schema versions. Migrations are eventual, not big-bang.
  - **Writes always emit current version.** Old data drifts forward via reprocessing or batch migration jobs as needed.
  - No table-wide schema migration tool that requires downtime. Migrations are additive (new columns nullable; old columns deprecated then dropped after replay).

**Rejected alternatives:**

- **Compute-derived data only stored, raws discarded.** Cannot reprocess. Cannot recover from a normalization bug discovered after the fact. Cannot re-classify under a policy change. Operationally bankrupting at customer 30.
- **Big-bang schema migrations.** Downtime; rollback risk; multiplies by tenant count. Forward-compatible reads scale to 200+ tenants without coordination.

**Rationale:** an audit-recovery platform that can't replay audit data against new rules is broken-by-design. Replay is **the** key capability that earns customer trust over time.

**Cost to reverse:** painful. Designing replay in retroactively means re-architecting writes, deduplication, schema. Get it right at customer 1.

**Sign-off:** ✅ Approved 2026-05-05

---

## 5. Sequencing — Option B: skip Sprint 0

We have two sequencing options:

| | Option A (Sprint 0 first, then Phase 1.5) | Option B (skip Sprint 0, ship production architecture) |
|---|---|---|
| Customer sees output | Week 2 | Week 5-6 |
| Architecture rebuilt | Week 8 (migrating customer 1) | Never |
| Customer-trust risk | "wait, you're rewriting it?" | Honest expectation up front |
| Total time to "real" | ~10 weeks | ~6 weeks |
| Wasted code | Sprint 0 storage, ad-hoc workers | None |

**Recommended: Option B.** The 4-week customer wait is worth not living in a tactical mode that we'll migrate out of anyway. Customer trust survives "we're being deliberate"; customer trust does not survive "we're swapping the system you just got working."

**Customer signal received: 6-8 weeks of patience confirmed.** Option B is the right call.

**Sign-off:** ✅ Option B selected, 2026-05-05

---

## 6. Week-by-week build plan (assuming Option B)

NFR work runs in parallel with structural work — most of N1-N10 is shape-of-the-code, not separate effort. The 6-week plan below names where each NFR lands.

| Week | Deliverable | NFRs landed | Verification |
|---|---|---|---|
| **1** | Multi-tenant Microsoft app registered. Consent URL working against test tenant. Postgres Flex deployed. Schema for `tenants`, `incidents`, `normalized_changes`, `polling_state`, `outbox`, `operator_action_audit` with RLS policies + UNIQUE constraints. Local dev → DB connection via managed identity. | N1 (deterministic IDs in schema), N4 (polling_state table) | `psql` connect, RLS policy fires on a contrived multi-tenant test, UNIQUE constraint rejects duplicate insert |
| **2** | Service Bus deployed (3 queues + DLQs + sessions). Container Apps environment + KEDA scalers. Empty `pipeline-worker` reads a session-keyed message, runs `@kavachiq/core` pipeline, writes one Incident + outbox row. Health probes + graceful shutdown. | N2, N3, N7 (sessions), N8 (KEDA), N9 | End-to-end: enqueue session-keyed message → see incident in DB + outbox row |
| **3** | `polling-worker` reads Microsoft Graph audit events using delta tokens. Archives `RawEvent[]` to Blob. Enqueues `process-events`. Circuit breaker + retry on Graph calls. End-to-end against existing test tenant. | N4 (delta tokens in Postgres), N6 (circuit breaker), N10 (Blob as source of truth) | Live tenant → incidents in Postgres; kill polling worker mid-cycle → resume cleanly with no duplicates |
| **4** | API service: GET /incidents (RLS-filtered). External ID configured. `/console` route in operator app. Outbox publisher emitting `notify-operator` → Slack webhook. Stateless batch correlator running every 60s. | N5 (stateless correlation) | Operator logs in, sees their tenant's incidents; Slack notification fires |
| **5** | `/onboard` route: customer admin clicks consent URL, callback registers tenant, baseline-bootstrap job pulls initial group-membership snapshot for high-sensitivity groups. **First real customer onboarded.** Replay tool documented. | N10 (replay) | Customer admin completes onboarding flow end-to-end; reprocess-tenant command runs against test tenant, idempotent |
| **6** | Hardening: OTel tracing end-to-end. Per-tenant metrics dashboard in App Insights. `operator_action_audit` populated on every API call. Per-tenant DEK in Key Vault. Per-tenant token-bucket rate limit. Runbook update. | (D7 finalized; N7 rate limits; backup/restore drill) | OTel trace from poll to notify visible; first quarterly backup-restore drill scheduled |

**Floor: 6 weeks to production-architecture customer onboarded.** Calendar time may stretch with customer-side delays (consent, security review).

---

## 7. Code structure (target)

```
platform/
├── packages/
│   ├── schema/        existing — audit `tenant_id` requirement on every entity
│   ├── platform/      existing — add OTel hooks, circuit-breaker primitives
│   ├── core/          existing — UNCHANGED. Pure functions stay pure.
│   ├── orchestration/ NEW — per-tenant pipeline driver, outbox publisher
│   ├── storage/       NEW — Postgres (RLS-aware) + Blob clients, connection pool middleware
│   ├── auth/          NEW — External ID JWT, managed-identity helpers
│   ├── workers/       fill in — pollers, correlator, pipeline driver, notify
│   ├── api/           fill in — REST + WebSocket, health endpoints
│   ├── execution/     stays stub for Phase 4
│   └── cli/           operations tooling — reprocess-tenant, dlq-replay, baseline-refresh
├── fixtures/
│   └── canonical/     existing — becomes integration test corpus
├── scripts/           existing — operations runbooks
└── infra/             NEW — Bicep modules
    ├── postgres.bicep
    ├── service-bus.bicep
    ├── container-apps.bicep
    ├── blob.bicep
    ├── key-vault.bicep
    └── app-insights.bicep
apps/
└── console/           NEW — Next.js operator console (separate from marketing /demo)
```

The marketing site (current repo root, with `/demo` and `/evidence`) **stays unchanged** for sales. `apps/console/` is the auth-walled real product.

---

## 8. Cost model (estimates, Azure Central US, May 2026 pricing)

| Component | 5 customers | 50 customers | 200 customers |
|---|---|---|---|
| Postgres Flex | B1ms ~$13/mo | D2s_v3 ~$120/mo | E4s_v3 ~$430/mo |
| Service Bus | Standard ~$10/mo | Standard ~$10/mo | Standard ~$30/mo |
| Container Apps (autoscaled) | Free tier | $50-100/mo | $300-500/mo |
| Blob Storage | ~$5/mo | ~$50/mo | ~$200/mo |
| App Insights | Free tier | $30/mo | $100/mo |
| Key Vault | ~$2/mo | ~$5/mo | ~$15/mo |
| External ID | Free tier (≤50k MAU) | Free tier | ~$50/mo (>50k MAU) |
| Existing App Service B1 (marketing) | $13/mo | $13/mo | $13/mo |
| **Subtotal / mo** | **~$43** | **~$280-330** | **~$1,150-1,350** |
| Multi-region uplift (~50% extra) | n/a | n/a | likely needed |
| **All-in / mo** | **~$43** | **~$280-330** | **~$1,700-2,000** |
| **Per-customer / mo** | **$8.60** | **$5.60-$6.60** | **$8.50-$10** |

Marginal cost per customer is ~$5-10/mo at any scale. Compared with software ARR per customer this is rounding error. Architecture decisions in this doc do not optimize for cost per dollar — they optimize for "doesn't need rewriting."

Container Apps consumption-billing means scale-to-zero workers cost ~$0/mo at idle. Only the always-on API pays a baseline. Cost grows with active usage, not provisioned capacity.

---

## 9. What this proposal explicitly does NOT do

Naming exclusions so reviewers can confirm scope:

- **Phase 2-4 product features** (blast radius engine, recovery planning, execution against Graph) are out of scope. This doc is the runtime/infrastructure those features run on.
- **AppSource publication / Microsoft app review.** Defer until self-serve onboarding is desired (probably customer 10-15).
- **CI/CD platform.** Deploys from laptop initially. GitHub Actions when team grows past 1 person.
- **SOC 2 / ISO 27001.** Required pre-enterprise; defer until paying customers ask. Architecture choices here do not block the audit.
- **GDPR DSAR / data subject deletion tooling.** Required pre-EU customer; defer until needed. Schema design ensures `tenant_id`-scoped deletes work cleanly when we build it.
- **Customer-facing dashboards beyond incident list.** Operator console with incidents is enough through 10+ customers. Custom dashboards = post-revenue.
- **Detection rule customization per tenant.** Phase 2/3 work; today's classification weights are fine.
- **Webhooks instead of polling for Graph audit events.** Polling for v1; webhooks add complexity (renewal handshakes, validation, failure modes). Migrate to webhooks at customer 5+ if 5-min latency is a complaint.
- **Stateful streaming correlator.** N5 deferred until latency-sensitive Phase 4 work creates a real requirement.
- **Chaos engineering / fault injection.** Operationally appropriate post-pilot. The architecture supports it; the practice waits for stable load.
- **Cross-region failover.** Single-region with multi-region readiness; failover drills come with the second region's deployment.

---

## 10. Open questions — resolved 2026-05-05

All seven were signed off as part of "Agree with all". Recorded answers:

1. **Postgres provider region/SKU.** ✅ **Central US, B1ms tier**. Matches existing marketing infra. Reconsider if a future customer requires EU residency (triggers D6 multi-region path).
2. **`apps/console/` — same repo or separate?** ✅ **Same repo (monorepo).** Same Next.js app at root with route segregation: `/`, `/platform`, `/demo`, `/evidence` stay public; `/console` is auth-walled. Splits later if team or build times grow.
3. **External ID tenant — separate from our own Entra?** ✅ **Yes — separate Entra tenant for operator identity**. Cleaner blast radius. Requires manual creation in the Azure portal (cannot be created via `az` CLI); blocks week 5 (operator login flow).
4. **Service Bus vs Storage Queues for v1.** ✅ **Azure Service Bus, Standard tier.** Required for N7 per-tenant session-keyed fairness. ~$10/mo cost accepted.
5. **Bicep vs Terraform for `infra/`.** ✅ **Bicep.** Azure-native, no state backend, deployments tracked in ARM. Reconsider if/when multi-cloud becomes a real concern.
6. **Customer-tenant region detection.** ✅ **Pin every customer to deployment region for v1**. Customer's Microsoft tenant data lives wherever Microsoft hosts it; KavachIQ's processed data lives in our region. v1 is Central US for all.
7. **Connection pooler — PgBouncer or Postgres-native?** ✅ **Native pool sizing for v1.** Each Container Apps replica caps its pool at 5 connections; KEDA max replicas × 5 stays under Postgres B1ms `max_connections=100`. Add PgBouncer when autoscale thresholds force it (likely at customer 20-30 with bursty load).

---

## 11. Easy-to-reverse decisions — explicitly deferred

Listed so reviewers don't waste time pushing back on these now:

| Decision | Defer until | Why |
|---|---|---|
| Specific notification channel (Slack vs email vs in-product) | First customer asks | Plug-in shape; one day to swap |
| Specific UI layout for `/console` | First operator session | Iterate from feedback |
| Detection scoring weights | After 100 real incidents | Tune from data |
| Polling interval (5min default) | Customer feedback | Config value |
| Correlation interval (60s default) | Latency complaints | Config value |
| Specific Bicep vs Terraform tool | Open question above | Both work; pick later |
| CI/CD platform | Team > 1 person | Laptop deploy works |
| Specific webhook subscription | Customer #5 | Polling is fine for v1 |
| Specific autoscale thresholds | After load profiling | KEDA values are tuneable |
| Specific circuit-breaker tuning | After observed downstream patterns | `opossum` config |

---

## 12. Risks called out

A Principal review names risks the recommended path doesn't eliminate:

- **R1 — Microsoft app review delay.** If we ever publish to AppSource, the review can take weeks. Mitigation: defer publication; private invitation links work indefinitely.
- **R2 — Per-tenant DEK rotation.** Rotating a DEK requires re-encrypting all per-tenant secrets. Operationally non-trivial. Mitigation: design rotation runbook before customer 5; practice it on a synthetic tenant.
- **R3 — Service Bus session-based delivery cost.** Standard tier required for sessions; Basic doesn't support them. Adds ~$10/mo at minimum scale. Acceptable.
- **R4 — RLS performance under load.** Postgres RLS adds query overhead. Mitigation: profile under realistic load before customer 10. Cache-friendly query patterns; index on `tenant_id` first.
- **R5 — Customer-side admin churn.** If the customer admin who granted consent leaves, consent persists, but we may lose the human contact. Mitigation: require two admins on customer side at onboarding; document in DPA.
- **R6 — Microsoft Graph throttling.** Audit log polling has rate limits. Mitigation: per-tenant exponential backoff (N6); surface via metrics; alert at sustained throttling.
- **R7 — Postgres connection storms during scale-up.** Each new Container Apps replica acquires connections. Without pooling, max replicas × per-replica pool > Postgres `max_connections` = denial of service to ourselves. Mitigation: PgBouncer (Open question 7); or careful per-replica pool sizing; profile under autoscale event.
- **R8 — Outbox publisher backlog.** If Service Bus is down for hours, outbox grows unbounded. Mitigation: alert on outbox size > threshold; bound retry duration; surface stuck outbox rows for ops triage.
- **R9 — Replay correctness bugs.** Reprocessing under new rules can produce different incidents than original. Mitigation: every incident records the rule-version it was created under; reprocessing creates new versions linked to old (not silent overwrite).
- **R10 — Cold-start API on first hit of the day.** Min-1 replica avoids; but if we drop to scale-to-zero on API to save cost, first operator click is 2-5s slow. Mitigation: keep API at min-1 replica.

---

## 13. What changes in the existing repo if this is approved

**Adds (no removals):**

- `docs/MULTI_TENANT_ARCHITECTURE_DECISIONS.md` (this doc, promoted from DRAFT to canonical record)
- `infra/` directory with Bicep modules (week 1+)
- `platform/packages/{orchestration,storage,auth}/` (weeks 2-4)
- `apps/console/` (week 4-5)
- Schema changes to existing entities to enforce `tenant_id` + UNIQUE constraints (week 1)

**Stays the same:**

- `@kavachiq/core` — unchanged
- `@kavachiq/platform` — minor OTel + circuit-breaker additions
- `@kavachiq/schema` — `tenant_id` audit + `schemaVersion` already in place
- Marketing site (`/`, `/platform`, `/demo`, `/evidence`)
- All existing fixtures
- All existing tests

**No removals.** Strangler Fig means everything currently working keeps working.

---

## 14. Sign-off — APPROVED 2026-05-05

This document is the canonical architectural record. Implementation may begin against the week-by-week plan in §6. Subsequent material revisions go through this same sign-off block.

```
Structural decisions
[x] D1  Multi-tenant Microsoft app, day one
[x] D2  Postgres RLS + per-tenant DEK
[x] D3  Postgres (state) + Blob (raw archive)
[x] D4  Azure Service Bus + Container Apps (Service Bus chosen, see Q4)
[x] D5  Microsoft Entra External ID
[x] D6  Single region (Central US), designed for multi-region
[x] D7  OpenTelemetry + Application Insights
[x] D8  Strangler Fig — wrap @kavachiq/core

Sequencing
[x] S1  Option B (skip Sprint 0; 6-week production-architecture build)

Non-functional requirements
[x] N1  Deterministic IDs / idempotency keys
[x] N2  At-least-once delivery + idempotent handlers
[x] N3  Outbox pattern for cross-service events
[x] N4  Polling state durability (delta tokens in Postgres)
[x] N5  Stateless batch correlation for v1
[x] N6  Circuit breaker + retry with jitter on external calls
[x] N7  Per-tenant fairness (Service Bus sessions + token bucket)
[x] N8  Autoscale (KEDA scalers per worker type)
[x] N9  Liveness/readiness/graceful shutdown
[x] N10 Replay (Blob source of truth) + schema evolution

Open questions resolved (see §10)
[x] Q1  Postgres: Central US, B1ms
[x] Q2  apps/console: same repo (monorepo)
[x] Q3  External ID: separate Entra tenant
[x] Q4  Queue: Azure Service Bus, Standard tier
[x] Q5  IaC: Bicep
[x] Q6  Region: pin all customers to deployment region for v1
[x] Q7  Connection pool: native pool sizing for v1; add PgBouncer when forced
```

Approver: Repository owner  Date: 2026-05-05

---

## Appendix A — Strangler Fig pattern, illustrated

The existing pure functions live unchanged at the bottom. Tenant-aware orchestration is layered on top. The orchestration layer is where N1-N10 are enforced.

```
┌────────────────────────────────────────────────────────────┐
│ pipeline-worker (Container Apps, KEDA-scaled)              │
│   1. dequeue session-keyed message {tenant_id, blob_url}   │
│   2. set Postgres app.tenant_id from message               │
│      → RLS engages (D2, N1 UNIQUE constraints)             │
│   3. tenantCtx = await loadTenantContext(tenant_id)        │
│      // creds (per-tenant DEK), baselines, sensitivity     │
│   4. raws = await blobClient.read(blob_url)                │
│      → Blob is source of truth (N10 replay possible)       │
│   5. ─── existing @kavachiq/core, untouched ───            │
│        normalized = await normalizeRawEvents(raws, {       │
│          snapshotProvider: tenantCtx.snapshotProvider,     │
│        })                                                  │
│        bundles = correlateNormalizedChanges(               │
│          normalized, { scoringPolicy: tenantCtx.… })       │
│        for bundle in bundles:                              │
│          if bundle.score >= 80:                            │
│            incident = promoteBundleToIncident(...)         │
│   6. db.transaction(() => {                                │
│        INSERT INTO incidents ON CONFLICT DO NOTHING (N1+N2)│
│        INSERT INTO outbox (event_type, payload) (N3)       │
│      })                                                    │
│   7. ack message (Service Bus)                             │
│      // crash before ack = redelivery; idempotent (N2)     │
│      // graceful SIGTERM completes step 6 before exit (N9) │
└────────────────────────────────────────────────────────────┘
```

Lines 5 of `@kavachiq/core` are byte-for-byte the existing code. Lines 1-4 and 6-7 are the new orchestration where the NFRs are enforced. The 67 existing tests still test line 5 in isolation; new integration tests cover lines 1-7.

---

## Appendix B — Why not start with all of Phase 2-4 in this doc

This doc is **infrastructure**, not features. Phase 2 (blast radius), Phase 3 (recovery planning), Phase 4 (execution) are product capabilities that run *on* this infrastructure. Each gets its own design pass. Trying to design all of them in one doc dilutes every decision.

The decisions in this doc are sufficient to carry Phase 2-4 features when they're built. Specifically:

- **Phase 2 blast-radius** writes to Postgres (`blast_radius_results` table — added in that pass), reads from `incidents` and `normalized_changes`. RLS scoped automatically. Idempotency via N1 patterns.
- **Phase 3 recovery planning** writes `recovery_plans`, reads from `blast_radius_results`. Same N1-N10 properties apply.
- **Phase 4 execution** is a separate service (`@kavachiq/execution`) per the existing architecture lock — read/write trust boundary — but consumes the same Service Bus pattern, same RLS-scoped Postgres reads, same OTel tracing, same outbox emission, same per-tenant fairness. The "separate execution service" lock in `ENGINEERING_BOOTSTRAP_DECISIONS.md` is honored. Phase 4 will likely promote N5 from stateless batch correlation to stateful streaming correlator to meet execution-latency SLAs.
