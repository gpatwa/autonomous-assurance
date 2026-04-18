# Spike Report: Entra Audit Log Completeness (WI-05)

**Work item:** WI-05
**Author:** Phase 0 engineering
**Date:** 2026-04-18
**Status:** **PASS.** All four v1 change classes produced real, matchable audit events and are decisively classified. The before-state strategy for Phase 1 ingestion is determined per class. WI-05 exits Phase 0.
**Prerequisites:** `docs/PHASE0_EXECUTION_BOARD.md §WI-05`, `docs/PHASE0_SPIKE_SPECS.md §Spike 1`, `docs/DATA_MODEL_AND_SCHEMA_SPECIFICATION.md`, `docs/CONNECTOR_AND_INGESTION_DESIGN.md`, `docs/TRUSTED_STATE_BASELINE_DESIGN.md`
**Classification:** Internal

---

## 1. Executive Summary

**What was tested.** A live end-to-end WI-05 run against the test tenant across two sessions (2026-04-17 and 2026-04-18). `trigger-canonical-mutations` fired M1, M3, and M4 via SP-Execute and SP-Setup on day 1; the operator performed the M2 portal edit on day 2. A single consolidated `audit-completeness-spike` fetch across the 22-hour window captured **34 events**, of which **18 matched** the four v1 change classes (and 16 were unmatched Microsoft-service / portal-sign-in / correlation-stub events).

**Top findings.**

| Class | Events | oldValue | newValue | Assessment | Short form |
|---|---|---|---|---|---|
| M1 Group membership | **12** | 0/12 | 12/12 | **absent** | `newValue` only (`Group.ObjectID`, `Group.DisplayName`, `SPN`) |
| M2 Conditional Access | **1** | 1/1 | 1/1 | **authoritative** | Entire policy JSON in BOTH `oldValue` and `newValue` |
| M3 App role assignment | **1** | 0/1 | 1/1 | **absent** | `newValue` only (rich: `AppRole.*`, `User.*`, `TargetId.*`) |
| M4 SP credential | **4** | 1/4 analyzer, 2/4 corrected | 2/4 analyzer, 2/4 corrected | **authoritative** (corrected reading; analyzer says `partial`) | `KeyDescription` old + new; `secretText` correctly masked |

**Recommended before-state strategy for Phase 1 (decisive per class).**

- **Group membership:** snapshot-diff canonical. Audit provides `newValue` only.
- **Conditional Access:** **audit-derived authoritative** — the event carries the complete pre-edit policy JSON. Normalization can round-trip the policy from the audit alone.
- **App role assignment:** snapshot-diff canonical. Same pattern as group membership.
- **SP credential:** **audit-derived authoritative** for metadata (key identifiers, types, usage, display names). Secret material is correctly absent from the audit record and must never be reconstructed. Snapshot fallback is advisory only.

