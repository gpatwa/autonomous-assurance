# Trusted-State / Baseline Design

**Author:** Principal Architect  
**Date:** April 2026  
**Status:** Draft for internal review  
**Prerequisite:** Architecture Memo (docs/ARCHITECTURE_MEMO.md)  
**Classification:** Internal / Confidential

---

## 1. Executive Summary

KavachIQ's core promise is returning an enterprise environment to a "trusted operational state" after high-impact agent-driven changes. That promise depends on knowing what "trusted" looks like. This document defines how the system models, stores, compares, and validates state.

**The fundamental problem:** "trusted state" is not a single thing. It is at least five distinct concepts that must not be conflated: current observed state, pre-incident state, operator-approved baseline, intended policy state, and recovery target state. Collapsing these into one "baseline" produces a system that is confident but wrong.

**Recommended model:** A versioned, operator-approved baseline built from periodic snapshots supplemented by event-sourced incremental updates. The baseline is never automatically authoritative. It requires operator review at creation and at each refresh. Recovery planning compares against the most recent approved baseline, not against the latest snapshot. Every comparison carries an explicit confidence score. The system never silently validates against stale or unreviewed state.

**Key trade-off:** Requiring operator approval of baselines adds friction to onboarding and ongoing operations. The alternative (treating any snapshot as authoritative) is simpler but means the system may validate recovery against a compromised or drifted state, destroying trust in the product.

---

## 2. Problem Statement

### Why trusted state is hard

**Current state may already be wrong.** When a customer first connects KavachIQ, the tenant's current state may contain drift, misconfiguration, or active compromise. Treating current state as "trusted" at connection time means the system will validate future recoveries against a potentially broken baseline.

**The latest snapshot may contain the bad change.** If the system takes a snapshot after an incident but before the incident is detected, the snapshot includes the harmful change. Recovering "to the latest baseline" would restore the harmful state.

**Legitimate changes happen continuously.** Between any two snapshots, operators, automation, and lifecycle processes make thousands of legitimate changes. The system must distinguish harmful change from normal operational change without operator classification of every event.

**Some state is inherited, not stored.** SharePoint access inherited through group membership is not directly recorded as a SharePoint permission object. It is derived at access time. The system cannot observe derived state by reading the SharePoint permission model alone; it must infer it from the group membership and the permission inheritance configuration.

**Audit logs are delayed and incomplete.** Entra audit logs arrive with 2-15 minute latency. M365 unified audit logs can be delayed up to 24 hours. Some change types do not generate audit events at all. The system's view of what has changed is always a subset of what has actually changed.

**Downstream systems are eventually consistent.** Reverting an Entra group membership does not instantly revoke SharePoint access. Token caches, provisioning sync delays, and application-level caching mean that the "current state" observed 30 seconds after a recovery action may not reflect the final state. Validation performed too early produces false results.

**"Undo the last change" is not "restore trusted state."** If an agent adds 12 users to a group, and between detection and recovery, an operator independently removes 2 of those users for a different reason, "undo the agent's change" and "restore the group to its pre-incident state" produce different results. The system must decide which is correct.

---

## 3. Terms and Definitions

| Term | Definition | Example |
|------|-----------|---------|
| **Current observed state** | The state of an object as read from the live API right now | Finance-Privileged-Access group currently has 16 members |
| **Pre-incident state** | The state of affected objects immediately before the incident-triggering change | Finance-Privileged-Access group had 4 members before the agent added 12 |
| **Baseline state** | An operator-approved snapshot of what the environment should look like | The approved baseline shows Finance-Privileged-Access with 4 specific members |
| **Intended state** | What the operator or policy declares the state should be, independent of observation | Policy says Finance-Privileged-Access should have exactly these 4 named users |
| **Recovery target state** | The specific state the recovery plan aims to restore | Restore Finance-Privileged-Access to the 4 members listed in baseline version 47 |
| **Post-recovery state** | The observed state after recovery actions have been executed | After rollback, Finance-Privileged-Access has 4 members |
| **Trusted operational state** | A validated condition where all affected objects match the recovery target and downstream propagation is confirmed | All 7 verification checks pass: group, SharePoint, Exchange, CA, Teams, ERP, audit trail |
| **Drift** | A difference between current observed state and the approved baseline that is not associated with a known incident | Group has 5 members but baseline says 4; the extra member was added by an operator outside incident flow |
| **Validation state** | The result of comparing post-recovery state against recovery target | Match (verified), Mismatch (failed), Unknown (propagation pending), Partial (some checks pass) |
| **Confidence** | The system's assessment of how reliable a given state observation is | High (read from live API < 5 min ago), Medium (derived from audit log), Low (inferred from stale snapshot) |

