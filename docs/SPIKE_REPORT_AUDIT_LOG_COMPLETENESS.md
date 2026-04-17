# Spike Report: Entra Audit Log Completeness (WI-05)

**Work item:** WI-05
**Author:** Phase 0 engineering
**Date:** 2026-04-17
**Status:** **INCONCLUSIVE** — orchestrator executed successfully against the live test tenant, but **0 audit events matched any of the four v1 change classes** during the observation window. Root cause is well-understood (the run used `--confirm-all-manual` without actually performing the underlying canonical mutations); remediation is a single command (`trigger-canonical-mutations --apply`) followed by a re-run of the orchestrator. The WI-05 infrastructure is verified; the completeness questions themselves remain unanswered.
**Prerequisites:** `docs/PHASE0_EXECUTION_BOARD.md §WI-05`, `docs/PHASE0_SPIKE_SPECS.md §Spike 1`, `docs/DATA_MODEL_AND_SCHEMA_SPECIFICATION.md`, `docs/CONNECTOR_AND_INGESTION_DESIGN.md`, `docs/TRUSTED_STATE_BASELINE_DESIGN.md`
**Classification:** Internal

---

## 1. Executive Summary

**What was tested.** The orchestrator `run-audit-completeness-spike.ts` was executed end-to-end against the live Entra test tenant (`3725cec5-…`) on 2026-04-17 at 06:10:54 UTC. The runbook completed without aborting; all three outputs were written; zero audit events were observed in the 17-minute window.

**Which artifacts were analyzed.** The four files in `platform/wi05/` produced by the run:

| File | Size | Content |
|---|---|---|
| `raw-events.json` | 3 B | `[]` — zero audit events fetched |
| `audit-completeness-matrix.json` | 2.3 kB | All four class findings with `matchCount: 0, beforeStateAssessment: unknown` |
| `audit-completeness-summary.md` | 1.8 kB | Markdown render of the matrix |
| `run-result.json` | 6.1 kB | Full runbook trail — 4 approvals confirmed, 4 automatic steps executed, 0 failed |

**Top finding.** The run captured **no evidence** for any of the four change classes — not because Entra failed to emit events, but because **no mutations were performed** during the observation window. The `--confirm-all-manual` flag records operator acknowledgement; it does not verify that the underlying mutation actually occurred. In this run, acknowledgement was given but the four mutations (M1 group-member add × 12, M2 CA policy edit, M3 app role assignment, M4 SP credential add) never fired.

**What IS confirmed by this run.**

1. SP-Read cert + client-secret authentication against the test tenant works.
2. `GET /auditLogs/directoryAudits` paging works (1 page, 0 events, 1.1 s).
3. The analyzer correctly classifies an empty window as `unknown` per class (not `absent`).
4. The runbook pattern's abort semantics held (zero failures, `aborted: false`).
5. Outputs were written to the expected paths and are well-formed JSON / Markdown.

**What remains unanswered.** Every WI-05 content question: does Entra expose `oldValue` / `newValue` via `modifiedProperties`? What's the per-class before-state assessment? What anomalies are present? None of these can be answered from an empty event set.

**Recommended before-state strategy for Phase 1.** Undetermined from this run. The provisional worst-case posture documented in `CONNECTOR_AND_INGESTION_DESIGN.md` (snapshot-first trusted state, audit-derived before-state as optional enrichment) remains the conservative default until WI-05 produces conclusive evidence.

**Whether any architecture assumption was invalidated.** No. The only assumption this run tested was that SP-Read + the `/auditLogs/directoryAudits` endpoint + the 4-class classifier work together — they do. No architectural claim can be invalidated (or validated) by an empty event set.

---

## 2. Spike Objective

Copied verbatim from `PHASE0_EXECUTION_BOARD.md §WI-05` and
`PHASE0_SPIKE_SPECS.md §Spike 1`:

> **Question:** Which v1 change types include `oldValue` / `newValue` on `modifiedProperties`?
>
> **Method:** Read 7 days of audit from the test tenant; catalog fields per event type.
>
> **Success criteria:** Documented matrix of event types vs available fields; before-state reconstruction strategy determined.

