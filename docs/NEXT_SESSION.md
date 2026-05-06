# Next Session — KavachIQ resume state

**Last updated:** 2026-05-06
**Delete or rewrite when you land the next pass.** This file is a rolling "start here" pointer, not a history.

---

## TL;DR

- **Multi-tenant architecture APPROVED 2026-05-05.** See `docs/MULTI_TENANT_ARCHITECTURE_DECISIONS.md` — D1-D8 + S1 + N1-N10 + Q1-Q7 all signed off. Implementation underway against the 6-week plan in §6.
- **Week 1 of 6 — DONE.** Azure resources provisioned in `rg-kavachiq-platform`: Postgres Flex B1ms, Service Bus Standard, Key Vault, Storage Account (raw-events + baselines), Container Apps env, App Insights + Log Analytics. Schema applied (13 tables, RLS policies). RLS smoke-tested via psql.
- **Week 2 — DONE end-to-end.** Full multi-tenant pipeline working in production architecture:
  - `@kavachiq/storage` — pool, withTenantContext (SET LOCAL transaction-scoped, no pool-lease leak), withAdminContext (BYPASSRLS for outbox publisher), insertIncident / insertCorrelatedChangeBundle / insertNormalizedChange / insertRawEvent (all idempotent ON CONFLICT), enqueueOutboxEvent + fetchPendingOutbox + markOutboxPublished (N3). 0002_admin_grants.sql migration for the BYPASSRLS role.
  - `@kavachiq/orchestration` — pipeline-driver (loads tenant policy → correlate → detect → persist Incident + outbox in same TX), outbox-drainer (BYPASSRLS pull, Service Bus emit, mark published), tenant-context-loader (sensitivity_lists → ScoringPolicy + DetectionPolicy), deterministicBundleId / deterministicIncidentId (N1 — Strangler Fig: post-process random IDs from core).
  - `@kavachiq/workers` — pipeline-worker (Service Bus session-keyed consumer per N7, calls pipeline-driver, drains outbox after each message), health server (live + ready endpoints per N9), run-pipeline-worker entrypoint with SIGTERM handler.
  - **3 smoke tests, 25/25 PASS** against live Azure:
    - `scripts/smoke-storage.ts` — 9/9: RLS isolation, idempotency, admin BYPASSRLS, no-leak across pool leases
    - `scripts/smoke-pipeline.ts` — 8/8: in-process pipeline against live Postgres; bundle + incident persistence, outbox row, RLS isolation, idempotent re-runs
    - `scripts/smoke-e2e.ts` — 8/8: spawn worker as child process, enqueue Service Bus message session-keyed by tenant, wait for incident in Postgres, verify outbox drained, verify notify-operator queue received fanout event, verify SIGTERM exits within 15s (with SIGKILL fallback mirroring Container Apps grace period)
- **Week 2 known caveat:** Service Bus SDK's `acceptNextSession` blocks the event loop in deep AMQP awaits that don't yield to SIGTERM handlers for ~30s. Production-OK because Container Apps `terminationGracePeriodSeconds: 90` SIGKILLs after grace. N2 idempotency makes redelivery of in-flight messages safe. Documented as a real characteristic, not a fix-blocker.
- **Week 3 — Day 1 DONE.** pipeline-worker is deployed and processing messages from inside the cluster:
  - ACR `kavachiqplatformdevacr` provisioned via Bicep, ~$5/mo Basic tier
  - Multi-stage Dockerfile (`platform/Dockerfile.pipeline-worker`) — workspace-aware npm-ci + dist-only runtime, runs as non-root, ~250MB final image
  - `infra/modules/container-app-pipeline-worker.bicep` — KEDA Service Bus scaler (1 replica per 10 queued msgs, max 10), liveness + readiness probes, secrets via Container App secret refs (Service Bus + DATABASE_URL + App Insights)
  - **Bootstrap deadlock found and worked around:** Container Apps + system-assigned-identity + private ACR has a known timing issue (first image pull happens before AcrPull role assignment propagates → deployment expires). Used ACR admin credentials via `listCredentials()` for v1; switching to managed identity is a week-4 hardening pass.
  - **`scripts/smoke-deployed-worker.ts` — 5/5 PASS** against the deployed Container App: enqueue Service Bus message session-keyed by tenant → wait for incident in Postgres → verify outbox drained from inside cluster → verify notify-operator queue received fanout. End-to-end against real cloud infrastructure.
