# Multi-tenant architecture — decision proposal (5 → 200+ customers)

**Status:** **DRAFT — awaiting review and sign-off.** Nothing in this doc has been built. No infrastructure has been provisioned. This is a proposal; the canonical record only after every decision below is signed off (see §Sign-off).

**Author:** Principal/Staff engineering review, 2026-05-04
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
- A design partner with a non-prod Microsoft Entra tenant willing to point at our system.
- Stub services for `@kavachiq/api`, `@kavachiq/workers`, `@kavachiq/execution`. Zero production storage, zero queueing, zero per-tenant credential plumbing.

We are about to write the runtime that takes the existing pure-function pipeline and runs it against real customer tenants. **Every architectural decision made here will be revisited at customer 30+ if we get it wrong.** Some decisions are 1 week to revisit, some are 12. This doc names which is which and recommends a path for each.

**The brief, restated:** design a platform that can carry us from 5 customers (where we are now) to 200+ without an incremental rewrite. Get the irreversible decisions right; defer everything else.

---

## 2. Decision summary

| # | Decision | Recommended | Reversibility | Sign-off |
|---|---|---|---|---|
| D1 | Tenant identity model | Multi-tenant Microsoft app | **Hard** (forces re-onboard) | ☐ |
| D2 | Per-tenant data isolation | Postgres RLS + per-tenant DEK for credentials | **Hard** (rewrite every query) | ☐ |
| D3 | Storage layer | Postgres (state) + Blob (raw archive) | **Hard** (data migration) | ☐ |
| D4 | Job orchestration | Azure Service Bus + Container Apps | **Hard** (rewrite worker entry points) | ☐ |
| D5 | Operator auth | Microsoft Entra External ID; federated SSO option per-customer | Medium | ☐ |
| D6 | Region strategy | Single region (Central US), designed for multi-region | Medium | ☐ |
| D7 | Observability | OpenTelemetry + Azure Application Insights, day one | Easy | ☐ |
| D8 | Code preservation | Strangler Fig — wrap `@kavachiq/core`, do not rewrite | Hard (architecturally) | ☐ |
| S1 | Sequencing | Option B: skip Sprint 0, ship production architecture in 6 weeks | Strategic | ☐ |

Easy-to-reverse decisions are listed in §10 and explicitly deferred.

---

## 3. The decisions

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

**Sign-off needed:** ☐

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

**Sign-off needed:** ☐

---

### D3. Storage layer — Postgres for state, Blob for raw archive

**Chosen:**

- **Azure Database for PostgreSQL Flexible Server**: state. Tables: `tenants`, `incidents`, `correlated_change_bundles`, `normalized_changes`, `baselines` (snapshot metadata), `sensitivity_lists`, `operator_users`, `operator_action_audit`, `tenant_credentials` (encrypted), `polling_state` (delta tokens). Indexed for the Phase 1 access patterns.
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

**Sign-off needed:** ☐

---

### D4. Job orchestration — Azure Service Bus + Container Apps

**Chosen:**

- **Azure Service Bus** (Standard tier) with three queues:
  - `poll-tenant` — global cron enqueues one message per active tenant per polling interval.
  - `process-events` — emitted by polling workers after archiving raw events.
  - `notify-operator` — emitted on incident materialization.
