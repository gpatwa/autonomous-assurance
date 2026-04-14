# Recovery Orchestration Design

**Author:** Principal Architect  
**Date:** April 2026  
**Status:** Draft for internal review  
**Prerequisites:** Architecture Memo, Trusted-State Baseline Design, Blast-Radius Engine Design  
**Classification:** Internal / Confidential

---

## 1. Executive Summary

The recovery orchestration layer transforms a blast-radius map and a trusted-state model into an ordered, approval-gated, executable recovery plan. It is the layer where KavachIQ's product promise becomes operationally real.

**The problem:** Recovery is not "undo the last change." Different impacted objects require different action types (rollback, restoration, compensating action, validation), executed in a specific order (identity before data before downstream), with varying levels of operator approval, and validated against varying levels of confidence. A recovery step can itself create side effects. The orchestrator must be safe before it is fast.

**Recommended model:** A recommendation-first orchestrator that generates a fully ordered, dependency-aware recovery plan from blast-radius output and baseline data. In v1, the system generates plans, classifies actions, enforces ordering, and tracks state. Operators approve and (for most actions) execute manually using the system's guidance. System-assisted execution is limited to group membership rollback (lowest-risk write) behind approval gates. Pre-execution validation is mandatory for every step. Post-execution validation includes delayed re-checks for eventually consistent systems. The system never declares "trusted operational state restored" until all critical objects are verified.

**Key trade-offs:**
- Recommendation-first is slower to demonstrate value but eliminates the risk of the product causing harm
- Mandatory pre-execution validation adds latency to every step but prevents execution against stale assumptions
- Per-step approval is more work for operators but builds trust faster than batch approval

**Biggest risks:** Wrong action type selected (e.g., rollback when compensating action was needed), stale plan executed after state changed, execution causes more damage than the incident, validation claims success before propagation completes.

---

## 2. Problem Statement

### Why recovery orchestration is hard

**Not every object should be recovered the same way.** Reverting a group membership change is a rollback. Revoking SharePoint permissions that persisted through token caching is a compensating action. Confirming that a Conditional Access policy scope contracted after group reversion is a validation. The orchestrator must classify correctly.

**"Undo the last change" is often insufficient.** If an agent added 12 users to a group, and between detection and recovery an operator independently removed 2 of those users, reverting "the agent's change" and restoring "baseline state" produce different outcomes. The orchestrator must decide which target is correct and present the choice to the operator when they conflict.

**Current state may have changed since the incident.** Between blast-radius computation and recovery execution, other agents, operators, or lifecycle processes may have made additional changes. The plan generated at T+0 may be stale at T+5 minutes. Every step must revalidate assumptions before executing.

**Some actions are safety-critical.** Modifying a Conditional Access policy programmatically can lock out administrators. Revoking an app role assignment can break a production workflow. The orchestrator must treat high-risk writes with appropriate caution, not just queue them for execution.

**Recovery steps create their own side effects.** Reverting a group membership triggers downstream propagation: SharePoint permission re-evaluation, Teams membership sync, provisioning connector actions. The recovery step itself generates change events that the system must distinguish from new incidents.

**Propagation is delayed.** A successful group rollback does not instantly revoke downstream access. The orchestrator must wait for propagation before validating, and it must distinguish "not yet propagated" from "actually failed."

**Some systems are directly writable, others are not.** Entra group membership is writable via Graph API. Downstream LOB app entitlements may not be. The orchestrator must handle a spectrum from "fully executable" to "operator must verify externally."

---

## 3. Design Goals

1. **Convert blast-radius output into a recovery plan.** Map impacted objects to recovery actions with correct types and ordering.
2. **Classify actions correctly.** Each step is rollback, restoration, compensating action, or validation. The classification must be defensible and explainable.
3. **Enforce identity-first sequencing.** Entra objects are recovered before M365 data surfaces, which are recovered before downstream systems.
4. **Respect dependency chains.** No step executes before its prerequisites are satisfied.
5. **Support operator review and approval.** The plan is presented for review. High-risk steps require explicit approval.
6. **Support recommendation-first operation in v1.** The system generates plans and tracks execution state. Operators perform most actions manually in v1.
7. **Revalidate before execution.** Before any step executes (or is executed manually), the system confirms that current state still matches plan assumptions.
8. **Validate after execution.** Each step is followed by a validation check, with delayed re-checks for eventually consistent systems.
9. **Track failure and partial completion.** The system handles step failures, stale plans, operator rejections, and partial completion gracefully.
10. **Remain auditable and explainable.** Every plan, approval, execution, and validation is logged immutably. Operators can understand why every step exists.

