# Spike Report: Entra Audit Log Completeness (WI-05)

**Work item:** WI-05
**Author:** Phase 0 engineering
**Date:** 2026-04-16
**Status:** **UNRESOLVED — pending live-tenant execution.**
 The Phase 0 orchestrator (`run-audit-completeness-spike.ts`) is implemented and
 its outputs are the intended source of truth for this report, but **no live
 run has been executed yet**. This document is the partial report shell: every
 section intended to carry observed evidence is marked `UNRESOLVED` and will be
 filled in from real artifacts once the spike runs against the test tenant.
**Prerequisites:** `docs/PHASE0_EXECUTION_BOARD.md §WI-05`, `docs/PHASE0_SPIKE_SPECS.md §Spike 1`, `docs/DATA_MODEL_AND_SCHEMA_SPECIFICATION.md`, `docs/CONNECTOR_AND_INGESTION_DESIGN.md`, `docs/TRUSTED_STATE_BASELINE_DESIGN.md`
**Classification:** Internal

---

## 1. Executive Summary

**What was tested (intended).** Whether Microsoft Entra `directoryAudits` events
for the four v1 change classes expose usable `modifiedProperties`, `oldValue`,
and `newValue` — i.e. whether before-state can be reconstructed from the audit
log alone, or whether a snapshot-diff fallback is required.

**Which artifacts were analyzed.** **None.** The expected artifacts do not
exist in this repository at the time of writing. The only `raw-events.json`
present is the placeholder at `platform/fixtures/canonical/raw-events.json`,
whose content is the empty array `[]` (3 bytes). There is no
`audit-completeness-matrix.json`, `audit-completeness-summary.md`, or
`run-result.json` anywhere in the tree.

**Top findings.** None to report yet. WI-05 success requires live events from
the test tenant; live events are not captured. See §9 for the expected source
artifacts and §10 for the exact steps to produce them.

**Recommended before-state strategy for Phase 1.** Undetermined. The
`CONNECTOR_AND_INGESTION_DESIGN.md` and `TRUSTED_STATE_BASELINE_DESIGN.md`
docs already assume a two-track approach (audit-derived + snapshot-derived
before-state) as the robust worst-case posture. WI-05 is meant to tighten or
relax that assumption. Until WI-05 is executed, Phase 1 planning should
proceed on the assumption of the worst case: **both tracks needed, with
snapshot-diff as the canonical source of before-state**, and audit-derived
before-state treated as optional enrichment.

**Whether any architecture assumption was invalidated.** No. The underlying
architecture (read-path monolith, separate execution service, snapshot-
first trusted state, recommendation-first posture) does not depend on the
WI-05 outcome. What WI-05 affects is the `NormalizedChange.beforeState`
provenance tagging inside ingestion — whether any given before-state is
marked `authoritative`, `reconstructed`, `best-effort`, or `unavailable`
(`StateSnapshot.confidence` in `@kavachiq/schema`).

---

## 2. Spike Objective

Copied verbatim from `PHASE0_EXECUTION_BOARD.md §WI-05` and
`PHASE0_SPIKE_SPECS.md §Spike 1`:

> **Question:** Which v1 change types include `oldValue` / `newValue` on
> `modifiedProperties`?
>
> **Method:** Read 7 days of audit from the test tenant; catalog fields per
> event type.
>
> **Success criteria:** Documented matrix of event types vs available
> fields; before-state reconstruction strategy determined.

Scope: four v1 change classes, each traced through Entra
`/auditLogs/directoryAudits`:

1. Group membership changes (target: `Add member to group`, `Remove member from group`)
2. Conditional Access policy changes (target: `Update/Add/Delete conditional access policy`)
3. App role assignment changes (target: `Add app role assignment to …`, `Remove app role assignment from …`)
4. Service principal credential changes (target: `Update application – Certificates and secrets management`, related SP updates)

For each class, determine whether `modifiedProperties[*].oldValue` and
`.newValue` are present, non-empty, and semantically usable, and classify
the before-state availability as `authoritative | partial | absent | unknown`.

---

## 3. Inputs and Environment