- **Session-keyed delivery** with `tenant_id` as the session ID — ensures FIFO per tenant and natural rate limiting (one tenant can't starve others).
- **Workers run on Azure Container Apps** with scale-to-zero. One worker pool per queue type. Replicas scale on queue length.
- **Dead-letter queues** with operator alerting when messages enter them.
- **Retry policy** with exponential backoff, max 5 attempts, then DLQ.

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

**Sign-off needed:** ☐

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

**Sign-off needed:** ☐

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

**Sign-off needed:** ☐

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

**Sign-off needed:** ☐

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

**Sign-off needed:** ☐

---

## 4. Sequencing — Option B: skip Sprint 0

We have two sequencing options:

| | Option A (Sprint 0 first, then Phase 1.5) | Option B (skip Sprint 0, ship production architecture) |
|---|---|---|
| Customer sees output | Week 2 | Week 5-6 |
| Architecture rebuilt | Week 8 (migrating customer 1) | Never |
| Customer-trust risk | "wait, you're rewriting it?" | Honest expectation up front |
| Total time to "real" | ~10 weeks | ~6 weeks |
| Wasted code | Sprint 0 storage, ad-hoc workers | None |

**Recommended: Option B.** The 4-week customer wait is worth not living in a tactical mode that we'll migrate out of anyway. Customer trust survives "we're being deliberate"; customer trust does not survive "we're swapping the system you just got working."

If customer pressure forces Option A: we can do it, but be **explicit with the design partner** that Sprint 0 is a tactical shadow that gets re-platformed at week 8. Their data flows through; the storage and orchestration get rebuilt underneath.

**Sign-off needed:** ☐ Option A / ☐ Option B

---

## 5. Week-by-week build plan (assuming Option B)

| Week | Deliverable | Verification |
|---|---|---|
| **1** | Multi-tenant Microsoft app registered. Consent URL working against test tenant. Postgres Flex deployed. Schema for `tenants`, `incidents`, `normalized_changes` with RLS policies. Local dev → DB connection via managed identity. | `psql` connect, RLS policy fires on a contrived multi-tenant test |
| **2** | Service Bus deployed (3 queues + DLQs). Container Apps environment deployed. Empty `pipeline-worker` container reads a message, runs the existing `@kavachiq/core` pipeline against a fixture, writes one Incident to Postgres. | End-to-end: enqueue message → see incident in DB |
| **3** | `polling-worker` reads Microsoft Graph audit events using delta tokens. Archives `RawEvent[]` to Blob. Enqueues `process-events`. End-to-end against existing test tenant (`patwainc.onmicrosoft.com`). | Live tenant → incidents in Postgres |
| **4** | API service: GET /incidents (RLS-filtered). External ID configured. `/console` route in operator app: list incidents, drill into one. Slack notification on incident-created. | Operator logs in, sees their tenant's incidents |
| **5** | `/onboard` route: customer admin clicks consent URL, callback registers tenant, baseline-bootstrap job pulls initial group-membership snapshot for high-sensitivity groups. **First real customer onboarded.** | Customer admin completes onboarding flow end-to-end |
| **6** | Hardening: OTel tracing end-to-end. Per-tenant metrics dashboard in App Insights. `operator_action_audit` table populated on every API call. Per-tenant DEK in Key Vault. Runbook update. | OTel trace from poll to notify visible; audit table has rows |

**Floor: 6 weeks to production-architecture customer onboarded.** Calendar time may stretch with customer-side delays (consent, security review).

---

## 6. Code structure (target)

```
platform/
├── packages/
│   ├── schema/        existing — audit `tenant_id` requirement on every entity
│   ├── platform/      existing — add OTel hooks
│   ├── core/          existing — UNCHANGED. Pure functions stay pure.
│   ├── orchestration/ NEW — per-tenant pipeline driver
│   ├── storage/       NEW — Postgres (RLS-aware) + Blob clients
│   ├── auth/          NEW — External ID JWT, managed-identity helpers
│   ├── workers/       fill in — pollers, pipeline driver, notify
│   ├── api/           fill in — REST + WebSocket
│   ├── execution/     stays stub for Phase 4
│   └── cli/           operations tooling (existing scripts move here over time)
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

## 7. Cost model (estimates, Azure Central US, May 2026 pricing)

| Component | 5 customers | 50 customers | 200 customers |
|---|---|---|---|
| Postgres Flex | B1ms ~$13/mo | D2s_v3 ~$120/mo | E4s_v3 ~$430/mo |
| Service Bus | Standard ~$10/mo | Standard ~$10/mo | Standard ~$30/mo |
| Container Apps | Free tier | $50-100/mo | $300-500/mo |
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

---

## 8. What this proposal explicitly does NOT do

Naming exclusions so reviewers can confirm scope:

- **Phase 2-4 product features** (blast radius engine, recovery planning, execution against Graph) are out of scope. This doc is the runtime/infrastructure those features run on.
- **AppSource publication / Microsoft app review.** Defer until self-serve onboarding is desired (probably customer 10-15).
- **CI/CD platform.** Deploys from laptop initially. GitHub Actions when team grows past 1 person.
- **SOC 2 / ISO 27001.** Required pre-enterprise; defer until paying customers ask. Architecture choices here do not block the audit.
- **GDPR DSAR / data subject deletion tooling.** Required pre-EU customer; defer until needed. Schema design ensures `tenant_id`-scoped deletes work cleanly when we build it.
- **Customer-facing dashboards beyond incident list.** Operator console with incidents is enough through 10+ customers. Custom dashboards = post-revenue.
- **Detection rule customization per tenant.** Phase 2/3 work; today's classification weights are fine.
- **Webhooks instead of polling for Graph audit events.** Polling for v1; webhooks add complexity (renewal handshakes, validation, failure modes). Migrate to webhooks at customer 5+ if 5-min latency is a complaint.

---

## 9. Open questions for reviewers

These are unresolved and need a decision before week 1 kicks off:

1. **Postgres provider region/SKU.** Confirm Central US matches the existing marketing infra and the design partner's expected data residency. If the partner is non-US, we should choose region accordingly.
2. **`apps/console/` — same repo or separate?** Recommend same repo (monorepo), same Next.js app at root with route segregation between marketing (public) and `/console` (auth-walled). Splits later if team or build times grow. Alternative: separate repo. Reviewer call.
3. **External ID tenant — separate from our own Entra?** Recommend yes — operator-identity tenant is a separate Entra tenant from our own corporate Entra. Cleaner blast radius if either is compromised.
4. **Service Bus vs Storage Queues for v1.** Both are queue-based. Service Bus is the recommended default; Storage Queues is the cheaper fallback. Pick one.
5. **Bicep vs Terraform for `infra/`.** Recommend Bicep — Azure-native, no state backend needed, deployments tracked in ARM. Terraform is more portable if we ever multi-cloud, but we're Azure-only for the foreseeable future. Reviewer call.
6. **Customer-tenant region detection.** Customer's tenant data may live in any Microsoft region. Our customer-facing region is where we run; we don't store customer's Microsoft data outside our region. OK to pin every customer to our deployment region for v1.

---

## 10. Easy-to-reverse decisions — explicitly deferred

Listed so reviewers don't waste time pushing back on these now:

| Decision | Defer until | Why |
|---|---|---|
| Specific notification channel (Slack vs email vs in-product) | First customer asks | Plug-in shape; one day to swap |
| Specific UI layout for `/console` | First operator session | Iterate from feedback |
| Detection scoring weights | After 100 real incidents | Tune from data |
| Polling interval (5min default) | Customer feedback | Config value |
| Specific Bicep vs Terraform tool | Open question above | Both work; pick later |
| CI/CD platform | Team > 1 person | Laptop deploy works |
| Specific webhook subscription | Customer #5 | Polling is fine for v1 |

---

## 11. Risks called out

A Principal review names risks the recommended path doesn't eliminate:

- **R1 — Microsoft app review delay.** If we ever publish to AppSource, the review can take weeks. Mitigation: defer publication; private invitation links work indefinitely.
- **R2 — Per-tenant DEK rotation.** Rotating a DEK requires re-encrypting all per-tenant secrets. Operationally non-trivial. Mitigation: design rotation runbook before customer 5; practice it on a synthetic tenant.
- **R3 — Service Bus session-based delivery cost.** Standard tier required for sessions; Basic doesn't support them. Adds ~$10/mo at minimum scale. Acceptable.
- **R4 — RLS performance under load.** Postgres RLS adds query overhead. Mitigation: profile under realistic load before customer 10. Cache-friendly query patterns; index on `tenant_id` first.
- **R5 — Customer-side admin churn.** If the customer admin who granted consent leaves, consent persists, but we may lose the human contact. Mitigation: require two admins on customer side at onboarding; document in DPA.
- **R6 — Microsoft Graph throttling.** Audit log polling has rate limits. Mitigation: per-tenant exponential backoff; surface via metrics; alert at sustained throttling.

---

## 12. What changes in the existing repo if this is approved

**Adds (no removals):**

- `docs/MULTI_TENANT_ARCHITECTURE_DECISIONS.md` (this doc, promoted from DRAFT to canonical record)
- `infra/` directory with Bicep modules (week 1+)
- `platform/packages/{orchestration,storage,auth}/` (weeks 2-4)
- `apps/console/` (week 4-5)
- Schema changes to existing entities to enforce `tenant_id` (week 1)

**Stays the same:**

- `@kavachiq/core` — unchanged
- `@kavachiq/platform` — minor OTel additions
- `@kavachiq/schema` — `tenant_id` audit
- Marketing site (`/`, `/platform`, `/demo`, `/evidence`)
- All existing fixtures
- All existing tests

**No removals.** Strangler Fig means everything currently working keeps working.

---

## 13. Sign-off

This document becomes the canonical architectural record only after every checkbox below is signed off. Reviewer can disagree on any specific decision; the doc gets revised and re-circulated. **Implementation does not begin** until D1-D8 + S1 are agreed.

```
[ ] D1  Multi-tenant Microsoft app, day one
[ ] D2  Postgres RLS + per-tenant DEK
[ ] D3  Postgres (state) + Blob (raw archive)
[ ] D4  Azure Service Bus + Container Apps   (or Storage Queues fallback)
[ ] D5  Microsoft Entra External ID
[ ] D6  Single region, designed for multi-region
[ ] D7  OpenTelemetry + Application Insights
[ ] D8  Strangler Fig — wrap @kavachiq/core
[ ] S1  Sequencing: Option B (skip Sprint 0)

[ ] Open question 1 — Postgres region/SKU
[ ] Open question 2 — apps/console same repo or separate
[ ] Open question 3 — separate Entra tenant for operator identity
[ ] Open question 4 — Service Bus vs Storage Queues for v1
[ ] Open question 5 — Bicep vs Terraform for infra/
[ ] Open question 6 — customer-tenant region detection
```

Approver: _________  Date: _________

---

## Appendix A — Strangler Fig pattern, illustrated

The existing pure functions live unchanged at the bottom. Tenant-aware orchestration is layered on top.

```
┌────────────────────────────────────────────────────────┐
│ pipeline-worker (Container Apps)                       │
│   1. dequeue message { tenant_id, raw_event_blob_url } │
│   2. set Postgres app.tenant_id from message           │
│   3. tenantCtx = await loadTenantContext(tenant_id)    │
│      // creds, baselines, sensitivity list             │
│   4. raws = await blobClient.read(blob_url)            │
│   5. ─── existing @kavachiq/core, untouched ───        │
│        normalized = await normalizeRawEvents(raws, {   │
│          snapshotProvider: tenantCtx.snapshotProvider, │
│          ...                                           │
│        })                                              │
│        bundles = correlateNormalizedChanges(           │
│          normalized, { scoringPolicy: tenantCtx.… })   │
│        for bundle of bundles:                          │
│          if bundle.score >= 80:                        │
│            incident = promoteBundleToIncident(...)     │
│            await db.incidents.insert(incident)         │
│   6. ack message                                       │
└────────────────────────────────────────────────────────┘
```

Lines 5-end of `@kavachiq/core` are byte-for-byte the existing code. Lines 1-4 and 6 are the new orchestration. The 67 existing tests still test lines 5-end in isolation.

---

## Appendix B — Why not start with all of Phase 2-4 in this doc

This doc is **infrastructure**, not features. Phase 2 (blast radius), Phase 3 (recovery planning), Phase 4 (execution) are product capabilities that run *on* this infrastructure. Each gets its own design pass. Trying to design all of them in one doc dilutes every decision.

The decisions in this doc are sufficient to carry Phase 2-4 features when they're built. Specifically:

- **Phase 2 blast-radius** writes to Postgres (`blast_radius_results` table — added in that pass), reads from `incidents` and `normalized_changes`. RLS scoped automatically.
- **Phase 3 recovery planning** writes `recovery_plans`, reads from `blast_radius_results`. Same.
- **Phase 4 execution** is a separate service (`@kavachiq/execution`) per the existing architecture lock — read/write trust boundary — but consumes the same Service Bus pattern, same RLS-scoped Postgres reads, same OTel tracing. The "separate execution service" lock in `ENGINEERING_BOOTSTRAP_DECISIONS.md` is honored.