---

## 4. Non-Goals and Boundaries

- **Not fully autonomous remediation in v1.** The system recommends and sequences. It does not execute most actions without operator involvement.
- **Not arbitrary workflow automation.** The orchestrator handles recovery from identified incidents, not general-purpose Microsoft administration.
- **Not universal write support.** v1 does not write to Exchange (EWS/PowerShell complexity), downstream LOB apps (opaque), or dynamic group configurations.
- **Not silent remediation.** The system never executes recovery actions without operator visibility. Even auto-approved steps are logged and visible.
- **Not guaranteed idempotent execution for all action types.** Some Microsoft Graph operations are not naturally idempotent. The orchestrator must handle this per action type, not assume universal idempotency.

---

## 5. Core Concepts and Action Primitives

| Concept | Definition |
|---------|-----------|
| **Recovery plan** | An ordered set of recovery steps generated for a specific incident |
| **Plan version** | Plans are versioned. If state changes require replanning, a new version is created. |
| **Recovery step** | A single action in the plan: one object, one action type, one target state |
| **Recovery target** | The desired state for a specific object after recovery (from baseline or pre-incident state) |
| **Dependency** | A constraint between steps: step B cannot begin until step A completes successfully |
| **Approval gate** | A checkpoint requiring explicit operator approval before the step can proceed |
| **Execution policy** | Rules determining which steps can be system-executed vs recommendation-only |
| **Rollback** | Revert a specific change to its pre-change state |
| **Restoration** | Restore an object to a known-good state (from approved baseline), regardless of what changed |
| **Compensating action** | An explicit countermeasure for a side effect that does not self-correct (e.g., revoking cached access) |
| **Validation** | A check confirming that an expected state holds, without making any write |
| **Blocked step** | A step that cannot proceed because a prerequisite has not completed |
| **Failed step** | A step whose execution or validation did not succeed |
| **Deferred step** | A step intentionally postponed (e.g., waiting for propagation) |
| **Manual step** | A step the system cannot execute; operator must perform externally |
| **Execution outcome** | The result of attempting a step: succeeded, failed, partial, skipped, deferred |
| **Trusted-state outcome** | The final assessment: all checks pass (restored), partial (residual risk), failed (unresolved) |

---

## 6. Action-Type Model

### 6.1 Rollback

| Property | Value |
|----------|-------|
| **Definition** | Revert a specific change to the state that existed immediately before the change |
| **Target state** | Pre-incident state (from event-sourced projected state) |
| **When to use** | The change is directly reversible and the pre-incident state is known and correct |
| **Writes to source system** | Yes |
| **Reversible** | Yes (the rollback can itself be rolled back) |
| **Requires approval** | By default yes for high-sensitivity objects; configurable |
| **Microsoft examples** | Remove 12 users from a group, remove an app role assignment, revert a CA policy modification |

### 6.2 Restoration

| Property | Value |
|----------|-------|
| **Definition** | Restore an object to the approved baseline state, regardless of what specific change occurred |
| **Target state** | Approved baseline version (from baseline store) |
| **When to use** | Pre-incident state differs from baseline (drift occurred before incident), or rollback is insufficient because multiple changes need correction |
| **Writes to source system** | Yes |
| **Reversible** | Yes (current state is captured before restoration) |
| **Requires approval** | Always yes (restoration may override legitimate changes made since baseline) |
| **Microsoft examples** | Set group membership to exactly the baseline member list, restore Exchange mailbox delegation to baseline configuration |

### 6.3 Compensating Action

| Property | Value |
|----------|-------|
| **Definition** | An explicit countermeasure for a side effect that does not self-correct when the source is rolled back |
| **Target state** | Derived from the expected post-rollback state (what should be true after the upstream change is reverted) |
| **When to use** | Inherited or cached access persists after the source change is reverted (e.g., SharePoint token cache, Teams sync delay, provisioning connector state) |
| **Writes to source system** | Yes (often to a different system than the original change) |
| **Reversible** | Sometimes; depends on action specifics |
| **Requires approval** | Depends on sensitivity; compensating actions on data surfaces may be auto-approved after identity rollback |
| **Microsoft examples** | Explicitly revoke SharePoint site permissions for removed group members, force Teams membership sync, trigger downstream app entitlement recalculation |

