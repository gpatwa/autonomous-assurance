# Next Session — KavachIQ resume state

**Last updated:** 2026-04-21
**Delete or rewrite when you land the next pass.** This file is a rolling "start here" pointer, not a history.

---

## TL;DR

- Phase 0 is **complete and pushed**: WI-01 tenant setup, WI-05 audit-completeness spike (FULL PASS), WI-11 canonical fixtures all shipped.
- Phase 1 is **in progress**: two slices landed in `@kavachiq/core` — normalization (group-member-add) and correlation (12 → 1 bundle).
- Next slice is **detection / incident creation** (`CorrelatedChangeBundle` → `Incident`).
- One commit is **local-only** at the time of writing: `43ec7d1` (correlation slice). Everything else is on `origin/main`.

---

## Git state

```
origin/main at: 2b525b7 feat(core): Phase 1 ingestion slice — group-member-add normalization
local main at:  43ec7d1 feat(core): Phase 1 correlation slice — memberAdded burst → CorrelatedChangeBundle
```

To push the local-only commit: `git push`.

Recent commit trail (top = newest):

```
43ec7d1  Phase 1 correlation slice                         ← LOCAL ONLY
2b525b7  Phase 1 ingestion slice (group-member-add)
af112fe  SCALING_STRATEGY.md decision record
c974341  DATA_MODEL §8 per-class StateSnapshot defaults
f2b2b7c  CONNECTOR §23 WI-05 implementation notes
c138ddf  WI-11 canonical fixtures from real evidence
d880932  WI-05 spike report — FULL PASS
```

---

## Locked decisions (do not reopen)

- TypeScript only; Node.js runtime; Docker Compose for dev
- Read-path monolith (`@kavachiq/core`, `@kavachiq/api`, `@kavachiq/workers`, `@kavachiq/cli`) + **separate** execution service (`@kavachiq/execution`)
- `@kavachiq/platform` is for cross-cutting plumbing only; no secret resolution there
- Credential construction stays in script-local code (`scripts/lib/credentials.ts`) and will stay local to each service at its edge
- Canonical scenario is the 12-member-add burst against `Finance-Privileged-Access`
- Fixtures come from real WI-05 evidence (no hand-written test data)
- Per-class before-state strategy per WI-05:
  - group-membership → snapshot-first / `reconstructed`
  - conditional-access → audit-first / `authoritative` (full policy JSON)
  - app-role-assignment → snapshot-first / `reconstructed`
  - sp-credential metadata → audit-first / `authoritative` (`secretText` always `unavailable`)
- **No Microsoft batch correlation** for member-adds (WI-05 §23.E): correlate on actor + target group + changeType + time bucket

See `ENGINEERING_BOOTSTRAP_DECISIONS.md` for the full lock list and `SCALING_STRATEGY.md` for the "stay on TypeScript to 1000+ tenants" analysis.

---

## What's implemented

| Area | Location | Status |
|---|---|---|
| Shared schema | `platform/packages/schema/` | 14 enums, 6 shared types, 25 entities |
| Shared platform | `platform/packages/platform/` | config, observability, errors, utils |
| Graph transport | `platform/scripts/lib/transport.ts` | `get`/`delete`/`post`/`getPaged` + ResponseHeadersSummary |
| Script-local credentials | `platform/scripts/lib/credentials.ts` | SP-Read / SP-Execute / SP-Setup |
| Runbook helper | `platform/scripts/lib/runbook.ts` | automatic / manual / approval-required steps, abort semantics |
| Phase 0 spike scripts | `platform/scripts/{setup-test-tenant,fetch-audit-events,test-member-removal,run-audit-completeness-spike,trigger-canonical-mutations,generate-canonical-fixtures}.ts` | All real, runnable |
| Canonical fixtures | `platform/fixtures/canonical/{raw-events,normalized-changes,correlated-bundle,incident}.json` | Derived from real WI-05 events |
| **Phase 1 normalization slice** | `platform/packages/core/src/normalization/` | 8 tests passing |
| **Phase 1 correlation slice** | `platform/packages/core/src/correlation/` | 14 tests passing |

Not yet implemented:
- Detection / incident promotion (next pass)
- Real baseline snapshot provider (current: Phase 1 test stub)
- Other change-class normalizers (CA, app role assignment, SP credential)
- API layer, operator UI, execution-service business logic
- Ingestion polling loop (workers) — we have normalization but nothing polls Graph yet

---