---

## 4. Design Goals

The trusted-state system must:

1. **Support point-in-time comparison.** Compare current state against any prior baseline version for any object.
2. **Enable recovery validation.** After recovery actions execute, validate that the environment matches the recovery target.
3. **Detect drift.** Identify when the current state has diverged from the approved baseline, independent of incident detection.
4. **Require operator review.** Baselines are never automatically authoritative. Operators must approve baseline state at creation and can invalidate it.
5. **Maintain version history.** Multiple baseline versions are retained so the system can compare against any prior approved state.
6. **Handle partial knowledge.** The system must represent what it does not know as explicitly as what it does know. Missing data is not the same as matching data.
7. **Feed recovery planning.** The recovery planner selects a recovery target from the baseline store. The baseline must carry enough context for the planner to distinguish rollback from restoration from compensating action.
8. **Signal confidence.** Every state comparison must carry a confidence indicator. The system must never present low-confidence validation as certainty.

---

## 5. Non-Goals and Boundaries

- **Not file-level backup.** The system does not store SharePoint file content, email bodies, or document versions. It stores permission and access state at the control-plane level.
- **Not intent inference.** The system does not automatically determine whether a change was intended or harmful. It presents state differences; operators classify intent.
- **Not universal Microsoft surface coverage in v1.** v1 focuses on the objects most critical for identity-first recovery: groups, CA policies, app role assignments, service principals, and SharePoint site-level permissions. Deeper Exchange, Teams, and OneDrive coverage is v2+.
- **Not automatic baseline correction.** The system does not automatically update the baseline when it detects drift. Drift requires operator acknowledgment or explicit approval to become part of the new baseline.

---

## 6. Baseline Model Options

### Option A: Snapshot-Only Baseline

**How it works:** Take periodic full snapshots of all tracked objects via Graph API. Store each snapshot as a baseline version. Compare current state against the latest snapshot.

| Dimension | Assessment |
|-----------|-----------|
| Simplicity | High. Snapshot and diff. |
| Freshness | Poor between snapshots. A daily snapshot is up to 24 hours stale. |
| API cost | High. Full enumeration of groups, members, apps, policies, permissions on every refresh. |
| Completeness | Good for directly observable state. Cannot capture derived or inherited state. |
| Failure mode | If the snapshot runs after a harmful change but before detection, the baseline contains the bad state. |
| v1 fit | Viable as a starting point but insufficient alone. |

### Option B: Event-Sourced Reconstructed State

**How it works:** Ingest all audit log events. Reconstruct current state by replaying the event stream from an initial known state. The "baseline" is the state at any point in the event stream.

| Dimension | Assessment |
|-----------|-----------|
| Freshness | Near-real-time (limited by audit log latency). |
| API cost | Low for ongoing operation. High for initial state capture. |
| Completeness | Only as complete as the audit log. Events that are not logged cannot be reconstructed. |
| Correctness | Depends on perfect event processing. Bugs in replay logic produce wrong state. |
| Failure mode | Audit log gaps create state divergence that silently compounds over time. |
| v1 fit | Too risky as the sole source of truth. Useful as a supplement. |

### Option C: Hybrid Snapshot + Event Model (Recommended)

**How it works:** Periodic snapshots provide the authoritative state anchor. Event-sourced incremental updates provide near-real-time state between snapshots. Conflicts between snapshot and event-derived state are resolved in favor of the snapshot (ground truth).

| Dimension | Assessment |
|-----------|-----------|
| Freshness | Good. Snapshots provide periodic ground truth; events provide inter-snapshot freshness. |
| API cost | Moderate. Full snapshots on schedule; incremental reads for event enrichment. |
| Completeness | Best available. Snapshot covers directly observable state; events cover change history. |
| Correctness | Snapshot is the correctness anchor. Events improve freshness but do not override snapshots. |
| Failure mode | If snapshots contain harmful state, the system detects it through operator review, not automatically. |
| v1 fit | Recommended. Best balance of reliability, freshness, and operational cost. |