### 6.4 Validation

| Property | Value |
|----------|-------|
| **Definition** | A read-only check confirming that an expected state holds after upstream recovery |
| **Target state** | Expected state derived from baseline or from the predicted effect of upstream actions |
| **When to use** | For behavioral downstream objects (CA policy scope), eventually consistent systems, and opaque downstream apps |
| **Writes to source system** | No |
| **Reversible** | N/A (no write) |
| **Requires approval** | No for the check itself; failure of validation may require operator decision |
| **Microsoft examples** | Confirm CA policy scope contracted, verify Teams membership matches reverted group, confirm downstream ERP app reports no active privileged sessions for reverted users |

### 6.5 Action Type Selection Logic

```
For each impacted object in the blast-radius output:

1. Is the object the direct target of the incident change?
   → Rollback (if pre-incident state is known and correct)
   → Restoration (if pre-incident state differs from baseline)

2. Is the object structurally downstream with a persistent stored relationship?
   → Compensating action (if the downstream state does not self-correct)
   → Validation (if the downstream state should self-correct after upstream recovery)

3. Is the object behaviorally downstream (scope/policy effect)?
   → Validation (confirm scope reverted after upstream recovery)

4. Is the object adjacent/opaque (downstream app)?
   → Manual step (operator verifies externally)
```

---

## 7. Recovery Target Selection

### When to use pre-incident state vs approved baseline

| Condition | Recovery Target | Rationale |
|-----------|----------------|-----------|
| Pre-incident state matches approved baseline | Either (they are the same) | No ambiguity |
| Pre-incident state differs from baseline; diff is legitimate drift | **Operator chooses** | System cannot determine which is correct without operator input |
| Pre-incident state differs from baseline; diff is suspicious | **Approved baseline** (with operator confirmation) | Suspicious drift should not be preserved |
| No approved baseline exists for this object | **Pre-incident state** (with warning) | Best available target; system flags the risk |
| Baseline confidence is low or stale | **Pre-incident state** (with warning) | Stale baseline is not a reliable target |
| Object is not in baseline scope | **Manual step** | System cannot determine target |

### When the orchestrator refuses to auto-select

The orchestrator should **not select a recovery target automatically** and instead present the choice to the operator when:
- Pre-incident state and baseline state conflict
- Baseline confidence for the object is low
- The object is high-sensitivity (privileged group, CA policy, directory role)
- Multiple incident changes affected the same object (conflicting recovery targets)

---

## 8. Plan Generation Model

### Pipeline

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Blast-Radius    │────▶│  Target         │────▶│  Action         │
│  Result          │     │  Selection      │     │  Classification │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                          │
┌─────────────────┐     ┌─────────────────┐              │
│  Dependency      │◀────│  Sequencing     │◀─────────────┘
│  Resolution      │     │  Engine         │
└────────┬────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│  Approval Gate   │────▶│  Final Plan     │
│  Assignment      │     │  Output         │
└─────────────────┘     └─────────────────┘
```

### Step-by-step generation

**Step 1: Extract impacted objects.** From the `BlastRadiusResult`, collect all `ImpactedObject` entries that have a `recoveryImplication` of rollback-target, compensating-target, restoration-target, or validation-target.

**Step 2: Select recovery target for each object.** For each object, retrieve the approved baseline state and the pre-incident projected state. Apply the target selection logic from section 7.

**Step 3: Classify the action type.** Based on the object's impact classification (direct, structural, behavioral, transitive, adjacent) and the relationship between current state, pre-incident state, and target state, assign rollback, restoration, compensating action, validation, or manual.

**Step 4: Extract dependency chains.** From the blast-radius dependency paths, determine which steps must precede which. Identity object steps precede data surface steps. Data surface steps precede downstream app steps. Within a tier, parallel execution is allowed unless a specific dependency chain exists.

**Step 5: Assign approval gates.** Based on object sensitivity, action type, and execution policy, mark which steps require operator approval.

**Step 6: Add validation steps.** For each executable step, add a post-execution validation step. For eventually consistent downstream objects, add a deferred validation step with a propagation delay.

**Step 7: Output the plan.** The plan is a versioned, ordered list of steps with dependencies, targets, classifications, approval requirements, and validation expectations.

---

## 9. Sequencing and Dependency Model

### 9.1 Tier-Based Ordering

Recovery steps are organized into ordered tiers. All steps in a tier may execute in parallel. A tier cannot begin until all steps in the previous tier have completed (or been approved for manual execution).

```
Tier 0: IDENTITY ROLLBACK
  ├── Revert Entra group membership
  ├── Revert app role assignment (if direct change)
  └── Revert directory role assignment (if applicable)
      Must complete before Tier 1

