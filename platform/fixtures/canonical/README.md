# Canonical Scenario Fixtures

Schema-conforming fixture files for the canonical scenario
(*Privileged Group Membership Expansion by Agent* — see
`docs/CANONICAL_SCENARIO_FIXTURE.md`).

These fixtures are **derived artifacts**. They are generated from real
Microsoft Entra audit events captured during WI-05 on 2026-04-17, not
hand-written placeholders. Regenerate with:

```bash
cd platform
npm run generate-canonical-fixtures
```

## Files

| File | Shape (from `@kavachiq/schema`) | Count |
|------|--------------------------------|-------|
| `raw-events.json` | `RawEvent[]` | 12 |
| `normalized-changes.json` | `NormalizedChange[]` | 12 |
| `correlated-bundle.json` | `CorrelatedChangeBundle` | 1 |
| `incident.json` | `Incident` | 1 |
| `blast-radius.json` | (placeholder — Phase 2) | — |
| `recovery-plan.json` | (placeholder — Phase 3) | — |
| `baselines/…` | group-membership + app-role-assignment baseline snapshots | 4 |
| `ca-policy-update/raw-event.json` | `RawEvent` (M2 scenario) | 1 |
| `ca-policy-update/normalized-change.json` | `NormalizedChange` (M2 scenario) | 1 |
| `app-role-assignment-add/raw-event.json` | `RawEvent` (M3 scenario) | 1 |
| `app-role-assignment-add/normalized-change.json` | `NormalizedChange` (M3 scenario) | 1 |

## Source evidence

| Source | Path | Role |
|--------|------|------|
| WI-05 raw audit events | `platform/wi05/raw-events.json` | 12 `Add member to group` events filtered from 34 total — the canonical scenario trigger |
| WI-05 completeness matrix | `platform/wi05/audit-completeness-matrix.json` | Confirmed `matchCount: 12, withOldValue: 0, withNewValue: 12, beforeStateAssessment: "absent"` for group-membership — drives the `StateSnapshot.confidence` tagging below |
| WI-05 spike report | `docs/SPIKE_REPORT_AUDIT_LOG_COMPLETENESS.md §7` | Per-class before-state strategy |
| Canonical scenario | `docs/CANONICAL_SCENARIO_FIXTURE.md` | Incident classification, sensitivity, scoring |
| Generator (M1) | `platform/scripts/generate-canonical-fixtures.ts` | Single-purpose transform (not a framework) |
| Generator (M2) | `platform/scripts/generate-ca-canonical-fixture.ts` | Single-purpose transform for the CA fixture |
| Generator (M3) | `platform/scripts/generate-m3-canonical-fixture.ts` | Single-purpose transform for the app-role-assignment fixture |

M4 (SP credential) evidence from WI-05 is present in
`platform/wi05/raw-events.json` but is **not** part of this canonical
fixture set yet. M2 (Conditional Access) and M3 (app-role-assignment)
are included — see the sections below.

## M2 Conditional Access fixture (`ca-policy-update/`)

Derived from the single real `Update conditional access policy` event
captured in WI-05 — sample event ID
`IPCGraph_e442af57-2eaf-4478-8afa-901c4cf0464d_7G376_5282903`
(spike report §4.2, §9.3). Regenerate with:

```bash
cd platform
npm run build --workspace=@kavachiq/core
npm run generate-ca-canonical-fixture
```

Per WI-05 §4.2 / §7 both `beforeState` and `afterState` come directly
from the audit event (`oldValue` / `newValue` of the
`ConditionalAccessPolicy` modifiedProperty, each a full policy JSON
object). Both are tagged `confidence: "authoritative"` /
`captureSource: "entra-audit"`. The fixture is the mapper's
deterministic output over the real event — **not** invented test data.

The `Update policy` (×2) companion events that fire alongside each CA
edit are not part of this fixture; WI-05 §6.3 documented them as
low-signal stubs that the narrow CA matcher ignores.

