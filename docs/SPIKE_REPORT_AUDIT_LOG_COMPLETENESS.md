# Spike Report: Entra Audit Log Completeness (WI-05)

**Work item:** WI-05
**Author:** Phase 0 engineering
**Date:** 2026-04-17
**Status:** **PARTIAL PASS.** Three of four v1 change classes produced real, matchable audit events in this run and are decisively classified. One class (M2 Conditional Access) remained `unknown` because the prerequisite portal edit was not performed during the run's window; re-run is trivial and does not require re-executing M1/M3/M4.
**Prerequisites:** `docs/PHASE0_EXECUTION_BOARD.md §WI-05`, `docs/PHASE0_SPIKE_SPECS.md §Spike 1`, `docs/DATA_MODEL_AND_SCHEMA_SPECIFICATION.md`, `docs/CONNECTOR_AND_INGESTION_DESIGN.md`, `docs/TRUSTED_STATE_BASELINE_DESIGN.md`
**Classification:** Internal

---

## 1. Executive Summary

**What was tested.** A live end-to-end WI-05 run against the test tenant on 2026-04-17: `trigger-canonical-mutations` fired M1, M3, and M4 via their canonical service principals; after a 15-minute propagation wait, `run-audit-completeness-spike` fetched the explicit window and analyzed 20 events. Artifacts in `platform/wi05/`.

**Top findings.**

| Class | Events | Assessment | Short form |
|---|---|---|---|
| M1 Group membership | **12** | **absent** | `newValue` on 12/12; `oldValue` on 0/12 |
| M2 Conditional Access | **0** | **unknown** | Portal edit not performed in window |
| M3 App role assignment | **1** | **absent** | `newValue` on 1/1; `oldValue` on 0/1 |
| M4 SP credential | **4** (2 cert-change + 2 incidental SP update) | **partial** per analyzer; **authoritative** per raw evidence | `KeyDescription.oldValue` AND `.newValue` both present on both cert-change events |

**Recommended before-state strategy for Phase 1 (decisive).**

- **Group membership:** snapshot-diff canonical. Audit provides `newValue` only.
- **Conditional Access:** undetermined from this run; re-run required.
- **App role assignment:** snapshot-diff canonical. Audit provides `newValue` only; same pattern as group membership.
- **SP credential:** **audit is authoritative for metadata**. `KeyDescription` carries both old and new values as serialized arrays of key metadata. `secretText` is never present (expected — Microsoft masks secret material). Snapshot fallback is advisory only.

**Architecture impact.** Small, targeted only. No architectural claim is invalidated. The `StateSnapshot.confidence` tagging in `DATA_MODEL_AND_SCHEMA_SPECIFICATION.md §8` should be wired up so group-membership and app-role-assignment `beforeState` entries default to `"reconstructed"` (snapshot-derived), while SP-credential before-state can be tagged `"authoritative"` (audit-derived). Details in §8.

---

## 2. Spike Objective

Unchanged from `PHASE0_EXECUTION_BOARD.md §WI-05` and `PHASE0_SPIKE_SPECS.md §Spike 1`:

> **Question:** Which v1 change types include `oldValue` / `newValue` on `modifiedProperties`?
>
> **Method:** Exercise the canonical mutations; capture audit events for the window; catalog fields per event type.
>
> **Success criteria:** Documented matrix of event types vs available fields; before-state reconstruction strategy determined.

Scope: four v1 change classes traced through `/auditLogs/directoryAudits`.

---

## 3. Inputs and Environment