Tier 1: IDENTITY VALIDATION
  ├── Validate CA policy scope contracted
  ├── Validate role assignment state
  └── Validate nested group propagation
      Must complete before Tier 2

Tier 2: DATA SURFACE COMPENSATING ACTIONS
  ├── Revoke inherited SharePoint permissions
  ├── Restore Exchange mailbox delegation
  └── Confirm Teams membership sync
      Must complete before Tier 3

Tier 3: DOWNSTREAM VALIDATION
  ├── Verify downstream app entitlement rollback
  └── Operator: verify external LOB app state
      Must complete before Tier 4

Tier 4: TRUSTED-STATE DECLARATION
  └── All checks pass → mark "trusted operational state restored"
```

### 9.2 Intra-Tier Parallelism

Within a tier, steps that do not share a dependency chain can execute concurrently. For example, SharePoint permission revocation and Exchange delegation restoration can happen in parallel (both depend on identity rollback but not on each other).

### 9.3 Propagation Delays

Some validations must be deferred until propagation completes:

| Downstream System | Expected Propagation Delay | Validation Timing |
|-------------------|--------------------------|-------------------|
| Entra group membership (direct) | Immediate | Validate immediately after rollback |
| CA policy effective scope | 0-5 minutes | Validate at T+5 minutes |
| SharePoint permission inheritance | 0-15 minutes | Validate at T+15 minutes |
| Teams membership sync | 0-5 minutes | Validate at T+5 minutes |
| App provisioning connector | 0-60 minutes | Validate at T+60 minutes (or operator manual check) |

### 9.4 Blocked Steps

A step enters **blocked** state when:
- A prerequisite step has not completed
- A prerequisite step failed and has not been resolved
- The operator has not yet approved a required gate

Blocked steps remain visible in the plan with a clear indication of what they are waiting for.

---

## 10. Approval Model

### 10.1 Default Approval Policy

| Action Type | Object Sensitivity | Approval Required |
|-------------|-------------------|-------------------|
| Rollback | High (privileged group, CA policy, directory role) | Yes, explicit operator approval |
| Rollback | Medium/Low | Configurable; default yes in v1 |
| Restoration | Any | Always yes (restoration may override legitimate changes) |
| Compensating action | High | Yes |
| Compensating action | Medium/Low | Configurable; default auto-approved after identity tier completes in v1 |
| Validation | Any | No (read-only) |
| Manual step | Any | N/A (operator performs externally; confirms completion in UI) |

### 10.2 Batch vs Per-Step Approval

v1 supports two approval modes:

**Per-step approval:** Each step requiring approval is individually reviewed and approved. Most control, most friction.

**Tier-based approval:** Operator reviews and approves all steps in a tier at once. Less friction, appropriate when all steps in a tier have the same risk profile.

**Recommendation for v1:** Default to tier-based approval. Automatically escalate to per-step approval if any step in a tier has a different sensitivity level from the others.

### 10.3 Approval Staleness

An approval expires if the underlying state changes after approval but before execution:

- If any object in the approved step has been modified since the approval timestamp (detected via audit event or live read), the approval is invalidated. The system requires re-approval after presenting the new state.
- Approvals expire after a configurable time window (default: 30 minutes). If not executed within the window, re-approval is required.

---

## 11. Recommendation-First vs Execution-Capable Modes

### v1: Recommendation with Selective Execution

| Capability | v1 Behavior |
|------------|------------|
| Plan generation | System generates full plan |
| Action classification | System classifies all actions |
| Sequencing | System enforces tier-based ordering |
| Approval gating | System manages approval workflow |
| Group membership rollback | **System-executable** with approval |
| SharePoint permission revocation | Recommendation-only; operator executes |
| Exchange delegation restoration | Recommendation-only; operator executes via PowerShell |
| CA policy validation | System-executable (read-only) |
| Teams membership validation | System-executable (read-only) |
| Downstream app verification | Manual; operator confirms externally |
| Trusted-state validation | System-executable (read-only) |

### Why group membership rollback is system-executable in v1

Group membership modification via `PATCH /groups/{id}/members/$ref` is:
- Well-defined (add/remove specific members)
- Easily reversible (the rollback can be rolled back)
- Low risk of cascading damage (the group membership change is the root cause; reverting it is the root fix)
- High value (it unblocks all downstream recovery)

All other write actions remain recommendation-only in v1 because their risk profiles are higher and their reversibility is less certain.

### v2+: Expanded Execution

Future versions can add system execution for:
- SharePoint permission revocation (after confidence in the compensating action logic is established)
- App role assignment removal (after per-app-role risk classification)
- CA policy scope modifications (only with dry-run validation and mandatory approval)

---

## 12. Pre-Execution Validation

Every step, whether system-executed or manually executed, must pass pre-execution validation before proceeding.

### Pre-execution checks

| Check | Purpose | Failure Behavior |
|-------|---------|-----------------|
| **State match** | Confirm the object's current state matches the plan's assumption about pre-action state | Pause step; alert operator; may trigger replan |
| **Dependency satisfied** | Confirm all prerequisite steps have completed successfully | Block step until dependencies resolve |
| **Approval current** | Confirm approval has not expired and has not been invalidated by state change | Require re-approval |
| **Permission available** | Confirm the system has the necessary Graph API permissions for the action | Fail step; alert operator with permission guidance |
| **No conflicting change** | Check whether the target object has been modified since blast-radius computation | Pause step; present new state to operator for decision |
| **Rate limit headroom** | Confirm sufficient Graph API rate-limit budget for the action | Defer step; retry after rate-limit reset |

### Design invariant

**No write action may execute if any pre-execution check fails.** This is not configurable. Pre-execution validation is a mandatory safety gate. The system may recommend the operator proceed after reviewing the failure, but it does not auto-proceed.

---

## 13. Execution Model

### 13.1 Step Lifecycle

```
                    ┌──────────┐
                    │ generated │
                    └─────┬────┘
                          │
                    ┌─────▼────┐
            ┌──────│  blocked  │◀──── dependencies not met
            │      └─────┬────┘
            │            │ dependencies satisfied
            │      ┌─────▼────┐
            │      │  pending  │
            │      │ approval  │◀──── approval required
            │      └─────┬────┘
            │            │ approved (or auto-approved)
            │      ┌─────▼────┐
            │      │  ready    │
            │      └─────┬────┘
            │            │ pre-execution validation passes
            │      ┌─────▼────┐
            │      │executing │
            │      └─────┬────┘
            │            │
            │      ┌─────┴──────┐
            │      │            │
            │ ┌────▼────┐ ┌────▼────┐
            │ │succeeded│ │ failed  │
            │ └────┬────┘ └────┬────┘
            │      │           │
            │ ┌────▼────┐     │ retry / replan / escalate
            │ │validating│    │
            │ └────┬────┘     │
            │      │           │
            │ ┌────▼────┐     │
            │ │verified │     │
            │ └─────────┘     │
            │                  │
            └──────────────────┘
                (also: skipped, deferred, operator-rejected)