### Option D: Operator-Declared Intended State

**How it works:** The operator manually declares what the intended state should be for critical objects (e.g., "this group should have exactly these 4 members"). The system validates current state against the declared intention, not against observed history.

| Dimension | Assessment |
|-----------|-----------|
| Correctness | Highest, if the operator declaration is accurate. |
| Operational burden | Very high. Requires manual declaration for every tracked object. |
| Scalability | Does not scale to thousands of objects without policy-based declaration. |
| Failure mode | Operator declares wrong state. System then validates against wrong target. |
| v1 fit | Useful as an optional overlay for high-value objects, not as the primary model. |

### Comparison Summary

| Option | Freshness | Correctness | Operational burden | API cost | v1 recommendation |
|--------|-----------|-------------|-------------------|----------|-------------------|
| A. Snapshot only | Poor | Good | Low | High | Partial use |
| B. Event-sourced only | Good | Risky | Low | Low | Supplement only |
| C. Hybrid (snapshot + event) | Good | Best available | Medium | Moderate | **Primary model** |
| D. Operator-declared | N/A | Highest if correct | Very high | None | Optional overlay |

---

## 7. Recommended Baseline Model

### What to build for v1

A **versioned, operator-approved hybrid baseline** with these properties:

1. **Periodic snapshots are the authoritative state anchor.** The system captures a full snapshot of tracked objects daily (configurable). Each snapshot becomes a candidate baseline version.

2. **Event-sourced updates fill the gap between snapshots.** Audit log events are applied as incremental updates to the latest snapshot, producing a near-real-time projected state. This projected state is used for blast-radius analysis and incident detection but is never authoritative for recovery validation without operator review.

3. **Operator approval gates baseline authority.** A snapshot does not become an approved baseline until an operator reviews and approves it. Unapproved snapshots are available for comparison but are never used as recovery targets.

