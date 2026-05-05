# Next Session — KavachIQ resume state

**Last updated:** 2026-05-04
**Delete or rewrite when you land the next pass.** This file is a rolling "start here" pointer, not a history.

---

## TL;DR

- **Phase 0** (architecture spikes): complete and pushed.
- **Phase 1** (ingestion backbone): substantially advanced — 3 of 4 change classes normalized; correlation, detection, and snapshot-based baseline reconstruction shipped. **M4 (SP credential) normalization is the next platform-side slice.**
- **Public site** is live at `https://agents.kavachiq.com` (Azure App Service `kavachiq-agents` in `rg-kavachiq-staging`); staging at `https://staging.kavachiq.com`. Both serve the same B1 plan. SEO-verified (`npm run verify:seo` → 16/16 PASS).
- **/demo** at `agents.kavachiq.com/demo` is now wired to real platform fixtures — incident id, title, classification, change count, primary actor all derive from `platform/fixtures/canonical/*`. Phase 2/3 narrative fields (blast radius, recovery plan) remain UI-augmentation with explicit code comments.
- **/evidence** is a new page surfacing the WI-05 audit-completeness findings to technical buyers.
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