- **Week 3 — Day 2 DONE.** Polling driver shipped end-to-end against the real `patwainc.onmicrosoft.com` test tenant:
  - `@kavachiq/storage` adds: `tenant_credentials` (encrypted_client_secret bytea + DEK URI; v1 noop cipher, KeyVault cipher in week 4), `polling_state` read/write helpers (JS Date → ISO 8601 conversion fixed — PG `::text` cast emits format Graph rejects), Blob client wired against the existing `raw-events` container.
  - `@kavachiq/orchestration` adds: `graph-client` (ClientSecretCredential + `/auditLogs/directoryAudits` filter polling, GraphThrottleError surfaces 429/Retry-After), `polling-driver.pollTenantBatch` (load creds → fetch events → archive Blob → insert raw_events → normalize memberAdded → enqueue process-events session-keyed by tenant → advance cursor; recordPollFailure on throw).
  - **`scripts/smoke-polling.ts` — 8/8 PASS** against `patwainc.onmicrosoft.com`: 21 real audit events fetched from Graph, 40KB archived to Blob, 21 raw_events rows inserted, polling_state cursor advanced, re-run produces 0 duplicates (deterministic raw_event_id + UNIQUE (tenant, microsoft_event_id)).
- **Week 3 — COMPLETE.** All 5 days done. Both workers deployed and smoke-tested end-to-end:
  - Day 3: polling-worker containerized (Dockerfile.polling-worker, createPollingWorker, runPollingWorker), Container App Bicep with KEDA on poll-tenant queue
  - Day 4: Image built + pushed to ACR, deployed ca-polling-worker-dev
  - Day 5: smoke-deployed-polling 6/6 PASS — Sub-flow A (real Graph poll: 21 events → raw_events + Blob + polling_state), Sub-flow B (canonical synthetic process-events → Incident high/95/new + outbox published from inside cluster)
  - **Bugs found + fixed**: (1) KEDA scale-from-zero unreliable for session queues → minReplicas=1 on both workers; (2) polling-worker missing STORAGE_CONNECTION_STRING → added as secret; (3) live patwainc audit log has 0 memberAdded events today (20 unmatched + 1 CA-change) → sub-flow B covers pipeline path with canonical fixture.
  - **Cumulative smoke tests: 44/44 PASS** (smoke-storage 9, smoke-pipeline 8, smoke-e2e 8, smoke-deployed-worker 5, smoke-polling 8, smoke-deployed-polling 6)
  - Now week 4: API + /console + External ID + Playwright browser E2E.
- **Phase 0** (architecture spikes): complete and pushed.
- **Phase 1** (`@kavachiq/core`): **COMPLETE.** All 4 change classes normalized (M1, M2, M3, M4); correlation + detection + snapshot baseline shipped. 79/79 tests PASS.
- **Public site** is live at `https://agents.kavachiq.com` (Azure App Service `kavachiq-agents` in `rg-kavachiq-staging`); staging at `https://staging.kavachiq.com`. SEO-verified (`npm run verify:seo` → 16/16 PASS).
- Working tree clean as of last commit.

---

## What's implemented (platform-side, `@kavachiq/core`)

| Slice | Status | Tests | File |
|---|---|---|---|
| **Normalization — M1 group-member-add** | done | 9 | `src/normalization/member-add.ts` |
| **Normalization — M2 Conditional Access** | done | 9 | `src/normalization/ca-policy-update.ts` |
| **Normalization — M3 app-role-assignment** | done | 10 | `src/normalization/app-role-assignment.ts` |
| **Normalization — M4 SP credential** | done | 12 | `src/normalization/sp-credential-change.ts` |
| **Correlation — memberAdded burst → bundle** | done | 14 | `src/correlation/` |
| **Detection — bundle → Incident (immediate path)** | done | 13 | `src/detection/` |
| **Snapshot provider — group-membership baseline (M1)** | done | partial | `src/normalization/snapshot-provider.ts` |
| **Snapshot provider — app-role-assignment baseline (M3)** | done | partial | same file |
| **Workers (live polling loop)** | stub | — | `packages/workers/src/index.ts` is `export {}` |
| **API server** | stub | — | `packages/api/src/index.ts` is `export {}` |
| **Execution service (Graph writes)** | stub | — | `packages/execution/src/{actions,validation,approval,audit}/` are `export {}` |

Total platform-side test count: **79 passing** at last verification.

## What's implemented (site-side)