**Architecture impact.** Small, targeted only. No architectural claim is invalidated. The `StateSnapshot.confidence` tagging in `DATA_MODEL_AND_SCHEMA_SPECIFICATION.md §8` should map per-class defaults: group-membership and app-role-assignment default to `"reconstructed"`; conditional-access and sp-credential default to `"authoritative"`. Implementation notes for normalization belong in `CONNECTOR_AND_INGESTION_DESIGN.md`. Details in §8.

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
| Mutation principals | SP-Execute (M1, day 1), SP-Setup (M3 + M4, day 1), operator portal as `GopalPatwa@patwainc.onmicrosoft.com` via `ADIbizaUX` (M2, day 2) |
| M1 service principal ID | `bf131def-02b5-4e90-8f32-ec4b3abf96db` (every M1 event's `initiatedBy.app`) |
| Fetch principal | SP-Read |
| Mutation timestamps | M1 × 12: `2026-04-17T07:40:49Z → 07:40:53Z`. M3 + orphan cleanup: `07:43–07:47Z`. M2: `2026-04-18T05:35:32Z`. |
| Analysis window | `2026-04-17T07:30:00Z → 2026-04-18T05:41:27Z` (≈22 hours, single consolidated fetch) |
| Analysis run ID | `run_204fba52-dc53-4d43-bff9-2ea002dc6070` |
| Correlation ID | `090608aa-3f0a-4292-b9f9-3071d2ce4a69` |
| Total events | 34 |
| Matched | 18 (12 + 1 + 1 + 4) |
| Unmatched | 16 (see §6) |
| Runbook aborted | `false` |

**Caveats about the run.**

- M1 used SP-Execute → events carry `initiatedBy.app = "SP-Execute"` only (`initiatedBy.user = null`). Production-shaped agent provenance confirmed.
- M3's first attempt hit Azure AD SP-replication race (404 on `POST /servicePrincipals/{sp}/appRoleAssignedTo` ~0.5s after SP creation); a retry ~90s later succeeded. Both attempts' Graph request-ids are in `mutation-trail.json` and `mutation-trail-m3m4.json`. Only the successful assignment produced an event.
- M4's first `removePassword` hit a Graph commit race (400 ~70ms after `addPassword`); a manual retry ~4 minutes later succeeded. Both the failed and successful attempts produced audit events — useful for the "partial" rating below.
- M2 was performed via the Entra admin portal on day 2 by the operator. The `initiatedBy` pattern is different from SP-driven mutations (see §4.2).

---

## 4. Change Classes Analyzed

### 4.1 Group membership (M1) — **ABSENT**

- **Events found:** 12 × `Add member to group` (category `GroupManagement`).
- **`initiatedBy`:** `user: null`, `app.displayName: "SP-Execute"`, `app.servicePrincipalId: bf131def-02b5-4e90-8f32-ec4b3abf96db`. Agent-identified provenance confirmed exactly as the canonical scenario requires.
- **`modifiedProperties`:** present on 12/12, attached to the `User`-type `targetResource`; the `Group`-type `targetResource` has an empty `modifiedProperties` array.
- **`oldValue`:** 0/12.
- **`newValue`:** 12/12. Fields: `Group.ObjectID`, `Group.DisplayName`, `ActorId.ServicePrincipalNames`, `SPN`.
- **Value encoding:** double-JSON-encoded strings (`"\"45a4b187-…\""`, `"\"Finance-Privileged-Access\""`). Normalization must strip the outer layer.
- **Anomalies:** none beyond the double-JSON-encoding convention.
- **Sample event ID:** `Directory_8e8c21df-5150-4b18-8aa5-3cf0cb0c7a35_1UF40_159959089`.
- **Assessment:** **absent** — `afterState` reconstructable from audit; `beforeState` must come from snapshot.

### 4.2 Conditional Access policy (M2) — **AUTHORITATIVE**

**Strongest evidence of any class.**

- **Events found:** 1 × `Update conditional access policy` (category `Policy`, `operationType: Update`, `result: success`).
- **`initiatedBy`:** operator-portal — `user.displayName = "Gopal Patwa"`, `user.userPrincipalName = "GopalPatwa@patwainc.onmicrosoft.com"`, `user.userType = "Member"`, `user.agentType = "notAgentic"`. `app.displayName = "ADIbizaUX"` (Microsoft's Azure portal app) — NOT an agent SP. **This shape is different from M1's agent-initiated events** and must be handled in detection.
- **`targetResources[0]`:** `type: "Policy"`, `displayName: "Finance-MFA-Bypass"`.
- **`modifiedProperties`:** 1 entry with `displayName: "ConditionalAccessPolicy"` — a single property that wraps the ENTIRE policy state as a JSON-encoded string.
  - `oldValue`: complete pre-edit policy JSON (id, state, createdDateTime, conditions.{applications, users, risk*, clientAppTypes}, grantControls). ~800 characters.
  - `newValue`: complete post-edit policy JSON. Differences in this run: `modifiedDateTime` added; `conditions.locations = {includeLocations: ["All"], excludeLocations: []}` added.
  - Both present and parseable as strict JSON.
- **Usable field shape:** NOT the double-JSON-encoded convention used by M1/M3/M4. CA events store the value as a raw JSON string (quotes only at the top level from JSON encoding, but the inner content is directly parseable). Normalization for M2 is distinct from the other classes.
- **Anomalies:** none. `anomalies: []` in the matrix.
- **Sample event ID:** `IPCGraph_e442af57-2eaf-4478-8afa-901c4cf0464d_7G376_5282903`.
- **Assessment:** **authoritative** — before-state is the complete policy JSON in `oldValue`; after-state is the complete policy JSON in `newValue`. No snapshot fallback required for single-edit restoration.

### 4.3 App role assignment (M3) — **ABSENT**

- **Events found:** 1 × `Add app role assignment grant to user`.
- **`category`:** `UserManagement` — NOT `ApplicationManagement`, despite the entity being an app role. Connectors cannot classify by category alone; `activityDisplayName` is the authoritative discriminator.
- **`initiatedBy.app`:** `SP-Setup`.
- **`targetResources[0]`:** `type: "ServicePrincipal"`, `displayName: "KavachiqTest-App-01"`.
- **`modifiedProperties`:** 1 entry on the SP target, 9 fields populated:
  - `AppRole.Id`, `AppRole.Value`, `AppRole.DisplayName`
  - `AppRoleAssignment.CreatedDateTime`, `AppRoleAssignment.LastModifiedDateTime`
  - `User.ObjectID`, `User.UPN`, `User.PUID`
  - `TargetId.ServicePrincipalNames`
- **`oldValue`:** 0/1 (every field `null`).
- **`newValue`:** 1/1 (every field populated with double-JSON-encoded strings).
- **Anomalies:** `AppRole.Value` and `AppRole.DisplayName` are empty strings — expected when using the default-access role (`00000000-…`). Custom roles would populate these.
- **Sample event ID:** `Directory_74c794fb-6e3f-4f04-848c-3fd432db28f1_425JC_33677233`.
- **Assessment:** **absent** — same pattern as M1.

### 4.4 Service principal credential (M4) — **AUTHORITATIVE (corrected); PARTIAL (analyzer)**

- **Events matched by the analyzer's substring rule (`certificates and secrets management` OR `update service principal`):** 4 total.
  - 2 × `Update application – Certificates and secrets management` — **high-signal**.
  - 2 × `Update service principal` — low-signal companion events (only `Included Updated Properties: "\"\""` populated).
- **Events NOT matched that should arguably have been:** 2 × `Update application` — these fire alongside the credential-specific event but have empty `modifiedProperties`, so matching them adds no signal. See §6.

**High-signal events:**

Event A (credential ADD, `addPassword` at `07:43:07.042Z`):
- `KeyDescription.oldValue = "[]"` — empty array (no prior keys).
- `KeyDescription.newValue = "[\"[KeyIdentifier=c7890f61-…,KeyType=Password,KeyUsage=Verify,DisplayName=kavachiq-wi05-spike]\"]"`.

Event B (credential REMOVE, `removePassword` cleanup at `07:43:47.016Z`):
- `KeyDescription.oldValue = "[\"[KeyIdentifier=c7890f61-…]\"]"` — prior key state.
- `KeyDescription.newValue = "[]"` — empty array after removal.

**Both old AND new are present on both events** — they represent the complete delta. Secret material (`secretText`) is absent, as expected.

- **Why the analyzer reports `partial`:** its `isUsable()` rejects `"[]"` as unusable. In context, `"[]"` means "empty set of credentials" — a legitimate state, not missing data. Raw evidence is authoritative; the analyzer's `partial` is conservative. A narrow `isUsable()` fix (distinguish `null` from `"[]"` / `""`) would upgrade the verdict.
- **Assessment:** **authoritative** for metadata (corrected reading).

---

## 5. Audit Completeness Matrix

Verbatim from `wi05/audit-completeness-matrix.json`, with the corrected reading for M4:

| Change class | Events | modProps | oldValue (usable) | newValue (usable) | Assessment (analyzer) | Corrected | Recommended before-state |
|---|---|---|---|---|---|---|---|
| Group membership | 12 | 12 / 12 | 0 / 12 | 12 / 12 | **absent** | absent | Snapshot-diff canonical |
| Conditional Access policy | 1 | 1 / 1 | 1 / 1 | 1 / 1 | **authoritative** | authoritative | Audit-derived (full policy JSON) |
| App role assignment | 1 | 1 / 1 | 0 / 1 | 1 / 1 | **absent** | absent | Snapshot-diff canonical |
| SP credential (cert-change only) | 2 | 2 / 2 | 1 / 2 | 1 / 2 | partial | **authoritative** | Audit-derived (`KeyDescription` metadata) |
| SP credential (incl. Update SP stubs) | 4 | 4 / 4 | 1 / 4 | 2 / 4 | **partial** | partial | Audit-derived; ignore low-signal Update-SP stubs |

**Totals:** 34 events fetched, 18 matched, 16 unmatched (§6 breaks these down).

---

## 6. Notable Anomalies and Caveats

### 6.1 Cross-class observations

1. **Two distinct value-encoding conventions.**
   - M1 / M3 / M4: double-JSON-encoded strings (`"\"value\""`) for scalar properties, JSON-array strings (`"[]"`, `"[\"…\"]"`) for array properties.
   - M2 (CA policy): single JSON-encoded string containing the full nested policy object. No outer double-quote wrapper on the nested object.
   - Normalization must branch on `modifiedProperties[*].displayName` (not on class) to pick the right decoder.
2. **`"[]"` semantics.** For array-typed properties (`KeyDescription`, some `ConditionalAccess` sub-fields), `"[]"` is not "missing" — it is "empty set". The current analyzer's `isUsable()` treats both as absent; revise to distinguish `null` (missing) from `"[]"` / `""` (empty) per field type. Tracked as a follow-up script change.
3. **Category tagging is unreliable for classification.** M3 lives under `UserManagement`, not `ApplicationManagement`. `activityDisplayName` is the canonical discriminator; category is informational only.
4. **Unmatched paired events (2 × `Update application`).** Each cert-change event is accompanied by an `Update application` correlation stub with empty `modifiedProperties`. They add no signal and are ignored by the current narrow matcher. Document the exclusion; no change needed.
5. **Provenance patterns differ across classes.**
   - M1: `initiatedBy.user = null`, `initiatedBy.app = SP-Execute` (agent-identified).
   - M2: `initiatedBy.user = "Gopal Patwa"` + `initiatedBy.app = "ADIbizaUX"` (portal-initiated operator action).
   - M3 + M4: `initiatedBy.user = null`, `initiatedBy.app = SP-Setup`.
   - Detection must handle both user-driven and agent-driven patterns; neither is inherently "suspicious" — context (policy-read tenant config, severity of change) decides.

### 6.2 Operational races observed (for Phase 1 execution-service retry policy)

1. **Azure AD SP replication race.** `POST /servicePrincipals` returns 201 immediately but downstream writes (`POST /servicePrincipals/{sp}/appRoleAssignedTo`) can 404 for ~30-60 seconds. Sufficient waits in this tenant: 90 s resolved it. Execution service must build in a retry-with-delay when issuing comparable writes after SP creation.
2. **Graph commit race on credentials.** `POST /applications/{id}/removePassword` within ~100 ms of `POST .../addPassword` returned 400 Bad Request. A ~3-minute retry succeeded (204 No Content). Suggests a retry-with-backoff on `removePassword` of this shape: 1×2s, 1×5s, 1×10s, then treat as orphan.

### 6.3 Unmatched events (16 of 34 in the consolidated window)

- `Add service principal` (from M3 `ensure-app-sp` prereq, and 4× Microsoft JIT-provisioning activity unrelated to the test). Not a WI-05 class.
- `Update application` (×2) — correlation stubs accompanying M4 cert-changes.
- `Update policy` (×2) — internal companion to the M2 edit; not matched by the narrow CA matcher.
- `Validate user authentication` (portal sign-in during M2).
- `Group_GetDynamicGroupProperties` (portal read during M2).
- Assorted Microsoft-internal activity.

None represent missing evidence for WI-05's four classes.

---

## 7. Before-state Strategy Recommendation

**Decisive for all four classes.**

| Class | Final strategy | `StateSnapshot.confidence` | Evidence |
|---|---|---|---|
| **Group membership** | Snapshot-diff canonical. `beforeState` populated from baseline. Audit's `newValue` → `afterState` only. | `"reconstructed"` on `beforeState`; `"authoritative"` on `afterState` | 12/12 had `newValue`; 0/12 had `oldValue` |
| **Conditional Access policy** | **Audit-derived authoritative.** Parse the `ConditionalAccessPolicy` JSON string directly; `oldValue` and `newValue` are the complete policy objects. Snapshot advisory only (late-arriving edits, tenant-specific redaction). | `"authoritative"` on both sides | 1/1 had both old and new full policy JSON |
| **App role assignment** | Snapshot-diff canonical. Same shape as M1: rich `newValue`, no `oldValue`. | `"reconstructed"` on `beforeState`; `"authoritative"` on `afterState` | 1/1 had `newValue`; 0/1 had `oldValue` |
| **SP credential** | **Audit-derived authoritative** for metadata. Parse `KeyDescription` array entries for `KeyIdentifier`, `KeyType`, `KeyUsage`, `DisplayName`. `secretText` is never present and must never be stored/reconstructed. | `"authoritative"` on both sides (metadata); `"unavailable"` for secret material | 2/2 cert-change events had both old and new `KeyDescription`; `secretText` absent |

Phase 1 ingestion should wire `StateSnapshot.confidence` tagging per this table. Two classes (M1, M3) use snapshot-first; two classes (M2, M4) use audit-first.

---

## 8. Architecture Impact

**No architectural claim invalidated.** Three targeted, narrow updates justified by this evidence.

1. **`DATA_MODEL_AND_SCHEMA_SPECIFICATION.md §8`** — add a short table mapping per-class defaults for `StateSnapshot.confidence` from §7. Two classes (M1, M3) default to `"reconstructed"` on `beforeState`; two classes (M2, M4) default to `"authoritative"`. `secretText` explicitly `"unavailable"`. No schema change.
2. **`CONNECTOR_AND_INGESTION_DESIGN.md`** — add a normalization section documenting:
   - the two value-encoding conventions (double-JSON for scalar/array fields on M1/M3/M4; single-JSON policy object on M2),
   - the `"[]"` = empty-set semantics,
   - the unreliable `category` tag (use `activityDisplayName` as discriminator),
   - the correlation-stub events to ignore (`Update application` with empty modProps; `Update service principal` with only `Included Updated Properties`),
   - the two operational races the execution-service retry policy must handle (SP replication on `appRoleAssignedTo`; Graph commit on `removePassword`).
   No architectural change — these are implementation notes for Phase 1.
3. **Script-local follow-ups** (not arch docs) — two small improvements justified by the evidence:
   - Analyzer `isUsable()`: distinguish `null` from `"[]"` / `""`. Would correctly upgrade M4 to `authoritative`.
   - `m4-credential-cycle`: retry `removePassword` with 1×2s, 1×5s, 1×10s before orphaning. Would have prevented the manual cleanup in this run.

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
| `platform/wi05/raw-events.json` | 34 events in the consolidated 22-hour window (current on-disk state) |
| `platform/wi05/audit-completeness-matrix.json` | Analyzer findings: 4 classes × counts × assessment × anomalies |
| `platform/wi05/audit-completeness-summary.md` | Analyzer's markdown render |
| `platform/wi05/run-result.json` | Runbook trail for the consolidated fetch (explicit-window path, 3 executed / 6 skipped / 0 failed, `aborted: false`) |
| `platform/wi05/mutation-trail.json` | Day-1 first run: M1 12/12 success; M3 404 pre-retry; M4 not attempted (runbook aborted) |
| `platform/wi05/mutation-trail-m3m4.json` | Day-1 retry: M3 success after SP-replication wait; M4 add + failed-remove + orphan |

### 9.2 Run metadata

```
Analysis run ID:       run_204fba52-dc53-4d43-bff9-2ea002dc6070
Correlation ID:        090608aa-3f0a-4292-b9f9-3071d2ce4a69
Tenant ID:             3725cec5-3e2d-402c-a5a6-460c325d8f87
Window:                2026-04-17T07:30:00Z → 2026-04-18T05:41:27Z
Mutations fired:       2026-04-17T07:40:49Z .. 07:47:02Z (M1, M3, M4)
                       2026-04-18T05:35:32Z            (M2)
Total events fetched:  34
Matched:               18
Unmatched:             16
```

### 9.3 Representative event IDs (first matched per class)

| Class | Event ID | `activityDisplayName` |
|---|---|---|
| Group membership | `Directory_8e8c21df-5150-4b18-8aa5-3cf0cb0c7a35_1UF40_159959089` | `Add member to group` |
| Conditional Access policy | `IPCGraph_e442af57-2eaf-4478-8afa-901c4cf0464d_7G376_5282903` | `Update conditional access policy` |
| App role assignment | `Directory_74c794fb-6e3f-4f04-848c-3fd432db28f1_425JC_33677233` | `Add app role assignment grant to user` |
| SP credential (add) | `Directory_e03bcb0a-1ddc-464c-8b06-ae1925455351_JL2EI_22074709` | `Update application – Certificates and secrets management` |
| SP credential (remove) | `Directory_9c774394-f42a-4e95-a05d-ea3da13d89ad_2OLP4_35211402` | `Update application – Certificates and secrets management` |

### 9.4 Graph request-ids for mutation-trail correlation

M1 (first + last):
- `fd58959a-b275-40f9-86cd-ecc501565b09` (kq-test-05, 07:40:50.167Z, 204)
- `7198443a-9b6e-4c16-a1fe-5c4faa331522` (kq-test-16, 07:40:53.129Z, 204)

M3: `e3155b40-df4c-41ed-8b41-6ff996cd8d19` (appRoleAssignedTo, 07:43:06.455Z, 201)

M4: `f206435b-63ba-4b5c-9434-b39d7f5da214` (addPassword, 07:43:07.147Z, 200).

M2 was operator-portal-initiated; no Graph request-id under our control. Correlation is via `activityDateTime` + `targetResources[0].id` (policy ID `62eb2eec-…`).

---

## 10. Recommendation / Decision

### 10.1 Did WI-05 pass?

**Yes — full pass.** All four v1 change classes produced matchable events; all four before-state strategies are determined (§7). Phase 1 ingestion can proceed with a concrete per-class mapping and clear normalization rules.

### 10.2 What engineering should do next

WI-05 exits Phase 0. The next concrete tasks:

1. **WI-11: canonical fixture generation.** Use the real `wi05/raw-events.json` (34 events; 18 matched across 4 classes) to emit schema-conforming fixtures into `platform/fixtures/canonical/`. Specifically:
   - `raw-events.json` — the 12 M1 events (the canonical scenario's trigger).
   - `normalized-changes.json` — `NormalizedChange[]` with per-class `StateSnapshot.confidence` tagging per §7.
   - `correlated-bundle.json` — one `CorrelatedChangeBundle` grouping the 12 by `actorSessionId` / `operationBatchId` / `timeCluster`.
   - `incident.json` — the expected `Incident` output of detection.
   Pure data transformation, no new packages. Closes the Phase 0 → Phase 1 handoff loop.

2. **Targeted design-doc updates** (narrow, narrow-scope) — update `DATA_MODEL_AND_SCHEMA_SPECIFICATION.md §8` with the per-class `StateSnapshot.confidence` mapping, and `CONNECTOR_AND_INGESTION_DESIGN.md` with the normalization notes from §8 above. Separate PR from WI-11.

### 10.3 Residual uncertainty

- **Custom-role assignments.** This run used the default-access role (`00000000-…`). Custom roles should populate `AppRole.Value` and `AppRole.DisplayName`. No reason to expect a different `oldValue` pattern; spot-check in Phase 1.
- **Multi-field CA edits.** This run's edit added a `locations` condition set. Entra appears to send the whole policy regardless of which fields changed; re-validate on a multi-field edit to confirm.
- **Tenant-specific redaction.** Unlikely in this dev tenant; Phase 1 connector should log the `activityDisplayName` × `modifiedProperties[*].displayName` distribution on first ingest per customer tenant to surface any drift.
- **Propagation-tail for low-frequency classes.** The 22-hour window easily covered all events; no propagation gaps were observed. For real-time ingestion, a 5–15 minute delay is the working assumption.

---

## Appendix A — How to regenerate this report

```bash
cd platform
# Prereq: tenant populated; CA policy Finance-MFA-Bypass exists;
# SP-Read, SP-Execute, SP-Setup credentials in .env.local.

# 1. Fire M1 / M3 / M4. --confirm-all-manual auto-confirms M2 metadata
#    without triggering it; do the M2 portal edit yourself during the
#    run or soon after (within the chosen window).
npm run trigger-canonical-mutations -- --apply --confirm-all-manual \
  --output ./wi05/mutation-trail.json

# 2. Edit Finance-MFA-Bypass description in the Entra admin portal
#    (Identity → Protection → Conditional Access → Policies → click the policy).
#    Save. Note the timestamp.

# 3. Wait 15 min for propagation, then fetch a window covering all mutations.
#    On macOS with BSD date:
START=$(date -u -v-30M +%Y-%m-%dT%H:%M:%SZ)   # or a fixed pre-mutation time
END=$(date -u +%Y-%m-%dT%H:%M:%SZ)
npm run audit-completeness-spike -- \
  --start "$START" --end "$END" \
  --output-dir ./wi05 --confirm-all-manual

# 4. Inspect.
jq '.findings[] | {key, matchCount, withOldValue, withNewValue, beforeStateAssessment}' \
  wi05/audit-completeness-matrix.json

# 5. Rewrite §3 (window), §4 per-class, §5 matrix, §9.3-9.4 event IDs,
#    §10.1 pass/fail. §7 strategy changes only if evidence contradicts
#    the current findings.
```

## Appendix B — Follow-up script improvements surfaced by this run

- **Analyzer `isUsable()`:** distinguish `null` (missing) from `"[]"` / `""` (empty). Would correctly upgrade M4 to `authoritative`.
- **`trigger-canonical-mutations` M4:** retry `removePassword` with short backoff before orphan-marking.
- **`trigger-canonical-mutations` M3:** insert a small delay (or detect 404 + retry once) between `POST /servicePrincipals` and `POST /servicePrincipals/{sp}/appRoleAssignedTo` to absorb the Azure AD replication race.
- **Connector logging (Phase 1):** log per-tenant `activityDisplayName` × `modifiedProperties[*].displayName` distribution on first ingest.
- **Unmatched `Update application` / `Update policy` correlation stubs:** keep narrow matcher; document as known non-signal events.