| Field | Value |
|-------|-------|
| Test tenant | **UNRESOLVED** — no live run recorded |
| Time window | **UNRESOLVED** — no window captured |
| Live events used | **No.** No `raw-events.json` with content exists. The only `raw-events.json` in the tree is `platform/fixtures/canonical/raw-events.json` containing `[]` (3 bytes). |
| Script used (intended) | `platform/scripts/run-audit-completeness-spike.ts` (commit `f890741` at the time of writing) |
| Analyzer (intended) | Same script's `analyze()` function, 4-class matcher with anomaly detection |
| Shared platform helpers | `@kavachiq/platform` for env/logging/correlation/errors; `scripts/lib/graph.ts` for paged Graph fetch; `scripts/lib/credentials.ts` for SP-Read auth |
| Runbook | `platform/scripts/lib/runbook.ts` — 9-step runbook (4 approval-required confirmations + wait + fetch + analyze + write) |
| Caveats | The orchestrator has been smoke-tested end-to-end against cached sample events (see commit `464cad2`); the live-tenant fetch path has **not** been exercised because SP-Read cert / tenant are not populated in any `.env.local`. |

---

## 4. Change Classes Analyzed

**All four classes below are UNRESOLVED.** The orchestrator's analyzer
(`run-audit-completeness-spike.ts#analyze`) is implemented and classifies
events using substring matches on `activityDisplayName` plus the
`modifiedProperties` presence / `oldValue` / `newValue` heuristics described
in §2. The classifier was spot-checked on a synthetic 5-event fixture
(commit `464cad2` — one each of the four classes, plus one unmatched
`Update user` control). On that synthetic set the classifier produced:

| Class | Matched | modProps | oldValue | newValue | Assessment |
|---|---|---|---|---|---|
| group-membership | 1 | 1 | 0 | 1 | absent |
| conditional-access | 1 | 1 | 1 | 1 | authoritative |
| app-role-assignment | 1 | 1 | 0 | 1 | absent |
| sp-credential | 1 | 1 | 0 | 1 | absent |

**This synthetic result is not spike evidence.** It proves the classifier
runs; it is not a claim about real Entra behavior. The values above are a
smoke fixture designed to exercise each code path, not a sample of
production Entra events. **Do not cite these rows as WI-05 findings.**

The live-tenant findings, when captured, will populate this section with:

- event count per class
- representative `activityDisplayName` values observed
- `modifiedProperties` presence rate
- `oldValue` / `newValue` presence and usability
- anomalies (see §6)
- the `authoritative | partial | absent | unknown` assessment

### 4.1 Group membership changes

**UNRESOLVED.** Expected trigger: the canonical 12-member-add scenario (see
`CANONICAL_SCENARIO_FIXTURE.md`). Expected `activityDisplayName`:
`Add member to group`.

### 4.2 Conditional Access policy changes

**UNRESOLVED.** Expected trigger: operator edits one of the test CA policies
(`Finance-MFA-Bypass` or `Finance-Data-Restriction`) in the admin portal.
Expected `activityDisplayName` prefix: `Update conditional access policy`.

### 4.3 App role assignment changes

**UNRESOLVED.** Expected trigger: operator assigns an app role to a test
subject. Expected `activityDisplayName`: one of `Add app role assignment to
service principal | … to group | … to user`.

### 4.4 Service principal credential changes

**UNRESOLVED.** Expected trigger: operator adds / removes a client secret or
certificate on one of the test app registrations. Expected
`activityDisplayName`: `Update application – Certificates and secrets
management`.

---

## 5. Audit Completeness Matrix

**UNRESOLVED.** The matrix below is the intended shape; each data cell will
be filled from the real `audit-completeness-matrix.json` once generated.

| Change class | Events found | modProps present | oldValue present | newValue present | Usability | Assessment | Recommended before-state approach |
|---|---|---|---|---|---|---|---|
| Group membership | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ | **UNRESOLVED** | _pending_ |
| Conditional Access policy | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ | **UNRESOLVED** | _pending_ |
| App role assignment | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ | **UNRESOLVED** | _pending_ |
| SP credential | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ | **UNRESOLVED** | _pending_ |

The "Assessment" column will be one of `authoritative | partial | absent |
unknown` per the analyzer's classification rules. The "Recommended
before-state approach" column will map directly into Phase 1 ingestion
behavior (see §7).

---

## 6. Notable Anomalies and Caveats

**No anomalies observed from real events yet.** The orchestrator's analyzer
has anomaly-detection paths for:

- Double-JSON-encoded `oldValue` / `newValue` strings (e.g. `"\"…\""`) — a
  shape Entra is known to emit on some event types.
- Events where `modifiedProperties` exists but every `oldValue` is `null`,
  `"[]"`, or `'""'` — treated as `oldValue` absent.
- `newValue` present with `oldValue` absent → before-state assessment = `absent`.
- Partial coverage (some events have old/new, others do not) → `partial`.
- Zero matched events → `unknown` with an explicit anomaly note that the
  window / trigger may have missed propagation.