```

### 13.2 Execution Semantics

**Synchronous execution:** For fast operations (group member removal, validation reads), the system executes and waits for the result.

**Asynchronous execution:** For operations that may take time (provisioning connector propagation), the system initiates the action and polls for completion.

**Retry policy:** Failed steps may be retried up to 2 times with exponential backoff. After 2 failures, the step is marked "failed" and escalated to the operator.

**Idempotency:** The system must ensure that retrying a step does not create duplicate side effects. For group membership removal: removing a member who is already not a member is a no-op. For app role assignment removal: the system checks current state before executing.

### 13.3 Circuit Breaker

If more than 3 steps in a plan fail consecutively, the system halts execution, marks the plan as "circuit-broken," and escalates to the operator. This prevents runaway failure from making the incident worse.

### 13.4 Operator Interruption

The operator can pause or cancel a plan at any time. Pausing freezes all pending and ready steps. Canceling marks remaining steps as "skipped." Both actions are logged. The system clearly reports the current state of recovery: what completed, what was skipped, what remains unresolved.

---

## 14. Validation Model

### 14.1 Per-Step Validation

After each step completes, the system reads the current state of the target object and compares it against the recovery target.

| Validation Result | Meaning | Next Action |
|-------------------|---------|-------------|
| **Match** | Current state matches recovery target | Mark step as "verified" |
| **Mismatch** | Current state does not match target | Retry step, escalate to operator, or flag for investigation |
| **Pending propagation** | Eventual consistency delay expected | Schedule deferred re-check |
| **Unknown** | Cannot read current state (API failure, missing permissions) | Escalate to operator |

### 14.2 Deferred Re-Validation

For eventually consistent downstream objects, the system schedules a re-validation at the expected propagation delay (from the blast-radius rules layer):

```
Step executed at T
  → Immediate validation at T+30s
  → If "pending propagation": schedule re-check at T + propagation_delay
  → Re-check at T + propagation_delay
  → If still mismatch: escalate to operator