4. **Recovery always targets an approved baseline version.** The recovery planner selects the most recent approved baseline as the recovery target. If the most recent approved baseline is stale (e.g., older than the operator's configured threshold), the system warns the operator and recommends baseline refresh before recovery.

5. **Baseline versions are immutable and retained.** Once created, a baseline version is never modified. The system retains a configurable number of versions (default: 30 days of daily snapshots). Operators can pin specific versions to prevent expiry.

### What each layer provides

```
┌─────────────────────────────────────────────────┐
│  Operator-Declared Intended State (optional)    │  ← Highest correctness, lowest coverage
│  "This group must have exactly these members"   │
├─────────────────────────────────────────────────┤
│  Approved Baseline (snapshot + operator review) │  ← Authoritative for recovery
│  Version 47, approved 2026-04-10                │
├─────────────────────────────────────────────────┤
│  Projected State (snapshot + event updates)     │  ← Best-effort current, not authoritative
│  Baseline v47 + 847 incremental changes         │
├─────────────────────────────────────────────────┤
│  Current Observed State (live Graph API read)   │  ← Ground truth at read time
│  Read at 2026-04-11T14:23:17Z                   │
└─────────────────────────────────────────────────┘
```

---

## 8. Baseline Lifecycle

### 8.1 Initial Baseline Creation

When a customer first connects KavachIQ:

1. System performs a full snapshot of all tracked objects via Graph API.
2. Snapshot is stored as baseline version 1, status: **pending review**.
3. Operator is notified that the initial baseline is ready for review.
4. Operator reviews the baseline in the UI: group memberships, CA policies, app role assignments, key permissions.
5. Operator either **approves** (baseline becomes authoritative) or **flags concerns** (specific objects marked as "review needed" and excluded from automatic recovery targeting).
6. Approved objects in the baseline become valid recovery targets. Flagged objects require manual recovery decisions until the operator resolves them.

**Critical design decision:** The system does not assume the initial state is correct. This is the fundamental difference between KavachIQ's baseline and a simple backup snapshot.

### 8.2 Scheduled Baseline Refresh

```
Day 0: Initial snapshot → v1 (pending) → operator approves → v1 (approved)
Day 1: Scheduled snapshot → v2 (pending) → auto-approved if diff < threshold
Day 2: Scheduled snapshot → v3 (pending) → auto-approved if diff < threshold
Day 5: Scheduled snapshot → v6 (pending) → diff exceeds threshold → requires review
```

**Auto-approval rule:** If the difference between the new snapshot and the prior approved baseline is below a configurable threshold (e.g., fewer than N objects changed, no high-sensitivity objects changed), the new version is auto-approved. This prevents operator fatigue from daily rubber-stamping.

**Forced review triggers:**
- High-sensitivity objects changed (privileged groups, CA policies, service principals in scope)
- More than N total objects changed since last approval
- More than T days since last manual approval
- Operator-configured forced review cadence

### 8.3 Baseline Versioning

Each baseline version is stored with:
- Version ID (monotonically increasing per tenant)
- Capture timestamp
- Approval status: pending, approved, flagged, superseded
- Approved by (operator identity)
- Approved at (timestamp)
- Object count
- Change summary vs prior version (added, removed, modified object counts)
- Pinned flag (prevents automatic expiry)

### 8.4 Baseline Invalidation

An approved baseline can be invalidated if:
- An operator discovers it was approved in error
- A security investigation reveals the baseline was captured during an active compromise
- The system detects that the baseline conflicts with a newly declared intended state

Invalidation does not delete the version. It marks it as **invalidated** and the system falls back to the prior approved version for recovery targeting.

### 8.5 Legitimate Change Absorption

Legitimate changes (operator-initiated, approved provisioning, lifecycle events) become part of the baseline through the normal refresh cycle:

1. Legitimate change occurs.
2. Next scheduled snapshot captures the change.
3. Snapshot passes auto-approval threshold (or operator approves).
4. New baseline version includes the legitimate change.

The system does not attempt to classify whether a change is "legitimate" in real-time. It captures all changes. The approval process at baseline refresh time is where legitimacy is implicitly confirmed.

---

## 9. Data Model

### 9.1 Core Entities

```
TenantBaseline
  ├── tenantId: string
  ├── versionId: number
  ├── capturedAt: timestamp
  ├── approvalStatus: "pending" | "approved" | "flagged" | "invalidated" | "superseded"
  ├── approvedBy: string | null
  ├── approvedAt: timestamp | null
  ├── pinnedUntil: timestamp | null
  ├── changeSummary: { added: number, removed: number, modified: number }
  └── objectSnapshots: ObjectSnapshot[]

ObjectSnapshot
  ├── objectId: string
  ├── objectType: "group" | "user" | "application" | "servicePrincipal" | "conditionalAccessPolicy" | "roleAssignment" | "sharepointSite"
  ├── displayName: string
  ├── stateHash: string          // deterministic hash of the state for fast comparison
  ├── state: object              // full serialized state (members, assignments, config)
  ├── captureSource: "graph-api" | "audit-log" | "operator-declared"
  ├── capturedAt: timestamp
  ├── confidence: "high" | "medium" | "low"
  └── reviewFlag: string | null  // operator note if flagged for review

DriftRecord
  ├── tenantId: string
  ├── detectedAt: timestamp
  ├── objectId: string
  ├── objectType: string
  ├── baselineVersionId: number
  ├── baselineState: object
  ├── observedState: object
  ├── driftType: "added" | "removed" | "modified"
  ├── severity: "low" | "medium" | "high"
  ├── resolution: "pending" | "acknowledged" | "absorbed" | "incident-created"
  └── resolvedBy: string | null

ValidationResult
  ├── incidentId: string
  ├── recoveryStepId: number
  ├── objectId: string
  ├── targetState: object        // from recovery target (baseline version)
  ├── observedState: object      // from live read after recovery
  ├── match: boolean
  ├── confidence: "high" | "medium" | "low"
  ├── validatedAt: timestamp
  ├── revalidateAfter: timestamp | null  // for eventual-consistency recheck
  └── notes: string | null
```

### 9.2 State Hash

Each object snapshot includes a deterministic hash of its state. This enables fast comparison without deep object inspection. The hash is computed from a normalized, sorted representation of the state fields. Changes to non-material fields (lastModifiedDateTime, metadata) should not change the hash.

---

## 10. State Comparison Model

### When to compare against which state

| Scenario | Compare Against | Rationale |
|----------|----------------|-----------|
| Blast-radius analysis | Projected state (snapshot + events) | Need the freshest available view of what was true before the incident |
| Recovery plan: rollback target | Pre-incident projected state | Rollback means "undo this specific change" |
| Recovery plan: restoration target | Approved baseline | Restoration means "return to the known-good approved state" |
| Recovery validation | Approved baseline | Validation confirms the environment matches the intended state, not just the pre-incident state |
| Drift detection | Approved baseline | Drift is deviation from the last confirmed-good state |
| Initial incident triage | Current observed vs pre-incident projected | Operator needs to see what changed and what it looks like now |

### The pre-incident vs baseline distinction

This is one of the most important design decisions.

**Pre-incident state** is useful for understanding what the incident changed. But if the pre-incident state was already drifted or compromised, recovering to it restores a bad state.

**Approved baseline** is the operator-confirmed target. Even if the pre-incident state differs from the baseline (because of legitimate drift since the last approval), the approved baseline represents what the operator agreed was correct.

**Resolution:** The system displays both. The recovery planner defaults to the approved baseline as the recovery target but shows the pre-incident state for context. If they differ, the system highlights the discrepancy and asks the operator to confirm which target is correct.

```
Incident occurs at T3:

T0: Baseline v47 approved (group has 4 members: A, B, C, D)
T1: Legitimate change: member E added by operator
T2: Pre-incident state (group has 5 members: A, B, C, D, E)
T3: Agent adds 12 members (group now has 17 members)

Recovery options presented to operator:
  Option 1: Restore to baseline v47 (4 members: A, B, C, D)
  Option 2: Restore to pre-incident state (5 members: A, B, C, D, E)
  
System notes: "Pre-incident state differs from approved baseline.
Member E was added after baseline approval. Confirm recovery target."
```

### Handling pre-incident state that was already wrong

If the pre-incident state contains a prior undetected harmful change, the system cannot automatically detect this. It will show the pre-incident state and the approved baseline. If they differ in ways the operator recognizes as suspicious, the operator selects the approved baseline. This is why baseline approval is not optional.

---

## 11. Derived and Inherited State

### The challenge

Many of the states KavachIQ needs to validate are not directly stored as discrete objects. They are derived at access time from combinations of other objects.

| Derived State | Source Objects | Observability |
|--------------|---------------|--------------|
| SharePoint site access for a user | Group membership + site permission model | Can be read via `/sites/{id}/permissions` but does not show inherited-through-group detail |
| Teams membership | Entra group membership (for group-linked teams) | Readable via Teams API; may be delayed vs group change |
| CA policy effective scope | Policy assignment + group membership + user attributes | Policy is readable; effective scope requires computing the intersection |
| App entitlements | Group membership + app role assignment | App role assignments are readable; provisioned state in the app may lag |
| Exchange delegation | Direct delegation + group-inherited delegation | Partially readable via Graph; some delegation types require EWS |

### Design approach

The system should:

1. **Store the source objects directly** (group membership, CA policy assignments, app role assignments). These are the primary baseline.

2. **Compute derived state at validation time** rather than storing it in the baseline. Derived state is a function of source state; storing it independently creates synchronization problems.

3. **Tag validation results with derivation confidence.** When validating "SharePoint access revoked for 12 users," the system should note that this is inferred from group membership reversion plus SharePoint permission model assumptions, not from a direct read of each user's effective SharePoint access.

4. **Schedule delayed re-validation for eventually consistent derived state.** After a group membership rollback, schedule SharePoint access re-validation 15 minutes later to allow propagation.

---

## 12. Confidence and Uncertainty Model

### Confidence levels

| Level | Definition | Source Examples | UI Treatment |
|-------|-----------|----------------|-------------|
| **High** | Read from live API within the last 5 minutes | Direct Graph API read of group members, CA policy state | Green indicator, "Verified" |
| **Medium** | Derived from recent audit events or computed from source objects | Projected state from snapshot + events, inferred SharePoint access from group membership | Yellow indicator, "Inferred" |
| **Low** | Based on stale snapshot or missing telemetry | State from a baseline snapshot > 24 hours old, no audit events for this object type | Orange indicator, "Unverified" |
| **Unknown** | No data available for this object | Object type not in v1 scope, API read failed | Gray indicator, "Unknown" |

### How confidence affects product behavior

| System Action | High Confidence | Medium Confidence | Low Confidence | Unknown |
|--------------|----------------|-------------------|----------------|---------|
| Blast-radius output | Show as confirmed impact | Show as likely impact | Show as possible impact | Show as "unable to assess" |
| Recovery recommendation | Recommend with full rationale | Recommend with caveat | Recommend manual verification | Do not recommend; escalate to operator |
| Validation result | Mark as "Verified" | Mark as "Likely restored" | Mark as "Unverified; manual check recommended" | Mark as "Unable to validate" |
| Trusted-state declaration | Can contribute to "trusted state restored" | Can contribute with operator acknowledgment | Cannot contribute; blocks trusted-state declaration | Blocks trusted-state declaration |

**Key principle:** The system should never declare "trusted operational state restored" if any critical object has low confidence or unknown validation state. Partial validation should be represented honestly.

---

## 13. Drift Detection

### Types of drift

| Drift Type | Description | Detection Method | Default Severity |
|------------|------------|-----------------|-----------------|
| **Baseline drift** | Current state differs from approved baseline for a tracked object | Periodic comparison (every 4-6 hours) | Depends on object sensitivity |
| **Post-recovery drift** | State diverged again after recovery was validated | Scheduled re-validation 1 hour and 24 hours after recovery | High |
| **Legitimate operational drift** | Authorized changes made since last baseline approval | Audit log correlation with known operator actions | Low (informational) |
| **Suspicious drift** | Unexplained changes to high-sensitivity objects | Comparison with no matching audit event or matching agent-initiated event | High |
| **Propagation drift** | Eventual consistency gap between source change and derived state | Delayed re-read after expected propagation window | Transient (resolves naturally) |

### When drift becomes actionable

- **Informational only:** Drift severity is low, object is not high-sensitivity, and the change correlates with a known operator action. Logged but not alerted.
- **Alert:** Drift severity is medium or the object is high-sensitivity. Operator is notified and can acknowledge, absorb into next baseline, or investigate.
- **Incident candidate:** Drift severity is high, no matching operator action, and the change pattern matches agent-initiated activity. System suggests creating an incident.
- **Baseline invalidation trigger:** Drift suggests the approved baseline itself may have been captured during a compromised period. Operator is asked to review and potentially invalidate the baseline.

---

## 14. Use in Recovery Planning

### How the planner selects a recovery target

1. **Identify affected objects** from the blast-radius analysis.
2. **For each affected object, retrieve the approved baseline state** from the most recent approved baseline version.
3. **Retrieve the pre-incident projected state** from the event-augmented snapshot.
4. **Compare baseline state vs pre-incident state.** If they match, the recovery target is clear. If they differ, flag the discrepancy for operator review.
5. **Classify the recovery action:**
   - **Rollback:** Pre-incident state matches baseline. Revert the specific change.
   - **Restoration:** Pre-incident state differs from baseline (legitimate drift occurred before incident). Restore to baseline, not pre-incident.
   - **Compensating action:** Derived state cannot be directly rolled back or restored. Execute an explicit countermeasure (e.g., revoke inherited SharePoint access even though the source group is already reverted).
   - **Validation:** State should self-correct after upstream recovery. Verify rather than act.

### When the planner should refuse or escalate

The planner should **not recommend execution** and instead escalate to the operator when:
- The approved baseline is older than the configured staleness threshold (default: 7 days without refresh)
- The baseline confidence for the affected object is low or unknown
- Pre-incident state and baseline state conflict and no operator resolution is recorded
- The object type is not covered by the baseline (v1 scope limitation)
- The recovery action is classified as high-risk and no approved baseline exists for the target

---

## 15. Validation Model

### Post-recovery validation sequence

```
Recovery step executed
        │
        ▼
┌─────────────────┐
│ Immediate check │ Read live state via Graph API
│ (T + 0-30 sec)  │ Compare against recovery target
└────────┬────────┘
         │
    ┌────┴────┐
    │ Match?  │
    ├── Yes ──▶ Mark "Verified (high confidence)"
    │
    ├── No, but eventual consistency expected ──▶ Schedule delayed re-check
    │
    └── No, unexpected ──▶ Mark "Mismatch" → escalate to operator
         │
         ▼
┌─────────────────────┐
│ Delayed re-check    │ Re-read state after propagation window
│ (T + 15 min)        │ Compare again
└────────┬────────────┘
         │
    ┌────┴────┐
    │ Match?  │
    ├── Yes ──▶ Mark "Verified (medium confidence, delayed)"
    │
    └── No ──▶ Mark "Persistent mismatch" → require operator decision
```

### Conditions for "Trusted operational state restored"

All of the following must be true:
1. Every recovery step has status "completed" or "verified"
2. Every critical object has a validation result of "verified" with high or medium confidence
3. No unresolved mismatches remain
4. No unresolved low-confidence validations remain for critical objects
5. Operator has approved the final validation (for incidents requiring operator sign-off)

If any condition is not met, the system shows a partial validation summary and indicates what blocks the trusted-state declaration.

---

## 16. Security and Compliance Considerations

### Baseline immutability

Once a baseline version is created, its content must not be modifiable. The approval status can be changed (pending → approved, approved → invalidated), but the object snapshots within the version must be immutable. This ensures the baseline is a reliable forensic reference.

### Tamper resistance

Baseline versions should include an integrity hash computed over all contained object snapshots. Any modification to the stored data would invalidate the hash. The system should verify integrity on read.

### Access control

| Action | Required Role |
|--------|--------------|
| View baseline versions | Operator, Admin |
| Approve baseline | Admin (or Operator with approval delegation) |
| Invalidate baseline | Admin only |
| Pin baseline version | Admin only |
| Configure auto-approval thresholds | Admin only |
| Declare intended state for an object | Admin only |

### Tenant isolation

Baseline data is per-tenant. Cross-tenant access must be architecturally impossible, not just policy-controlled. Per-tenant encryption keys for baseline storage are recommended.

### Retention

Default retention: 90 days of baseline versions. Configurable per customer. Regulatory environments may require longer retention. Expired versions are soft-deleted (metadata retained, snapshots purged) to preserve audit trail continuity.

---

## 17. Operational Constraints

### Graph API cost of snapshots

Full tenant snapshot for a mid-size enterprise:

| Object Type | Estimated Object Count | API Calls per Snapshot | Notes |
|-------------|----------------------|----------------------|-------|
| Groups + members | 5,000 groups, avg 20 members | ~5,000 (list groups) + ~5,000 (list members per group) = ~10,000 | Batching via $expand can reduce this |
| Applications + service principals | 500 apps | ~1,000 | Two reads per app (registration + SP) |
| CA policies | 100 policies | ~100 | Single list call + individual reads |
| App role assignments | ~2,000 | ~2,000 | Per-service-principal enumeration |
| SharePoint site permissions | 200 sites | ~200-400 | Site + permission reads |

**Total estimated: 13,000-15,000 API calls per full snapshot.** At Microsoft Graph's default rate limit (10,000 requests per 10 minutes for application permissions), a full snapshot takes approximately 15-20 minutes. This is feasible for daily off-peak scheduling.

### Storage cost

Per-tenant baseline storage estimate: 50-200 MB per snapshot (depending on tenant size). At 30 days retention: 1.5-6 GB per tenant. Manageable with standard cloud object storage. Compression reduces this significantly since adjacent versions have high overlap.

### Staleness vs cost trade-off

| Refresh Cadence | Staleness | API Cost | Operator Burden |
|----------------|-----------|----------|----------------|
| Every 4 hours | Low | High (90K+ calls/day) | High (frequent review triggers) |
| Daily | Medium | Moderate (15K calls/day) | Low-medium |
| Weekly | High | Low (15K calls/week) | Very low |

**Recommendation:** Daily full snapshot as default. Critical objects (privileged groups, CA policies) get additional 4-hour incremental refresh using targeted Graph reads (not full snapshot). This balances freshness against API cost.

---

## 18. Risk Register

| Risk | Why It Matters | Severity | Mitigation |
|------|---------------|----------|------------|
| Baseline approved during active compromise | System validates recovery against a compromised target | Critical | Operator review at approval; anomaly flagging; multi-version retention for fallback |
| Snapshot captured after harmful change but before detection | Latest snapshot contains the bad state | High | Recovery planner uses pre-incident projected state for rollback, approved baseline for restoration; system warns if they diverge |
| Event-sourced state diverges from snapshot ground truth | Blast-radius analysis based on wrong projected state | Medium | Snapshot is authoritative; events are supplemental; periodic reconciliation |
| Derived state validation gives false positive | System declares "verified" but inherited access persists due to caching | High | Delayed re-validation after propagation window; confidence tagging; operator warning for derived state |
| Graph API rate limits prevent timely snapshot | Baseline refresh fails or is incomplete | Medium | Adaptive throttling; partial snapshot with missing-data flags; retry scheduling |
| Operator approval fatigue leads to rubber-stamping | Baselines approved without review; bad state enters approved baseline | Medium | Auto-approval for low-change snapshots; forced review for high-sensitivity changes; approval audit trail |
| Tenant with no approved baseline experiences incident | No recovery target available | High | System refuses to recommend recovery without approved baseline; guides operator through emergency baseline creation |
| State hash collision produces false match | Validation reports match when state actually differs | Low | Use SHA-256 or better; include object version in hash input; periodic full-state comparison audit |

---

## 19. Open Questions

1. **What is the right auto-approval threshold?** How many changed objects, and which object types, should trigger forced operator review? This is a product decision with security implications.

2. **Should the system support per-object intended-state declarations in v1?** Operator-declared intended state is the highest-correctness model but adds significant operational burden. Is it worth building for v1, or should it wait?

3. **How should dynamic group membership be handled?** Dynamic groups change based on user attributes. The system cannot take a meaningful "membership snapshot" because membership is computed at query time. Should dynamic groups be excluded from baseline tracking, or should the system snapshot their effective membership?

4. **What is the right propagation delay for derived-state re-validation?** SharePoint permission inheritance propagation time varies. Is 15 minutes sufficient? Should it be configurable per workload?

5. **How should the system handle the first incident before any baseline is approved?** If an incident occurs during the onboarding window before the operator has approved the initial baseline, can the system provide any recovery guidance, or must it refuse?

6. **Should baseline versions support granular approval?** Can an operator approve some objects in a version but flag others? Or must the entire version be approved or rejected as a unit?

7. **How should the system handle multi-admin environments?** If multiple operators have approval authority, how are conflicts resolved? Last-write-wins, or consensus required?

---

## 20. Recommendation Summary

### Build for v1

- **Hybrid baseline model:** Daily full snapshots + audit-log incremental updates.
- **Operator-approved versioning:** All baselines require approval before becoming recovery targets. Auto-approval for low-change refreshes with forced review triggers for high-sensitivity changes.
- **Pre-incident vs baseline comparison:** Show both to operator. Default recovery target is approved baseline. Flag discrepancies.
- **Confidence scoring:** Every state observation and validation carries high/medium/low/unknown confidence.
- **Delayed re-validation:** Schedule re-checks for derived state after propagation windows. Do not declare trusted state prematurely.
- **Drift detection:** Periodic comparison against approved baseline. Severity-based alerting.

### Defer to v2+

- Per-object operator-declared intended state (optional overlay)
- Real-time streaming baseline updates (replace polling with webhooks when Graph supports it)
- Automated baseline anomaly detection (flag suspicious patterns in baseline content)
- Cross-tenant baseline comparison (detect outlier configurations across customer base)
- Dynamic group effective-membership tracking

### Assumptions that must hold

1. Microsoft Graph API continues to support the read operations needed for snapshots at current rate limits.
2. Entra audit logs capture the change types material to blast-radius analysis (group membership, CA policy, app role assignment changes).
3. Operators are willing to perform baseline review during onboarding and periodically thereafter.
4. Daily snapshot freshness is acceptable for recovery validation (with inter-snapshot event augmentation).

### Prototype/validate next

1. **Baseline capture performance.** Run a full snapshot against a real mid-size Entra tenant. Measure API call count, elapsed time, rate-limit headroom, and storage size. Validate the 15-20 minute estimate.
2. **State hash stability.** Confirm that the proposed hashing approach produces stable hashes for unchanged objects across repeated reads (Graph API responses may include volatile metadata fields).
3. **Propagation delay measurement.** After an Entra group membership change, measure how long it takes for SharePoint permission reads, Teams membership reads, and CA policy effective-scope computations to reflect the change.