Until WI-05 runs, **the set of anomalies that actually occur in this
tenant is unknown**. This section will be rewritten from the real
`audit-completeness-matrix.json#findings[*].anomalies` once available.

Caveats that apply regardless of run:

- `oldValue` for secret material (client secrets, certificate private keys)
  is expected to be absent even when the rest of `modifiedProperties` is
  populated, for security reasons. This is not a bug and will be called out
  explicitly in §4.4 once observed.
- `activityDateTime` is the Entra server-side timestamp; the propagation
  delay to `/auditLogs/directoryAudits` can exceed the default 15-minute
  wait for some event types. The orchestrator's window-widening (±1 minute)
  is insufficient for worst-case propagation — if a class reports
  `matchCount: 0` the first investigation step is to widen `--wait-minutes`.

---

## 7. Before-state Strategy Recommendation

**Provisional, pending live evidence.**

The provisional strategy is the design doc's existing posture: snapshot-
diff is the canonical source of before-state, and audit-derived before-state
is treated as optional enrichment tagged with
`StateSnapshot.confidence = "authoritative"` when both `oldValue` and
`newValue` are present and `StateSnapshot.confidence = "reconstructed"`
otherwise. See `DATA_MODEL_AND_SCHEMA_SPECIFICATION.md §8` for the
`StateSnapshot.confidence` enum.

Per-class decisions will be written against the real assessment:

| Class | If assessment = authoritative | If assessment = partial | If assessment = absent | If assessment = unknown |
|---|---|---|---|---|
| Group membership | Use `modifiedProperties` directly; tag `authoritative` | Combine with snapshot fallback; tag the audit-derived entries `authoritative` and snapshot-derived entries `reconstructed` | Snapshot-diff is the only source; always `reconstructed` | Widen window, re-run; escalate if still unknown |
| CA policy | Use `modifiedProperties` directly; tag `authoritative` | Combine with snapshot fallback | Snapshot-diff of policy JSON only | Widen + retrigger |
| App role assignment | Use `modifiedProperties` directly | Combine with snapshot fallback | Snapshot-diff of assignment enumeration | Widen + retrigger |
| SP credential | Use `modifiedProperties` for metadata; accept that secret material is masked | Accept partial — non-secret fields likely authoritative, secret material `unavailable` | Snapshot-diff of `keyCredentials` / `passwordCredentials` (ids + metadata only) | Widen + retrigger |

**The live WI-05 matrix selects one column per row.** This table should be
collapsed to a single recommendation per class once the spike completes.

---

## 8. Architecture Impact

None yet. WI-05 is expected to produce at most **targeted refinements** to
two documents, not architecture changes:

- `CONNECTOR_AND_INGESTION_DESIGN.md` — if a class reports `absent`, add an
  explicit note that its before-state is snapshot-derived and that audit
  ingestion emits `beforeState: null` (not an empty `StateSnapshot`).
- `TRUSTED_STATE_BASELINE_DESIGN.md` — if the observed propagation delay for
  any class exceeds the currently-assumed snapshot cadence, tighten the
  cadence requirement for that class.

The following assumptions are **not** at risk and will not be revisited by
this spike:

- Read-path monolith vs separate execution service.
- The `NormalizedChange` / `CorrelatedChangeBundle` / `Incident` entity
  shapes in `@kavachiq/schema`.
- The snapshot-first trusted-state model.
- The recommendation-first operator posture.

If the live evidence **does** invalidate one of these, this section will be
rewritten and the affected design doc updated in a separate PR. At the
moment that is a hypothetical — there is no evidence to justify any such
change.

---

## 9. Evidence References

### 9.1 Expected source artifacts (live run)

The orchestrator writes these into its `--output-dir`. They are the
primary evidence for this report once generated:

| Path (relative to repo root) | Present? | Content |
|---|---|---|
| `wi05/raw-events.json` | **NO** | Paged `/auditLogs/directoryAudits` events for the window |
| `wi05/audit-completeness-matrix.json` | **NO** | Per-class findings (counts, old/new presence, assessment, anomalies) |
| `wi05/audit-completeness-summary.md` | **NO** | Operator-facing summary; quotable into this report |
| `wi05/run-result.json` | **NO** | Full runbook trail (steps, statuses, outputsProduced, correlationId) |

*(The directory name `wi05/` is convention; the orchestrator accepts any
path via `--output-dir`.)*

### 9.2 Placeholder in the tree