## M3 app-role-assignment fixture (`app-role-assignment-add/`)

Derived from the single real `Add app role assignment grant to user`
event captured in WI-05 — sample event ID
`Directory_74c794fb-6e3f-4f04-848c-3fd432db28f1_425JC_33677233`
(spike report §4.3, §9.3). Regenerate with:

```bash
cd platform
npm run build --workspace=@kavachiq/core
npm run generate-m3-canonical-fixture
```

Per WI-05 §4.3 / §7 M3 has the same shape as M1: the single audit event
carries 9 populated `newValue` fields (role, principal, target SP)
and zero usable `oldValue` entries. `beforeState` is therefore
reconstructed from the app-role-assignment baseline at
`fixtures/canonical/baselines/{tenantId}/app-role-assignments/{spId}.json`
(`confidence: "reconstructed"` / `captureSource: "snapshot-diff"`);
`afterState` is tagged `confidence: "authoritative"` /
`captureSource: "entra-audit"`. The fixture is the mapper's
deterministic output over the real event — **not** invented test data.

Notes derived directly from WI-05:
  - `AppRole.Value` and `AppRole.DisplayName` are legitimate empty
    strings for the default-access role (`00000000-…`). Not missing.
  - Category is `UserManagement`, NOT `ApplicationManagement`; the
    discriminator keys on `activityDisplayName`, not category.
  - Accompanying `Update service principal` stubs are ignored by the
    narrow M3 matcher (WI-05 §6.3).

## Fields directly from real audit evidence

These fields trace directly to observed `wi05/raw-events.json` values:

- **`tenantId`** = `3725cec5-3e2d-402c-a5a6-460c325d8f87` (test tenant)
- **`actor`** per `initiatedBy.app`:
  - `type: "service-principal"`
  - `id: "bf131def-02b5-4e90-8f32-ec4b3abf96db"` (SP-Execute `servicePrincipalId`)
  - `displayName: "SP-Execute"`
- **`target`** per `targetResources[type=User]`:
  - `objectType: "user"`
  - `objectId` / `externalId` = real user ID from the event
  - `displayName` = real `userPrincipalName` (e.g. `kq-test-05@patwainc.onmicrosoft.com`)
- **`observedAt`** = `activityDateTime` (microsecond-precision, as emitted by Entra)
- **`afterState.state.auditNewValues`** = each event's `modifiedProperties[*].newValue`,
  with Entra's double-JSON-encoded scalar convention unwrapped per WI-05 §6
- **`correlationHints.timeCluster`** = second-truncated `activityDateTime`
- **`rawEventIds`** / `changeIds` cross-reference the files consistently
- **`bundle.timeRange`** = observed min/max `activityDateTime` across the 12 events
- **`rawPayload`** inside each `RawEvent` = the complete original Graph event, preserved verbatim

## Fields derived from the canonical scenario definition

Where the schema requires values not directly observable in audit, these
come from `docs/CANONICAL_SCENARIO_FIXTURE.md` and are documented here so
reviewers can see the non-audit inputs explicitly:

- **`actor.agentIdentified: true`** — SP-Execute is the test-agent SP for this
  scenario; in a production ingestion path this flag would be set by the
  agent-identified-SP allowlist, not by the audit event itself.
- **`incident.severity: "high"` / `incident.urgency: "immediate"`** —
  canonical scenario §7.
- **`incident.creationType: "immediate"` / `candidateId: null`** —
  score-threshold-driven per canonical scenario §7 (score 95 ≥ 80 immediate
  threshold; no candidate stage).
- **`incident.classificationRationale.signals`** — the four weighted signals
  from canonical scenario §7 (non-human actor +30, target sensitivity +35,
  bulk magnitude +20, change type +10 = 95).
- **`incident.sensitivityContext.targetSensitivity: "high"`** — canonical
  scenario's tenant sensitivity list tags `Finance-Privileged-Access` as
  high-sensitivity.