```

### 14.3 Trusted-State Declaration

The system evaluates whether to declare "trusted operational state restored" based on:

| Condition | Required |
|-----------|----------|
| All Tier 0 (identity) steps verified | Yes |
| All Tier 1 (identity validation) steps verified | Yes |
| All Tier 2 (data compensating) steps verified | Yes |
| All Tier 3 (downstream validation) steps verified or operator-confirmed | Yes |
| No steps in failed or unresolved state | Yes |
| No deferred validations still pending | Yes |
| Operator final approval (for incidents requiring sign-off) | Configurable |

If any condition is not met, the system reports a **partial restoration** with a clear summary of what is verified and what remains unresolved.

---

## 15. Failure Handling and Replanning

### 15.1 Step Failure

When a step fails:
1. Log the failure with error details
2. Determine if retry is appropriate (transient error vs permanent error)
3. If retriable: retry up to 2 times with backoff
4. If not retriable or retries exhausted: mark step as failed, block dependent steps
5. Notify operator with failure context and recommended manual action

### 15.2 State Change During Execution

If a monitored object changes during plan execution (detected via audit event or pre-execution check):
1. Pause the affected step
2. Compare the new state against the plan's assumptions
3. If the change resolves the issue (e.g., an operator already fixed it): mark step as "resolved externally" and validate
4. If the change creates a conflict: flag for operator review, potentially replan

### 15.3 Replanning

The system creates a new plan version when:
- State changes invalidate plan assumptions
- The operator rejects a step and requests an alternative
- Additional blast-radius impact is discovered during execution

Replanning preserves the history of the original plan. The new version references the old version. Completed steps are not re-executed.

### 15.4 Overlapping Incidents

If a second incident is created while a recovery plan for the first is in progress:
1. The system checks whether the incidents overlap (share impacted objects)
2. If they do: the system merges the blast-radius maps and generates a combined recovery plan
3. If they do not: the plans execute independently
4. If merge is not possible (conflicting recovery targets): escalate both to operator for manual coordination

---

## 16. Data Model

```
RecoveryPlan
  ├── planId: string
  ├── incidentId: string
  ├── version: number
  ├── createdAt: timestamp
  ├── status: "draft" | "pending-approval" | "executing" | "completed" | "partial" | "failed" | "cancelled"
  ├── baselineVersionId: number       // which baseline version was used for targets
  ├── steps: RecoveryStep[]
  └── trustedStateOutcome: TrustedStateOutcome | null

RecoveryStep
  ├── stepId: string
  ├── order: number
  ├── tier: number                    // 0 = identity, 1 = identity validation, 2 = data, 3 = downstream, 4 = final
  ├── actionType: "rollback" | "restoration" | "compensating" | "validation" | "manual"
  ├── targetObjectId: string
  ├── targetObjectType: string
  ├── targetObjectName: string
  ├── targetState: object             // desired state after this step
  ├── currentStateAtPlan: object      // state when plan was generated
  ├── dependsOn: string[]             // stepIds that must complete first
  ├── approvalRequired: boolean
  ├── approvalRecord: ApprovalRecord | null
  ├── executionMode: "system" | "manual" | "recommendation-only"
  ├── status: StepStatus
  ├── rationale: string               // why this step exists, in this order
  ├── dependencyChain: string         // path from root change to this object
  ├── confidence: ConfidenceLevel
  ├── propagationDelay: number | null
  ├── executionRecord: ExecutionRecord | null
  ├── validationRecord: ValidationRecord | null
  └── failureRecord: FailureRecord | null

ApprovalRecord
  ├── approvedBy: string
  ├── approvedAt: timestamp
  ├── expiresAt: timestamp
  ├── stateAtApproval: object         // captured for staleness detection
  └── invalidated: boolean