## Next 2 concrete tasks (in order)

### Task 1 — Detection slice: `CorrelatedChangeBundle` → `Incident`

**Target fixture:** `platform/fixtures/canonical/incident.json`
**New module:** `platform/packages/core/src/detection/`

Shape:
- `promoteBundleToIncident(bundle, changes, policy) → Incident | IncidentCandidate`
- If `bundle.incidentCandidateScore >= 80`: immediate promotion (`creationType: "immediate"`, `candidateId: null`).
- Else: emit `IncidentCandidate` (deferred — not needed for canonical scenario; canonical scores 95).
- Populate `classificationRationale.signals` with the four weighted signals already computed in correlation (non-human actor, target sensitivity, bulk, change type). Carry them forward verbatim — do not recompute.
- `severity: "high"`, `urgency: "immediate"`, `confidence.level: "high"`, `status: "new"` for the canonical case.
- `sensitivityContext.targetSensitivity: "high"` from the same policy used in correlation scoring.

Test structure (mirrors the two prior slices):
- Load `correlated-bundle.json` + `normalized-changes.json`.
- Run `promoteBundleToIncident`.
- `deepEqual` to `incident.json` modulo `incidentId` / `createdAt` / `detectedAt` / `updatedAt` (time-varying).

Budget: ~1 day.

### Task 2 — Real snapshot-provider adapter (still stubbed)

**Location:** swap in `platform/packages/core/src/normalization/snapshot-provider.ts`.

Replace the Phase 1 test stub with a filesystem-backed provider that reads group-membership baseline state from a fixture JSON. Adds coverage for the `isMember: true` pre-state (idempotent re-add path). Unblocks non-canonical scenario testing. Budget: ~2 days including the baseline fixture data.

---

## How to resume in a new session

Quick sanity + pick up:

```bash
cd /Users/gopalpatwa/opt/autonomous-assurance
git log --oneline -5            # should show 43ec7d1 on top
cd platform
npm install                     # no-op if already installed
npm run typecheck                # should pass across schema / platform / core / api / workers / execution / cli + scripts
npm test                         # should run 22 tests: 8 normalization + 14 correlation; all passing
npm run build                    # should emit dist/ per workspace
```

Key files to read first (in priority order) when starting the new session:

1. This doc (`docs/NEXT_SESSION.md`).
2. `docs/SPIKE_REPORT_AUDIT_LOG_COMPLETENESS.md` — WI-05 evidence summary. Everything downstream depends on §7 per-class strategy.
3. `docs/SCALING_STRATEGY.md` — why the stack is what it is, and the Phase 1 backlog beyond features.
4. `platform/fixtures/canonical/README.md` — fixture provenance; what's real vs what's scenario shaping.
5. `platform/packages/core/src/normalization/` — first Phase 1 slice as the reference pattern.
6. `platform/packages/core/src/correlation/` — second Phase 1 slice as the near-reference pattern for the detection slice.

Look at `platform/packages/core/src/correlation/correlate.test.ts` for the test pattern to mirror in the detection slice.

---

## Things intentionally deferred (do not build yet unless asked)

- External correlation state (Redis). `SCALING_STRATEGY.md §8` backlog item — right time is after the read-path monolith has one live customer, not now.
- Service Bus queue between ingestion and normalization. Same backlog.
- Actual Entra audit polling loop (workers). Until detection lands, there's no downstream consumer that benefits.
- M2 / M3 / M4 class normalizers. WI-05 proved the evidence is there; Phase 1 delivers each class on demand.
- Incident storage, query layer, operator UI, execution-service business logic. Phase 2+.

---

## Minor known debt surfaced during Phase 0 / Phase 1 (not blockers)

- Analyzer `isUsable()` in `scripts/run-audit-completeness-spike.ts` rejects `"[]"` as absent; should distinguish `null` from empty-set. Would upgrade M4 verdict from `partial` to `authoritative` (SPIKE_REPORT §6, §7).
- `trigger-canonical-mutations` M4 `removePassword` can race; a 2 s/5 s/10 s retry would eliminate manual orphan cleanup (SPIKE_REPORT Appendix B).
- Correlation uses fixed 60 s buckets; events straddling a minute boundary split into two bundles. Sliding window is a refinement for later.
- Canonical-fixture generator emits random UUIDs per run; `generate-canonical-fixtures --seed <n>` for deterministic test IDs is worth adding when the fixture set grows beyond one scenario.

These are follow-ups, not blockers for the next session.