- **`incident.confidence.level: "high"`** — warranted by 12 authoritative
  audit events + agent-identified actor + high-sensitivity target.

## Confidence and provenance tagging rules (drawn from WI-05 final findings)

Per `docs/SPIKE_REPORT_AUDIT_LOG_COMPLETENESS.md §7` for group membership:

| Where | Value | Rationale |
|-------|-------|-----------|
| `NormalizedChange.beforeState.confidence` | `"reconstructed"` | WI-05 observed 0/12 `oldValue` on group-membership audit events. Before-state must come from a trusted baseline snapshot. |
| `NormalizedChange.beforeState.captureSource` | `"snapshot-diff"` | Marks that this pre-state is snapshot-derived, not audit-derived. |
| `NormalizedChange.afterState.confidence` | `"authoritative"` | 12/12 `newValue` observed; after-state is directly from the audit event. |
| `NormalizedChange.afterState.captureSource` | `"entra-audit"` | Direct from the audit event's `modifiedProperties[*].newValue`. |
| `NormalizedChange.confidence.level` | `"high"` | An authoritative audit event confirms the change itself; the per-side split (auth after / reconstructed before) does not reduce top-level confidence. |
| `NormalizedChange.confidence.reasons` | 3 entries (see file) | Explicitly records what is authoritative vs reconstructed. |
| `NormalizedChange.confidence.missingFields` | `["authoritative-before-state"]` | Honest signal that snapshot is required for full before-state recovery. |

Per-class defaults for other scenarios (not in this fixture set but
documented so the generator can be extended consistently):

| Class | `beforeState.confidence` | `afterState.confidence` | Notes |
|-------|--------------------------|--------------------------|-------|
| Group membership | `reconstructed` | `authoritative` | This fixture |
| Conditional Access policy | `authoritative` | `authoritative` | WI-05 §4.2: full policy JSON in both old and new |
| App role assignment | `reconstructed` | `authoritative` | Same shape as group membership |
| SP credential | `authoritative` (metadata) | `authoritative` (metadata) | `secretText` always `unavailable` |

## Explicit caveats

1. **No Microsoft batch correlation.** WI-05 observed distinct Microsoft
   `correlationId` per member-add (§6 of the spike report). The bundle's
   `correlationSignals` omits `microsoft-batch-correlation`; correlation
   is driven by `same-actor-service-principal` + `same-target-group` +
   `time-cluster-within-3s`.
2. **Tenant identifiers are real.** `tenantId`, user IDs, group ID, SP
   object IDs are from the actual Phase 0 test tenant. Fixtures that need
   sanitized identifiers should re-run the generator against a different
   `wi05/` artifact or post-process the output.
3. **User names are test-tenant names** (`kq-test-05` .. `kq-test-16`),
   not the canonical scenario's product names (Alex Rivera, Jordan Lee,
   …). The fixtures serve Phase 1 normalization tests; they represent the
   canonical scenario's shape, not its product narrative.
4. **Generator is single-purpose.** `scripts/generate-canonical-fixtures.ts`
   handles this scenario only. Additional scenarios (M2 CA edit, M3/M4
   app-role + credential) can be generated as separate one-shot scripts
   if Phase 1 ingestion tests need them.

## Usage

These fixtures are consumed by:

- Phase 1 ingestion pipeline unit tests (normalize → correlate → detect)
- Phase 1 admin CLI (`npm run cli -- inspect fixture …` — not yet built)
- Demo paths (replay a deterministic scenario without hitting a live tenant)

## Regeneration

Any time `platform/wi05/raw-events.json` changes (new WI-05 run), regenerate:

```bash
cd platform
npm run generate-canonical-fixtures
git diff fixtures/canonical/    # review the deltas before committing
```

The generator uses a random UUID seed per run, so `raw-events[i].rawEventId`,
`normalizedChanges[i].changeId`, `bundleId`, and `incidentId` change each
time. If deterministic IDs are needed for test fixtures, wire a `--seed`
flag into the generator (not implemented here).