| Field | Value |
|---|---|
| Test tenant | `3725cec5-3e2d-402c-a5a6-460c325d8f87` |
| Mutation principals | SP-Execute (M1), manual portal (M2 — not performed in-window), SP-Setup (M3 + M4) |
| M1 service principal ID | `bf131def-02b5-4e90-8f32-ec4b3abf96db` (captured in every M1 event's `initiatedBy.app`) |
| Fetch principal | SP-Read (`/auditLogs/directoryAudits` + filter) |
| Mutation trigger run | commits `083d2bc` (`trigger-canonical-mutations`) + `f890741` (orchestrator); executed `07:40:49Z → 07:43:07Z` (M1/M3/M4); M4 cleanup at `07:47:02Z` |
| Analysis window | `2026-04-17T07:40:00Z → 2026-04-17T08:00:01Z` (20 minutes) |
| Run ID (fetch) | `run_4ed0781f-84ec-44ba-a5b3-be7c09977b25` |
| Correlation ID | `a17f082c-77f3-44f1-90dc-0332b5f2ac4b` |
| Propagation wait | 15 min external (mutations ended 07:47Z; fetch at 08:00Z) |
| Total events fetched | 20 (one page; no `@odata.nextLink`) |
| Matched | 17 (12 + 1 + 4) |
| Unmatched | 3 (1 `Add service principal` + 2 `Update application`) — see §6 |
| Runbook aborted | `false` |

**Caveats about this specific run.**

- The first M3 attempt (`POST /servicePrincipals/{sp}/appRoleAssignedTo` immediately after `POST /servicePrincipals`) returned `404 Not Found` — a known Azure AD replication race on newly-created service principals. After a 90 s wait, the retry succeeded (201 Created). Both the failed and successful Graph request IDs are in `mutation-trail.json`.
- The first M4 `removePassword` call returned `400 Bad Request` (~70 ms after `addPassword`) — a Graph commit race on fresh credentials. A manual retry ~4 minutes later succeeded (204 No Content). The failed attempt is present in the audit log; the successful retry is too. Both orphan cleanup and final state are confirmed clean.
- M2 (CA policy edit) was **not** performed in the portal during the window. The approval-required step was auto-confirmed by `--confirm-all-manual` but that flag does not trigger the edit. `Finance-MFA-Bypass` exists (created manually before this run) but was not modified during the window, so no `Update conditional access policy` event fired.

---

## 4. Change Classes Analyzed

### 4.1 Group membership (M1) — **ABSENT**

- **Events found:** 12 × `Add member to group` (category `GroupManagement`).
- **`initiatedBy.app`:** `SP-Execute` on all 12 — agent-identified provenance confirmed.
- **`modifiedProperties`:** present on 12/12 (on the `User`-type target resource; the `Group`-type target has an empty `modifiedProperties` array).
- **`oldValue`:** 0/12. Every field under `modifiedProperties` has `oldValue: null`.
- **`newValue`:** 12/12. Fields populated on every event: `Group.ObjectID`, `Group.DisplayName`, `ActorId.ServicePrincipalNames`, `SPN`.
- **Usable field shape:** strings wrapped in JSON-encoded quotes (e.g. `"\"45a4b187-c7c6-422a-b82b-48e199f63bb3\""`). Normalization must strip the outer quotes.
- **Anomalies:** None beyond the double-JSON-encoding convention (which is Entra's standard for string-typed properties, not a bug).
- **Sample event IDs:**
  - `Directory_8e8c21df-5150-4b18-8aa5-3cf0cb0c7a35_1UF40_159959089`
  - 11 more in `wi05/raw-events.json`.
- **Assessment:** **absent** — authoritative after-state from audit, no before-state from audit.

### 4.2 Conditional Access policy (M2) — **UNKNOWN (re-run pending)**

- **Events found:** 0.
- **Reason:** The approval-required portal edit was not performed during the window.
- **What this run did NOT test:** presence or absence of `modifiedProperties` / `oldValue` / `newValue` on CA policy events; shape of policy-update audit payload.
- **Remediation:** perform the portal edit (`Entra admin → Identity → Protection → Conditional Access → Policies → Finance-MFA-Bypass → Edit → save`) and re-run `run-audit-completeness-spike --start <pre-edit> --end <now> --output-dir ./wi05 --confirm-all-manual`. M1/M3/M4 evidence is independent and need not be regenerated.

### 4.3 App role assignment (M3) — **ABSENT**

- **Events found:** 1 × `Add app role assignment grant to user` (category `UserManagement`; surprisingly not `ApplicationManagement`).
- **`initiatedBy.app`:** `SP-Setup`.
- **`modifiedProperties`:** present on 1/1 (on the `ServicePrincipal`-type target).
- **`oldValue`:** 0/1. All fields have `oldValue: null`.
- **`newValue`:** 1/1. Rich field set: `AppRole.Id`, `AppRole.Value`, `AppRole.DisplayName`, `AppRoleAssignment.CreatedDateTime`, `AppRoleAssignment.LastModifiedDateTime`, `User.ObjectID`, `User.UPN`, `User.PUID`, `TargetId.ServicePrincipalNames`.
- **Usable field shape:** same double-JSON-encoded strings.
- **Anomalies:** `AppRole.Value` and `AppRole.DisplayName` are empty strings — expected when using the default-access role (`00000000-0000-0000-0000-000000000000`), which has no display name. A custom-role assignment would populate these.
- **Sample event ID:** `Directory_74c794fb-6e3f-4f04-848c-3fd432db28f1_425JC_33677233`.
- **Assessment:** **absent** — same pattern as group membership.

### 4.4 Service principal credential (M4) — **PARTIAL per analyzer, AUTHORITATIVE per raw evidence**

This class has the richest evidence of the four.

- **Events matched by the analyzer's substring rule (`certificates and secrets management` OR `update service principal`):** 4 total.
  - 2 × `Update application – Certificates and secrets management` — **the high-signal events**.
  - 2 × `Update service principal` — low-signal (only `Included Updated Properties` present, no substantive values).
- **Events NOT matched that should have been:** 2 × `Update application` (no "Certificates and secrets management" suffix) — these fire alongside the credential-specific event but have empty `modifiedProperties`, so matching them adds no signal. See §6.

**High-signal events (the two `Certificates and secrets management` events):**

Event A (credential ADD, `addPassword` at `07:43:07.042Z`):
- `KeyDescription.oldValue = "[]"` — empty array string (no prior keys).
- `KeyDescription.newValue = "[\"[KeyIdentifier=c7890f61-2f17-478f-bc60-60fd19c09588,KeyType=Password,KeyUsage=Verify,DisplayName=kavachiq-wi05-spike]\"]"` — full key metadata.
- `Included Updated Properties: newValue = "\"KeyDescription\""`.

Event B (credential REMOVE, `removePassword` cleanup at `07:43:47.016Z`):
- `KeyDescription.oldValue = "[\"[KeyIdentifier=c7890f61-…,DisplayName=kavachiq-wi05-spike]\"]"` — prior key state.
- `KeyDescription.newValue = "[]"` — empty array after removal.
- `Included Updated Properties: newValue = "\"KeyDescription\""`.

**Both old AND new are present on both events.** Entra emits a semantically complete before/after state for credential changes. Secret material (`secretText`) is absent, which is correct — only metadata is logged.

**Why the analyzer marks this as `partial`:** its `isUsable()` function rejects `"[]"`, `""`, and `"null"` as unusable values. On Event A, `oldValue="[]"` is rejected (so `withOldValue` does not increment). On Event B, `newValue="[]"` is rejected. The raw evidence is stronger than the analyzer's verdict — `"[]"` here legitimately means "empty set of credentials", which is authoritative before-state information. See §6.

- **Assessment:** **authoritative** (corrected reading of the raw data); **partial** (analyzer's current `isUsable()` rule).

---

## 5. Audit Completeness Matrix

Verbatim from `wi05/audit-completeness-matrix.json`, augmented with per-class sample event IDs and the corrected reading for M4:

| Change class | Events | modProps | oldValue (usable) | newValue (usable) | Assessment (analyzer) | Corrected assessment | Recommended before-state |
|---|---|---|---|---|---|---|---|
| Group membership | 12 | 12 / 12 | 0 / 12 | 12 / 12 | **absent** | absent | Snapshot-diff canonical |
| Conditional Access policy | 0 | 0 / 0 | 0 / 0 | 0 / 0 | **unknown** | unknown | Undetermined — re-run |
| App role assignment | 1 | 1 / 1 | 0 / 1 | 1 / 1 | **absent** | absent | Snapshot-diff canonical |
| SP credential (cert-change only) | 2 | 2 / 2 | 1 / 2 | 1 / 2 | partial | **authoritative** | Audit-derived from `KeyDescription` |
| SP credential (incl. Update SP) | 4 | 4 / 4 | 1 / 4 | 2 / 4 | **partial** | partial | Audit-derived; ignore low-signal Update-SP events |

Total events fetched: **20**. Matched: **17**. Unmatched: **3** (1 × `Add service principal` (from M3 prereq), 2 × `Update application` (credential correlation stubs with empty modProps)).

---

## 6. Notable Anomalies and Caveats

### 6.1 Observed on real events

1. **Double-JSON-encoded string values.** Entra serializes string properties as `"\"<actual-value>\""` (e.g. `"\"45a4b187-…\""`). Array properties use array notation (e.g. `"[]"`, `"[\"…\"]"`). Normalization must unwrap the outer layer deterministically.
2. **"[]" semantics.** For array-typed `modifiedProperties` entries, `"[]"` is not "missing value" — it is "empty set". For `KeyDescription` specifically, `oldValue="[]"` means "no prior credentials existed". The current analyzer's `isUsable()` treats `"[]"` as absent; this conservatism under-reports audit completeness. **Action:** revise `isUsable` to distinguish `null` (truly missing) from `"[]"` / `""` (meaningfully empty), per field type. Tracked as a follow-up script change, not a Phase 0 blocker.
3. **Category tagging is inconsistent.** `Add app role assignment grant to user` lives under `UserManagement`, not `ApplicationManagement`. Connector classification cannot rely on category alone — `activityDisplayName` is the authoritative discriminator.
4. **Unmatched paired events.** Each `Certificates and secrets management` event is accompanied by an `Update application` event with empty `modifiedProperties`. These are Entra's "application object was updated" correlation stubs. They add no information beyond the specific event and can be ignored during normalization. **Action:** either widen the analyzer's matcher to absorb them (producing a higher `matchCount` but same evidence), or keep the matcher narrow and document the exclusion. Current choice: narrow matcher, documented exclusion.
5. **Azure AD SP replication race (operational).** `POST /servicePrincipals` is eventually-consistent for downstream writes. A 90 s wait between SP creation and app-role assignment on that SP is sufficient in this tenant. Capture this in the execution service's retry policy when it eventually issues comparable writes.
6. **Graph commit race on credential writes (operational).** `POST /applications/{id}/removePassword` within ~100 ms of `POST .../addPassword` can return `400 Bad Request` — the `keyId` is not yet visible to the remove endpoint. A ~seconds-scale delay (or retry with backoff) resolves it. `trigger-canonical-mutations` currently logs the orphan and relies on the operator to clean up; a narrow retry-with-delay on `removePassword` is a cheap follow-up.

### 6.2 M2-specific caveat

M2 evidence is absent from this run because the operator did not perform the portal edit between the approval-step confirmation and the end of the audit window. `--confirm-all-manual` records the acknowledgement but does not trigger the underlying portal action. This is a documented property of the flag, but it means an operator that passes `--confirm-all-manual` must still perform the portal edit during the window for M2 evidence to exist.

---

## 7. Before-state Strategy Recommendation

**Decisive for 3 of 4 classes. One class pending re-run.**

| Class | Final strategy | Evidence |
|---|---|---|
| **Group membership** | **Snapshot-diff canonical.** `NormalizedChange.beforeState` populated from a trusted baseline snapshot and tagged `StateSnapshot.confidence = "reconstructed"`. Audit-derived `newValue` is used as the primary source for `afterState`, tagged `"authoritative"`. | 12/12 events carry `newValue` but 0/12 carry `oldValue`. |
| **Conditional Access policy** | **Undetermined.** Provisional posture: snapshot-diff canonical, audit enrichment optional. Revise after re-run. | 0 events in window. |
| **App role assignment** | **Snapshot-diff canonical.** Same shape as group membership: rich `newValue` (including `AppRoleAssignment.CreatedDateTime` which is itself a useful authoritative after-state field), zero `oldValue`. Before-state must come from snapshot. | 1/1 events carry `newValue` but 0/1 carry `oldValue`. |
| **SP credential** | **Audit-derived authoritative.** `Update application – Certificates and secrets management` events carry both `KeyDescription.oldValue` and `.newValue` (as JSON-array strings of key metadata). Tag `beforeState.confidence = "authoritative"`. Secret material (`secretText`) is not in the audit payload and must never be reconstructed or stored — use `keyId` + `displayName` + `keyUsage` for identity, never the secret. Snapshot fallback advisory only (e.g. to detect silent-drop of credentials outside the audit window). | 2/2 cert-change events carry both. |

Phase 1 ingestion should wire `StateSnapshot.confidence` tagging per this table.

---

## 8. Architecture Impact

**No architectural claim invalidated.** Three targeted, narrow updates are justified by this evidence.

1. **`DATA_MODEL_AND_SCHEMA_SPECIFICATION.md`** — the `StateSnapshot.confidence` enum (authoritative / reconstructed / best-effort / unavailable) is already defined. Add a short §8 note recording the per-class defaults from §7 above so the Phase 1 ingestion team has a specific mapping to implement. No schema change required.
2. **`CONNECTOR_AND_INGESTION_DESIGN.md`** — add a section documenting:
   - the double-JSON-encoding convention on `modifiedProperties` values,
   - the `"[]"` semantics (empty set, not absent), and
   - the two operational races (SP replication for role assignments, Graph commit race for credentials) that the execution service's retry policy must accommodate.
   No architectural change — these are implementation notes for Phase 1.
3. **`trigger-canonical-mutations.ts` and the analyzer** (script-local, not an architecture doc) — two narrow script improvements justified by the evidence:
   - Analyzer's `isUsable()` should distinguish `null` (missing) from `"[]"` / `""` (empty). Would change M4's assessment from `partial` to `authoritative` correctly.
   - `m4-credential-cycle` should retry `removePassword` with a short backoff (e.g. 3× with 2 s / 5 s / 10 s) before marking the secret orphaned. Would have prevented the manual cleanup this run required.

Neither script change is a Phase 0 blocker. Both are good follow-ups.

**Not touched by this evidence:**

- Read-path monolith / separate execution service boundary.
- `NormalizedChange` / `CorrelatedChangeBundle` / `Incident` entity shapes.
- Snapshot-first trusted-state model (reinforced by the M1 and M3 findings).
- Recommendation-first operator posture.

---

## 9. Evidence References

### 9.1 Artifacts used as source of truth

All under `platform/wi05/` (gitignored; regenerated per run):

| Path | Purpose |
|---|---|
| `platform/wi05/raw-events.json` | 20 events fetched during the window |
| `platform/wi05/audit-completeness-matrix.json` | Analyzer findings (4 classes × `matchCount`/`oldValue`/`newValue`/`assessment`/`anomalies`) |
| `platform/wi05/audit-completeness-summary.md` | Analyzer's markdown render |
| `platform/wi05/run-result.json` | Full runbook trail (9 steps, explicit-window path, aborted=false) |
| `platform/wi05/mutation-trail.json` | First-run trail: M1 12/12 success, M2 manual-confirmed, M3 404 failed, M4 not attempted (runbook aborted) |
| `platform/wi05/mutation-trail-m3m4.json` | Retry trail: M3 201 success, M4 add+failed-remove+orphan |

### 9.2 Run metadata

```
Analysis run ID:        run_4ed0781f-84ec-44ba-a5b3-be7c09977b25
Correlation ID:         a17f082c-77f3-44f1-90dc-0332b5f2ac4b
Tenant ID:              3725cec5-3e2d-402c-a5a6-460c325d8f87
Window:                 2026-04-17T07:40:00Z → 2026-04-17T08:00:01Z
Mutations first fired:  2026-04-17T07:40:49Z (M1 index 0)
Mutations last fired:   2026-04-17T07:47:02Z (orphan cleanup removePassword)
Propagation margin:     ~13–20 minutes (all events appeared within this band)
```

### 9.3 Representative event IDs (first matched per class)

| Class | Event ID | `activityDisplayName` |
|---|---|---|
| Group membership | `Directory_8e8c21df-5150-4b18-8aa5-3cf0cb0c7a35_1UF40_159959089` | `Add member to group` |
| App role assignment | `Directory_74c794fb-6e3f-4f04-848c-3fd432db28f1_425JC_33677233` | `Add app role assignment grant to user` |
| SP credential (add) | `Directory_e03bcb0a-1ddc-464c-8b06-ae1925455351_JL2EI_22074709` | `Update application – Certificates and secrets management` |
| SP credential (remove) | `Directory_9c774394-f42a-4e95-a05d-ea3da13d89ad_2OLP4_35211402` | `Update application – Certificates and secrets management` |

### 9.4 Graph request-ids for mutation-trail correlation

M1 (first + last):
- `fd58959a-b275-40f9-86cd-ecc501565b09` (kq-test-05, 07:40:50.167Z, 204)
- `7198443a-9b6e-4c16-a1fe-5c4faa331522` (kq-test-16, 07:40:53.129Z, 204)

M3: `e3155b40-df4c-41ed-8b41-6ff996cd8d19` (appRoleAssignedTo, 07:43:06.455Z, 201)

M4: `f206435b-63ba-4b5c-9434-b39d7f5da214` (addPassword, 07:43:07.147Z, 200); second remove-attempt request-id was captured during orphan cleanup.

---

## 10. Recommendation / Decision

### 10.1 Did WI-05 pass?

**Partial pass.** 3 of 4 change classes produced definitive findings (M1, M3, M4). M2 remained `unknown` due to operator not performing the portal edit during the window — this is a re-run, not a retry of the full mutation sequence, and it does not invalidate the M1/M3/M4 findings.

### 10.2 What engineering should do next

1. **Complete M2 evidence** — next time the operator touches the test tenant, edit `Finance-MFA-Bypass` description in the Entra admin portal, note the timestamp, then:

   ```bash
   cd platform
   END=$(date -u +%Y-%m-%dT%H:%M:%SZ)
   # Start should be ~1 min before the portal edit; choose T accordingly.
   npm run audit-completeness-spike -- \
     --start <T_minus_1min> --end "$END" \
     --output-dir ./wi05 --confirm-all-manual
   jq '.findings[] | select(.key == "conditional-access")' wi05/audit-completeness-matrix.json
   ```

   When the M2 row shows `matchCount > 0`, update §4.2, §5, and §7 of this report (single edit in §7: the CA row flips from "Undetermined" to a concrete strategy based on observed fields).

2. **Begin Phase 1 ingestion** with the strategy from §7 wired in. Do NOT wait for M2 — its outcome only shifts the CA row in §7; every other class is decided.

### 10.3 Uncertainty remaining after this run

- **M2 completeness** (see §10.2).
- **Propagation tail for low-frequency classes.** This run's 15-minute wait was sufficient for all fired events. If customer tenants emit CA/role events rarely, widening to 30 min for routine ingestion may be prudent; a follow-up pass after the M2 re-run can benchmark this per class.
- **Custom-role assignments.** This run used the default-access role (`00000000-…`). When ingestion encounters custom roles with non-empty `AppRole.Value` / `AppRole.DisplayName`, the `newValue` field density is higher. No reason to expect a different `oldValue` pattern, but worth a spot-check in Phase 1.
- **Non-default tenant redaction.** Unlikely in this dev tenant, but audit field masking can differ per customer tenant. Phase 1 connector should log the `activityDisplayName` + `modifiedProperties[*].displayName` distribution per tenant on first ingest so drift is visible.

---

## Appendix A — How to regenerate this report

```bash
cd platform
# Prereq: tenant populated (wi01/applied.json present); CA policy Finance-MFA-Bypass exists.

# 1. Fire M1 / M3 / M4. --confirm-all-manual auto-confirms M2 metadata without
#    triggering it; you must do the portal edit yourself if you want M2 evidence.
npm run trigger-canonical-mutations -- --apply --confirm-all-manual \
  --output ./wi05/mutation-trail.json

# 2. Wait 15 min for propagation. If you want M2 evidence, do the portal edit
#    during this wait (Entra → Identity → Protection → Conditional Access →
#    Policies → Finance-MFA-Bypass → Edit description → Save).

# 3. Fetch an explicit window covering the mutations. Replace <T0> and <T1>.
npm run audit-completeness-spike -- \
  --start <T0-minus-1min> --end <T1> \
  --output-dir ./wi05 --confirm-all-manual

# 4. Inspect.
jq '.findings[] | {key, matchCount, withOldValue, withNewValue, beforeStateAssessment}' \
  wi05/audit-completeness-matrix.json

# 5. Rewrite §3 (tenant/window), §4 per-class, §5 matrix, §9.3-9.4 event IDs,
#    §10.1 pass/fail, then commit. §7 strategy and §8 impact only change if
#    evidence contradicts the current findings.
```

## Appendix B — Follow-up questions and script improvements surfaced by this run

- **Analyzer:** distinguish `null` (missing) vs `"[]"` / `""` (empty) in `isUsable()` — would correctly upgrade M4's verdict from `partial` to `authoritative`.
- **Trigger script:** retry `removePassword` with short backoff before marking orphan — would have prevented the manual cleanup.
- **Trigger script:** insert a small delay between `POST /servicePrincipals` and `POST /servicePrincipals/{sp}/appRoleAssignedTo`, or detect 404 and retry once — would remove the need for the user to split runs.
- **Connector (future):** log the distribution of `activityDisplayName × modifiedProperties[*].displayName` on first ingest per tenant, to catch tenant-specific redaction drift.
- **Schema wiring:** map §7's per-class strategy into `StateSnapshot.confidence` defaults in Phase 1 ingestion.
- **Unmatched `Update application` events:** decision needed — widen analyzer matcher to absorb them, or keep narrow and document as correlation stubs. Current report recommends the latter (they carry no additional evidence).