Scope: four v1 change classes, traced through Entra `/auditLogs/directoryAudits`:

1. Group membership changes (target: `Add member to group`, `Remove member from group`)
2. Conditional Access policy changes (target: `Update/Add/Delete conditional access policy`)
3. App role assignment changes (target: `Add app role assignment to …`, `Remove app role assignment from …`)
4. Service principal credential changes (target: `Update application – Certificates and secrets management`, related SP updates)

For each class, determine whether `modifiedProperties[*].oldValue` and `.newValue` are present, non-empty, and semantically usable, and classify before-state availability as `authoritative | partial | absent | unknown`.

---

## 3. Inputs and Environment

| Field | Value |
|-------|-------|
| Test tenant | `3725cec5-3e2d-402c-a5a6-460c325d8f87` (per `run-result.json#runMetadata.tenantId`) |
| Time window | `2026-04-17T06:09:54.416Z` → `2026-04-17T06:26:54.476Z` (17 min, including ±1 min widening) |
| Run ID | `run_553e8f15-1488-43ba-89c7-fc74baa9c131` |
| Correlation ID | `dc7ac46d-e3f0-478e-aed0-17271761d8c6` |
| Live events used | **Yes — the fetch was real.** SP-Read authenticated, paged `directoryAudits`, returned 0 events. |
| Script used | `platform/scripts/run-audit-completeness-spike.ts` at commit `f890741`. Discovery + 4-class analyzer via SP-Read; manual confirmation via `--confirm-all-manual`. |
| Principal | SP-Read only. Client-secret auth (cert auth is preferred; to be rotated before Phase 1). |
| Runbook elapsed | 901.17 s (15 min propagation wait + 1.1 s fetch + <1 ms analysis + <1 ms write). |
| Total events fetched | **0** |
| Unmatched events | **0** |
| Runbook aborted | `false` |
| Runbook summary | `executed: 4, confirmed: 4, skipped: 1, failed: 0` |

**Explicit caveat about this run.** The four `confirm-M*` approval-required steps all auto-confirmed at the same millisecond (`2026-04-17T06:10:54.416Z`) via `--confirm-all-manual`. This means the operator passed the acknowledgement flag **without performing the four underlying canonical mutations** between confirmation and the 15-minute propagation wait. The tenant was quiet during the window, so zero events appeared. This is not an infrastructure problem — the run correctly recorded what it observed (nothing).

The `trigger-canonical-mutations.ts` script (committed 2026-04-17, commits `cd27b4f`, `d457ce7`, `8011199`) was written to close exactly this gap: it performs M1 / M3 / M4 automatically via SP-Execute / SP-Setup and leaves M2 as a precise portal instruction. Re-running WI-05 after `trigger-canonical-mutations --apply` is the remediation path.

---

## 4. Change Classes Analyzed

All four classes resolved to the same state in this run: **INCONCLUSIVE** due to zero matched events.

| Section | What the artifact says | Interpretation |
|---|---|---|
| Match count | `0` | No events of this type appeared in the window. |
| modifiedProperties present | `0 / 0` | No events to evaluate. |
| oldValue present | `0 / 0` | No events to evaluate. |
| newValue present | `0 / 0` | No events to evaluate. |
| Both old+new | `0 / 0` | No events to evaluate. |
| Before-state assessment | `unknown` | The analyzer's correct output when `matchCount: 0`. |
| Anomalies | `"No events matched for this class during the window."` | Auto-generated by the analyzer. |
| Sample event IDs | `[]` | No events to sample. |

### 4.1 Group membership changes

**INCONCLUSIVE.** 0 matched events. Expected trigger (not executed during this window): the canonical 12-member-add scenario via SP-Execute (so events carry `initiatedBy.app`).

### 4.2 Conditional Access policy changes