| Surface | Notes |
|---|---|
| `agents.kavachiq.com/` | Marketing home — hero, comparison, scenario, request-demo |
| `agents.kavachiq.com/platform` | Product overview — identity assurance, data assurance |
| `agents.kavachiq.com/demo` | **Wired to real platform fixtures.** `src/components/demo/data.ts` imports from `platform/fixtures/canonical/`. Structural fields are platform-derived; downstream cross-system narrative is UI-augmentation (Phase 2/3 not yet built). Each section is annotated `FROM_PLATFORM` vs `UI_AUGMENTATION` in code. |
| `agents.kavachiq.com/evidence` | **New.** Surfaces the WI-05 audit-completeness spike findings + per-class verdict + honest roadmap. Engineering credibility play. |

## Locked decisions (do not reopen)

See `docs/AGENTS_SUBDOMAIN_SEO_PLAN.md` and `docs/AGENTS_SUBDOMAIN_DEPLOY_RUNBOOK.md` for the public-IA + Azure infra. See `docs/ENGINEERING_BOOTSTRAP_DECISIONS.md` for the platform-side architecture locks.

Highlights:
- TypeScript only; Node 20 LTS; Docker Compose for dev
- Read-path monolith (core/api/workers/cli) + separate execution service
- agents.kavachiq.com = public product; staging.kavachiq.com = noindex test env
- B1 App Service Plan shared between both sites; cost ~$13/mo
- Cloudflare DNS, grey-cloud for cert issuance/renewal, orange-cloud OK after bind
- `verify:seo` is the drift detector — run after every deploy

---

## Next 2 concrete tasks

### 1. Week 4 — API package (REST endpoints)

**Why now:** Phase 1 is complete. Week 4 scope: API + /console + External ID auth + Playwright E2E.

**Scope (Week 4 Day 1-2):**
- `packages/api/src/index.ts` — Express/Fastify REST server exposing normalized change + incident read paths
- Auth middleware: validate tenant context from Entra External ID JWT
- Endpoints: `GET /incidents`, `GET /changes`, `GET /health`

**Reference:** `docs/NEXT_SESSION.md` Week 4 tasks; `packages/api/src/index.ts` is currently `export {}`.

### 2. /console operator UI (Next.js)

**Why now:** Week 4 target. Operator UI that reads from the API package.

**Reference:** `site/` directory for Next.js setup pattern.

**Out of scope:** blast-radius, recovery-plan, execution service (Phase 2+).

---

## How to resume in a new session

```bash
cd /Users/gopalpatwa/opt/autonomous-assurance
git log --oneline -5            # see recent state
git status                      # confirm clean

# Platform tests — should be 67 passing
cd platform && npm test
cd ..

# SEO drift check against live agents.kavachiq.com — should be 16/16 PASS
npm run verify:seo
```

**Key docs to read first** (in priority order):

1. This doc.
2. `docs/AGENTS_SUBDOMAIN_DEPLOY_RUNBOOK.md` — Azure + Cloudflare setup; on-call runbook.
3. `docs/SPIKE_REPORT_AUDIT_LOG_COMPLETENESS.md` — drives every confidence tag in the platform pipeline; relevant for the M4 slice.
4. `docs/CANONICAL_SCENARIO_FIXTURE.md` — single reference-truth scenario for the demo + tests.
5. `platform/packages/core/src/normalization/{member-add,ca-policy-update,app-role-assignment}.ts` — reference patterns for M4.

---

## Things intentionally deferred (do not build yet unless asked)

- **Live workers / Graph polling loop.** No downstream consumer that benefits until Phase 2 starts.
- **API server.** No client until operator UI lands in Phase 2.
- **Execution service (Graph writes).** Phase 4. Highest-risk engineering work; do it last per the roadmap.
- **Operator UI** beyond the marketing-site `/demo` mock. Phase 2.
- **Bicep / Terraform IaC** for the Azure + Cloudflare resources. Sketched in deploy runbook §"Upgrade paths"; ~half-day with proper resource import.
- **Redis / Service Bus** for distributed state. `SCALING_STRATEGY.md §8` deferred backlog.

---

## Recent commit trail (newest first)

```
feat(core): Phase 1 normalization slice — SP credential change (M4)
docs: update NEXT_SESSION — week 3 complete, 44/44 smoke tests PASS
feat(platform): smoke-deployed-polling 6/6 PASS — two-sub-flow design
fix(infra): pipeline-worker minReplicas=1 (same KEDA session-queue fix)
fix(infra): polling-worker STORAGE_CONNECTION_STRING + minReplicas=1
feat(platform): polling-worker containerized + deployed (ca-polling-worker-dev)
feat(core): Phase 1 normalization slice — app-role-assignment grant (M3)
```