ExecutionRecord
  ├── startedAt: timestamp
  ├── completedAt: timestamp | null
  ├── executor: "system" | string     // system or operator identity
  ├── preExecutionState: object
  ├── postExecutionState: object | null
  ├── outcome: "succeeded" | "failed" | "partial" | "skipped" | "deferred"
  ├── retryCount: number
  └── errorDetail: string | null

ValidationRecord
  ├── validatedAt: timestamp
  ├── targetState: object
  ├── observedState: object
  ├── result: "match" | "mismatch" | "pending-propagation" | "unknown"
  ├── confidence: ConfidenceLevel
  ├── revalidateAt: timestamp | null
  └── revalidationResult: ValidationRecord | null

TrustedStateOutcome
  ├── status: "restored" | "partial" | "failed" | "pending"
  ├── evaluatedAt: timestamp
  ├── verifiedSteps: number
  ├── failedSteps: number
  ├── unresolvedSteps: number
  ├── approvedBy: string | null       // for incidents requiring operator sign-off
  └── notes: string | null
```

---

## 17. Explainability and Operator Experience

For every step in the recovery plan, the operator must be able to see:

1. **Why this step exists.** The dependency chain from the incident root to this object.
2. **Why this action type.** "Compensating action: SharePoint permissions inherited through group do not self-revoke due to token caching."
3. **Why this order.** "This step depends on step 1 (group rollback) because revoking SharePoint access before the group is reverted would be immediately re-inherited."
4. **What the target state is.** "Restore Finance-Confidential site permissions to baseline: 4 authorized users with Full Control."
5. **What confidence level applies.** "High: based on authoritative edge from daily graph refresh 6 hours ago."
6. **What approval is needed.** "Operator approval required: privileged group rollback."
7. **What preconditions must hold.** "Current group membership must still be 16 members. Will revalidate before execution."
8. **What will happen after.** "After execution, validate group membership = 4 members. Then validate CA policy scope at T+5 minutes."

---

## 18. Security and Compliance Considerations

**Approval authority boundaries.** Only operators with an explicit recovery-operator role can approve recovery steps. The system must not allow the service principal used for automated execution to self-approve actions.

**Least-privilege execution credentials.** The system-execution service principal should have only the Graph API permissions needed for the actions it executes in v1 (group membership write, read-only for validation). Broader permissions are added only as execution scope expands.

**Immutable execution logs.** Every plan generation, approval decision, execution attempt, and validation result is logged in an append-only audit store. Logs must be retained per enterprise compliance policy.

**Separation of duties.** For high-severity incidents, the operator who approves the plan should not be the same identity that the system uses to execute it. This is a future consideration but should be designed for in the approval model.

**High-risk action protection.** CA policy modification, directory role changes, and any action that could cause authentication lockout must never be auto-approved, even in future automation modes.

---

## 19. Operational Constraints

**Graph API rate limits.** Each recovery step that involves a Graph API write consumes rate-limit budget. A plan with 15 executable steps is well within limits. Plans with 100+ steps (large-scale incidents) must be throttled to avoid exhausting the tenant's rate-limit budget.

**Execution timing.** The total time from plan approval to trusted-state declaration depends on propagation delays. For the canonical scenario (group rollback + downstream compensating + validation), expect 15-60 minutes including propagation delays and re-validation.

**Partial outages.** If Microsoft Graph API is partially unavailable during execution, the system should pause affected steps and continue with steps that target unaffected APIs. The system should never fail the entire plan because one API is temporarily unavailable.

**Incident concurrency.** Two incidents affecting overlapping objects require careful coordination. The system should detect overlap and either merge plans or serialize execution with operator coordination.

---

## 20. Risk Register

| Risk | Why It Matters | Severity | Mitigation |
|------|---------------|----------|------------|
| Wrong action type selected | Rollback when compensating was needed, or vice versa; incomplete recovery | High | Action classification logic with clear decision tree; operator review of plan before execution |
| Stale plan executed after state changed | Plan assumes state A but state is now B; execution produces wrong result | Critical | Mandatory pre-execution state validation; approval staleness expiration |
| Execution causes more damage | System-executed rollback produces unintended side effects | Critical | Recommendation-first v1; group rollback only system-executable; circuit breaker; pre-execution dry run |
| Validation claims success too early | Propagation not complete; system declares "restored" prematurely | High | Propagation-delay rules; deferred re-validation; no trusted-state declaration until all re-checks pass |
| Approval on outdated plan | Operator approves at T, executes at T+30; state changed at T+15 | High | Approval expiration (30 min default); re-validation before execution; approval invalidation on state change |
| Overlapping incidents with conflicting recovery targets | Two plans try to set the same object to different states | High | Overlap detection; plan merge or serialization; operator coordination for conflicts |
| Retry duplicates side effects | Retrying a partially completed step creates duplicate changes | Medium | Idempotency checks (read current state before write); per-action-type retry semantics |
| Partial completion leaves inconsistent state | Some steps complete, some fail; system is in a worse state than before | High | Tier-based execution (complete a tier before starting the next); clear partial-completion reporting; operator pause/resume |
| Operator approval fatigue | Too many approval gates lead to rubber-stamping | Medium | Tier-based batch approval; auto-approval for low-risk compensating/validation steps; track approval thoroughness |

---

## 21. Open Questions

1. **Should the system support "dry run" execution?** Execute the plan against a simulated state to predict outcomes before committing to real writes. Useful but adds significant implementation complexity.

2. **How should the system handle recovery of its own failed actions?** If a system-executed rollback partially fails (removed 8 of 12 members), how does the system recover from its own incomplete action?

3. **Should operators be able to reorder steps?** If an operator disagrees with the system's sequencing, should they be able to manually reorder steps within a tier? Across tiers?

4. **What is the right approval expiration window?** 30 minutes is a starting point. Is this too long (state could change significantly) or too short (operator may be coordinating with other teams)?

5. **How should the system handle actions that are partially successful?** A group membership removal call that removes 10 of 12 members before hitting a rate limit: is this "partial success" or "failure"?

6. **Should the system generate a "recovery undo" plan?** If a recovery plan was executed incorrectly and needs to be reversed, can the system generate a plan to undo the recovery?

7. **How should the system distinguish its own recovery actions from new incidents?** A recovery rollback generates audit events. The change-capture system must not flag these as new incidents.

---

## 22. Recommendation Summary

### Build for v1

- **Recommendation-first orchestrator** that generates fully ordered, dependency-aware, tier-based recovery plans from blast-radius output and baseline data
- **4 action types:** rollback, restoration, compensating action, validation. Each has clear selection criteria and distinct behavior.
- **Tier-based sequencing:** Tier 0 (identity rollback) → Tier 1 (identity validation) → Tier 2 (data compensating) → Tier 3 (downstream validation) → Tier 4 (trusted-state declaration)
- **Group membership rollback** is the only system-executable write action in v1. All other writes are recommendation-only.
- **Mandatory pre-execution validation** for every step. Approval staleness expiration at 30 minutes. Circuit breaker after 3 consecutive failures.
- **Deferred re-validation** for eventually consistent systems (SharePoint 15 min, Teams 5 min, provisioning 60 min)
- **Full data model** for plans, steps, approvals, execution records, validation records, and trusted-state outcomes

### Defer to v2+

- System execution for SharePoint permission revocation and app role removal
- Dry-run execution mode
- Automatic plan merging for overlapping incidents
- Recovery undo planning
- Operator step reordering within plans
- CA policy modification execution (requires extensive safety validation)

### Assumptions That Must Hold

1. Group membership modification via Graph API is reliable, idempotent (removing an already-absent member is a no-op), and does not cause unexpected side effects.
2. Pre-execution state reads via Graph API are consistent enough for staleness detection (no significant read-after-write lag for the object being checked).
3. Operators will engage with the approval workflow rather than rubber-stamping. Tier-based approval reduces fatigue enough to maintain attention.
4. Microsoft Graph API rate limits are sufficient for a 7-15 step recovery plan executing within a 30-minute window.

### Prototype/Validate Next

1. **Group membership rollback reliability.** Execute 50+ group membership removals against a test tenant. Measure success rate, idempotency behavior (retry after partial success), and downstream propagation timing.
2. **Pre-execution validation latency.** Measure the time from "read current state" to "compare against plan assumption" for group membership, CA policy, and SharePoint permissions. Confirm sub-2-second target.
3. **Propagation timing measurement.** After a group membership rollback, measure: (a) time until CA policy effective scope updates, (b) time until SharePoint permission inheritance reflects the change, (c) time until Teams membership sync completes. Calibrate the deferred re-validation windows.