**INCONCLUSIVE.** 0 matched events. Expected trigger: an operator edit to `Finance-MFA-Bypass` (the policy was created earlier at approximately 2026-04-16T22:21Z; that timestamp is outside this run's window).

### 4.3 App role assignment changes

**INCONCLUSIVE.** 0 matched events. Expected trigger: `POST /servicePrincipals/{sp}/appRoleAssignedTo` against one of the `KavachiqTest-App-NN` service principals.

### 4.4 Service principal credential changes

**INCONCLUSIVE.** 0 matched events. Expected trigger: `POST /applications/{id}/addPassword` + `POST /applications/{id}/removePassword` on one of the `KavachiqTest-App-NN` app registrations.

---

## 5. Audit Completeness Matrix

Verbatim from `wi05/audit-completeness-matrix.json`:

| Change class | Events found | modProps | oldValue | newValue | Usability | Assessment | Recommended before-state approach |
|---|---|---|---|---|---|---|---|
| Group membership | 0 | 0 / 0 | 0 / 0 | 0 / 0 | n/a | **unknown** | Cannot determine — re-run |
| Conditional Access policy | 0 | 0 / 0 | 0 / 0 | 0 / 0 | n/a | **unknown** | Cannot determine — re-run |
| App role assignment | 0 | 0 / 0 | 0 / 0 | 0 / 0 | n/a | **unknown** | Cannot determine — re-run |
| SP credential | 0 | 0 / 0 | 0 / 0 | 0 / 0 | n/a | **unknown** | Cannot determine — re-run |

Total events fetched: **0**. Unmatched events: **0**. `overallBeforeStateRecommendation` from the analyzer: `"No matched events in the window. Re-run WI-05 mutations and widen --wait-minutes before drawing conclusions."`

---

## 6. Notable Anomalies and Caveats

### 6.1 Observed in this run

- **Zero events in the window.** The only anomaly present. Each finding's `anomalies[]` contains exactly `"No events matched for this class during the window."`.

### 6.2 Infrastructure-level positives (no code anomalies)

- SP-Read token acquisition succeeded (implicit, since the fetch completed).
- `/auditLogs/directoryAudits` fetch returned HTTP 200 with an empty `value[]` in 1.1 s (one page, no `@odata.nextLink`).
- Runbook abort semantics held: no step failed, no step skipped due to abort.
- Output artifacts are well-formed and self-consistent (matrix totals match the per-class rows; raw-events is `[]`).

### 6.3 Operator-flow caveat to carry forward

The `--confirm-all-manual` flag silently records "confirmed" without verifying the underlying mutation fired. This is consistent with its documented behavior (see `platform/scripts/README.md` → "Human-in-the-loop automation pattern"), but in an interactive-optional CI context it is easy to misuse as "do all four mutations for me." The planned remediation is `trigger-canonical-mutations.ts`, which performs M1 / M3 / M4 automatically; the approval-required M2 step still requires a real portal edit between the prompt and confirmation.

---

## 7. Before-state Strategy Recommendation

**Undetermined from this run.** The provisional worst-case posture remains in force:

> Snapshot-diff is the canonical source of before-state. Audit-derived before-state is treated as optional enrichment, tagged `StateSnapshot.confidence = "authoritative"` when both `oldValue` and `newValue` are present, and `"reconstructed"` otherwise. See `DATA_MODEL_AND_SCHEMA_SPECIFICATION.md §8`.

Per-class decisions will be written against the real assessment once a non-empty WI-05 run completes:

| Class | If assessment = authoritative | If assessment = partial | If assessment = absent | If assessment = unknown (current) |
|---|---|---|---|---|
| Group membership | Use `modifiedProperties` directly; tag `authoritative` | Combine with snapshot fallback | Snapshot-diff is the only source; always `reconstructed` | **Current state** — re-run with real mutations |
| CA policy | Use `modifiedProperties` directly; tag `authoritative` | Combine with snapshot fallback | Snapshot-diff of policy JSON only | **Current state** — re-run with real mutations |
| App role assignment | Use `modifiedProperties` directly | Combine with snapshot fallback | Snapshot-diff of assignment enumeration | **Current state** — re-run with real mutations |
| SP credential | Use `modifiedProperties` for metadata; accept secret material is masked | Non-secret fields likely authoritative, secret material `unavailable` | Snapshot-diff of `keyCredentials` / `passwordCredentials` | **Current state** — re-run with real mutations |

Phase 1 ingestion design should proceed on the `unknown` column (= worst-case) until WI-05 produces a different result.

---

## 8. Architecture Impact

**None.** This run validated only that the WI-05 pipeline executes end-to-end and correctly reports `unknown` on an empty window. It provided no evidence for or against any architectural claim. The docs listed below are unchanged:

- `CONNECTOR_AND_INGESTION_DESIGN.md`
- `TRUSTED_STATE_BASELINE_DESIGN.md`
- `DATA_MODEL_AND_SCHEMA_SPECIFICATION.md`
- `ENGINEERING_BOOTSTRAP_DECISIONS.md`

Any architecture update would require a follow-up WI-05 run with actual mutations. If a class reports `absent` in that run, `CONNECTOR_AND_INGESTION_DESIGN.md` would need a small per-class note (not a core change). If propagation-delay data from that run exceeds the currently-assumed snapshot cadence, `TRUSTED_STATE_BASELINE_DESIGN.md` would get a cadence-adjustment note. Both are hypothetical until the next run.

---

## 9. Evidence References

### 9.1 Artifacts used as source of truth

All four files live in `platform/wi05/` (gitignored per `platform/.gitignore`):

| Path | Size | SHA-like handle |
|---|---|---|
| `platform/wi05/raw-events.json` | 3 B | Empty array `[]` |
| `platform/wi05/audit-completeness-matrix.json` | 2.3 kB | 4 findings × `{matchCount: 0, assessment: "unknown"}` |
| `platform/wi05/audit-completeness-summary.md` | 1.8 kB | Markdown render of the matrix |
| `platform/wi05/run-result.json` | 6.1 kB | Runbook with 4 confirmed + 4 executed + 1 skipped + 0 failed, `aborted: false` |

### 9.2 Run metadata from `run-result.json`

```
runId:          run_553e8f15-1488-43ba-89c7-fc74baa9c131
correlationId:  dc7ac46d-e3f0-478e-aed0-17271761d8c6
tenantId:       3725cec5-3e2d-402c-a5a6-460c325d8f87
startedAt:      2026-04-17T06:10:54.414Z
finishedAt:     2026-04-17T06:25:55.584Z
elapsedMs:      901170
window.start:   2026-04-17T06:09:54.416Z
window.end:     2026-04-17T06:26:54.476Z
```

### 9.3 Step statuses (from `run-result.json#runbook.steps[*]`)

| Step ID | Kind | Status | Notes |
|---|---|---|---|
| `confirm-M1-group-membership` | approval-required | `confirmed` | `confirmedBy: confirm-all, confirmedAt: 06:10:54.416Z` |
| `confirm-M2-conditional-access` | approval-required | `confirmed` | Same timestamp |
| `confirm-M3-app-role-assignment` | approval-required | `confirmed` | Same timestamp |
| `confirm-M4-sp-credential` | approval-required | `confirmed` | Same timestamp |
| `capture-window-and-wait` | automatic | `executed` | 900.064 s elapsed (15 min wait) |
| `fetch-audit-events` | automatic | `executed` | 1.1 s, 0 events, path `.../wi05/raw-events.json` |
| `load-cached-events` | automatic | `skipped` | `skipReason: "not in --skip-fetch mode"` |
| `analyze-completeness` | automatic | `executed` | 1 ms, 4 findings all `unknown` |
| `write-artifacts` | automatic | `executed` | 1 ms, wrote matrix + summary |

### 9.4 Representative event IDs

None. The raw-events file is the empty array.

### 9.5 Commits of the orchestrator used for this run

| Commit | Role |
|---|---|
| `ee6f063` | Initial WI-05 orchestrator (fetch + analyzer + markdown) |
| `464cad2` | Runbook refactor; added `run-result.json` |
| `f890741` | Docs + the build at the time of this run |

Two commits landed **after** this run and are relevant to the next run:

| Commit | Role |
|---|---|
| `cd27b4f` | `trigger-canonical-mutations` commit 1 — M1 automation |
| `d457ce7` | `trigger-canonical-mutations` commit 2 — M2 approval step |
| `8011199` | `trigger-canonical-mutations` commit 3 — M3 + M4 |

---

## 10. Recommendation / Decision

### 10.1 Did WI-05 pass?

**No — inconclusive.** The orchestrator ran correctly and the infrastructure is verified, but the spike's central questions (per-class `oldValue` / `newValue` presence) cannot be answered from a zero-event window. WI-05 does not pass until a run produces `matchCount > 0` for the four classes.

### 10.2 What engineering should do next — single remediation command

```bash
cd platform

# Step 1 — actually perform the four canonical mutations. M1 / M3 / M4 automated;
# M2 is an approval-required portal edit (30-second operator action).
npm run trigger-canonical-mutations -- --apply --output ./wi05/mutation-trail.json

# Step 2 — wait 15 min for propagation, then re-run the orchestrator. Use
# --confirm-all-manual honestly this time (the mutations actually fired in step 1).
npm run audit-completeness-spike -- --output-dir ./wi05 --confirm-all-manual
```

After step 2, the four files in `platform/wi05/` are regenerated with real data. Rewriting this report at that point is mechanical — §3 gains a non-zero event count; §4 gains per-class findings from the matrix; §5 fills in; §6 expands with real anomalies; §7 collapses to a single recommendation per class; §9.4 lists real event IDs; §10.1 flips to pass/fail.

### 10.3 Uncertainty that will remain even after the next run

- **Propagation tail.** If a class reports `matchCount: 0` again after real mutations, the first hypothesis is propagation delay > 15 minutes. Re-run with `--wait-minutes 30` before concluding the event was not emitted.
- **Agent-vs-user provenance.** The `mutation-trail.json` produced by `trigger-canonical-mutations` will record which principal fired each mutation (SP-Execute for M1, operator-portal for M2, SP-Setup for M3/M4). The analyzer does not currently cross-check `initiatedBy` against this, but the evidence is there if needed.
- **Tenant-specific field masking.** If this tenant has non-default audit-field redaction (unusual for a test tenant, but possible), findings may not generalize to customer tenants. Would be called out in §6 if observed in the re-run.

---

## Appendix A — How to regenerate this report from a real run

```bash
cd platform

# 1. Fire the four canonical mutations (M1 via SP-Execute so initiatedBy.app is correct).
npm run trigger-canonical-mutations -- --apply --output ./wi05/mutation-trail.json

# 2. Wait propagation + fetch + analyze + write artifacts.
npm run audit-completeness-spike -- --output-dir ./wi05 --confirm-all-manual

# 3. Inspect what changed.
cat ./wi05/audit-completeness-summary.md
jq '.findings[] | {key, matchCount, beforeStateAssessment, anomalies}' \
   ./wi05/audit-completeness-matrix.json
jq '.summary, .attempts | length' ./wi05/mutation-trail.json

# 4. Rewrite docs/SPIKE_REPORT_AUDIT_LOG_COMPLETENESS.md. §3, §4.1-4.4, §5, §6,
#    §7 (collapsed), §9.4, §10.1 are the sections that change.
```

## Appendix B — Follow-up questions for the next run

- If any class assessment comes back `absent`, do we see the same class behavior in the delta-query / webhook paths, or is it specific to the legacy `directoryAudits` surface? (Out of scope for WI-05 but relevant for Phase 1 ingestion.)
- For SP credential changes specifically: is the `keyId` from `addPassword` / `removePassword` visible in `modifiedProperties` (so we can correlate a specific credential lifecycle to specific audit events)?
- For CA policy changes: is the full policy JSON in `newValue`, or just the set of modified conditions? Affects how much snapshot coverage is needed for policy restoration.
- Propagation-tail empirical bound: what is the maximum observed delay between mutation (recorded in `mutation-trail.json#attempts[*].finishedAt`) and appearance in `directoryAudits#activityDateTime` across the four classes? Sets the minimum `--wait-minutes`.
- For M3 specifically: does the incidental "Add service principal" event (emitted by `m3-ensure-app-sp` when the SP was missing) land in `directoryAudits`, or only in the service principal activity logs? Affects whether `trigger-canonical-mutations` needs to surface it as a separate MutationAttempt.
