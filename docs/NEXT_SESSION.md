# Next Session — KavachIQ resume state

**Last updated:** 2026-05-05
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
- **Week 3 — Day 3-5 NEXT.** Containerize polling-worker (same pattern as pipeline-worker; Container App job with KEDA cron scaler against `poll-tenant` Service Bus queue). Deployed-worker E2E: trigger a poll, watch deployed pipeline-worker promote a memberAdded burst into an Incident. Then week 4: API + /console + External ID + Playwright browser E2E.
- **Phase 0** (architecture spikes): complete and pushed.
- **Phase 1** (`@kavachiq/core`): 3 of 4 change classes normalized (M1, M2, M3); correlation + detection + snapshot baseline shipped. **M4 (SP credential) normalization** is the remaining platform-side slice.
- **Public site** is live at `https://agents.kavachiq.com` (Azure App Service `kavachiq-agents` in `rg-kavachiq-staging`); staging at `https://staging.kavachiq.com`. SEO-verified (`npm run verify:seo` → 16/16 PASS).
- Working tree clean as of last commit.

---

## What's implemented (platform-side, `@kavachiq/core`)

| Slice | Status | Tests | File |
|---|---|---|---|
| **Normalization — M1 group-member-add** | done | 9 | `src/normalization/member-add.ts` |
| **Normalization — M2 Conditional Access** | done | 9 | `src/normalization/ca-policy-update.ts` |
| **Normalization — M3 app-role-assignment** | done | 10 | `src/normalization/app-role-assignment.ts` |
| **Normalization — M4 SP credential** | NOT STARTED | — | next slice |
| **Correlation — memberAdded burst → bundle** | done | 14 | `src/correlation/` |
| **Detection — bundle → Incident (immediate path)** | done | 13 | `src/detection/` |
| **Snapshot provider — group-membership baseline (M1)** | done | partial | `src/normalization/snapshot-provider.ts` |
| **Snapshot provider — app-role-assignment baseline (M3)** | done | partial | same file |
| **Workers (live polling loop)** | stub | — | `packages/workers/src/index.ts` is `export {}` |
| **API server** | stub | — | `packages/api/src/index.ts` is `export {}` |
| **Execution service (Graph writes)** | stub | — | `packages/execution/src/{actions,validation,approval,audit}/` are `export {}` |

Total platform-side test count: **67 passing** at last verification.

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

### 1. M4 SP-credential normalization slice

**Why now:** completes Phase 1's per-class coverage. Last of the four WI-05 classes.

**Scope:** mirror M2 (audit-authoritative both sides — both `oldValue` and `newValue` carry KeyDescription metadata). `secretText` always tagged `confidence: "unavailable"`; never stored or reconstructed.

**Reference:** `docs/SPIKE_REPORT_AUDIT_LOG_COMPLETENESS.md §4.4` for the encoding pattern; M2 mapper (`ca-policy-update.ts`) for the audit-authoritative shape.

**Out of scope:** correlation for credential events, detection rules. Same pattern as M2/M3 slices.

**Budget:** ~1 day including a generator + canonical fixture from real WI-05 evidence.

### 2. Wire `/demo` more deeply once Phase 2 (blast radius) ships

**Why later:** today blast-radius and recovery-plan in `/demo` are honestly tagged `UI_AUGMENTATION` in code because the platform doesn't generate them yet. Once Phase 2 (`@kavachiq/core/blast-radius`) lands, swap the next layer of demo data from hand-built to platform-derived.

**Out of scope until Phase 2 starts:** there's no platform output to wire.

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
docs(demo): pre-demo checklist + DEMO_SCRIPT timestamp refresh
docs: deploy runbook for Azure + Cloudflare provisioning
feat(site): post-deploy SEO verifier + dev-default tightening + deploy checklist
docs: agents subdomain SEO plan + buyer-doc URL updates
feat(site): move public product surface to agents.kavachiq.com
feat(core): Phase 1 normalization slice — app-role-assignment grant (M3)
feat(core): Phase 1 normalization slice — Conditional Access policy update
feat(core): filesystem snapshot-provider adapter for group-membership baselines
feat(core): Phase 1 detection slice — CorrelatedChangeBundle → Incident
fix(core): normalize test return type includes `source` in Omit
feat(core): Phase 1 correlation slice — memberAdded burst → CorrelatedChangeBundle
```

The /demo wiring + /evidence + this doc refresh land as the next commits on top.