| Path | Present? | Content |
|---|---|---|
| `platform/fixtures/canonical/raw-events.json` | Yes | Empty array `[]` (3 bytes). Per `platform/fixtures/canonical/README.md`, this is a placeholder to be populated from WI-05 results. **Not spike evidence.** |

### 9.3 Commits of the orchestrator (for re-run reproducibility)

| Commit | Change |
|---|---|
| `ee6f063` | Initial WI-05 orchestrator (fetch + analyzer + markdown) |
| `464cad2` | Refactor onto the Runbook pattern; adds `run-result.json` output |
| `f890741` | Docs update for the runbook pattern |

### 9.4 Representative event IDs

**UNRESOLVED.** Will be populated from `audit-completeness-matrix.json`
(`findings[*].sampleEventIds`, first 5 per class) once available.

---

## 10. Recommendation / Decision

### 10.1 Did WI-05 pass?

**No.** WI-05 cannot pass without live-tenant evidence. It is neither a pass
nor a fail at this moment — it is **not yet executed**. The spike
infrastructure (orchestrator, analyzer, output shape) is complete and has
been smoke-tested end-to-end; what remains is running it against the real
test tenant and populating this report.

### 10.2 What engineering should do next

1. **Populate `.env.local`** with SP-Read credentials against the live test
   tenant and confirm with `npm run setup-test-tenant -- --mode summary`
   (should report `spVerification.read.tokenAcquired: true`).

2. **Execute the four canonical mutations in the test tenant** per the
   checklist printed by:

   ```bash
   npm run audit-completeness-spike -- --mutation-checklist
   ```

   The mutations should originate from the agent-identified SP (or a
   dedicated test agent SP) so events carry `initiatedBy.app`, matching
   production behavior.

3. **Run the orchestrator:**

   ```bash
   npm run audit-completeness-spike -- --output-dir ./wi05
   ```

   On TTY: confirm each of the four `confirm-M*` approval-required steps.
   In CI / non-interactive: pass `--confirm-all-manual`.

4. **Rewrite this report from the generated artifacts.** Specifically:
   replace §3 tenant + window; fill §4 per-class findings from
   `audit-completeness-matrix.json#findings`; complete §5; rewrite §6
   anomalies from `findings[*].anomalies`; collapse §7 per-class tables to a
   single recommendation per class; update §9 with real event IDs; change
   §10.1 to pass/fail.

### 10.3 Uncertainty that will remain even after live execution

- **Propagation tail.** A `matchCount: 0` on any class may mean the event
  never fired, the window was too narrow, or propagation was slow. The
  orchestrator widens ±1 minute; some classes may need larger windows.
- **Agent-vs-user provenance.** `initiatedBy.app` vs `initiatedBy.user`
  classification is not directly part of this spike but is needed for
  incident detection. WI-05 should verify the shape is present and
  consistent; it does not need to assess the semantics here.
- **Tenant-specific field masking.** Some fields may be redacted per
  tenant policy. If the test tenant has non-default masking, findings may
  not generalize to customer tenants. Call this out in §6 if observed.

---

## Appendix A — How to regenerate this report

```bash
# 1. Fill SP-Read env in platform/.env.local.
# 2. Execute the canonical mutations against the test tenant.
# 3. Run the orchestrator:
cd platform
npm run audit-completeness-spike -- --output-dir ./wi05

# 4. Inspect the outputs:
cat ./wi05/audit-completeness-summary.md
jq '.findings[] | {key, matchCount, beforeStateAssessment, anomalies}' \
  ./wi05/audit-completeness-matrix.json

# 5. Rewrite docs/SPIKE_REPORT_AUDIT_LOG_COMPLETENESS.md. §3, §4.1-4.4, §5,
#    §6, §7 (collapsed), §9.4, §10.1 are the sections that change.
```

## Appendix B — Follow-up questions for when the evidence arrives

- If any class assessment comes back `absent`, do we see the same class
  behavior in the delta-query / webhook paths, or is it specific to the
  legacy `directoryAudits` surface? (Out of scope for WI-05 but relevant
  for Phase 1 ingestion.)
- For SP credential changes specifically: is `keyCredentials` /
  `passwordCredentials` ID visible in `modifiedProperties`, or only the
  count? This determines whether the execution service can correlate a
  specific credential-add to a specific audit event.
- For CA policy changes: is the full policy JSON in `newValue`, or just the
  set of modified conditions? This affects how much snapshot coverage is
  needed for policy restoration.
- Propagation-tail empirical bound: what is the maximum observed delay
  between mutation and appearance in `directoryAudits` across the four
  classes? This sets the minimum `--wait-minutes`.
