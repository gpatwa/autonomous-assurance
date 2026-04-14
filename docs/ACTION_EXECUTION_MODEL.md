# Action Execution Model

**Author:** Principal Architect  
**Date:** April 2026  
**Status:** Draft for internal review  
**Prerequisites:** Architecture Memo, Recovery Orchestration Design, Tenant Security Architecture, Connector and Ingestion Design  
**Classification:** Internal / Confidential

---

## 1. Executive Summary

The action execution model defines how KavachIQ performs system-executed write operations against a customer's Microsoft Entra environment. This is the highest-risk layer in the product: a bug here can cause more damage than the incident being recovered.

**v1 execution scope:** One action type only: **remove specified members from an Entra security group.** No other write operation is system-executed in v1. All other recovery actions (SharePoint permission revocation, Exchange delegation restoration, CA policy validation, Teams membership confirmation, downstream app verification) are recommendation-only in v1.

**Execution model:** Each system-executed action is derived from an approved recovery step. Before execution, the engine verifies the signed approval token, confirms the token has not expired, reads the target object's current state to confirm it matches plan assumptions, and only then constructs and executes the Graph API call. Execution is per-member (one `DELETE` call per member removal), not batched, to maintain granular success/failure tracking and idempotency. Each sub-action (individual member removal) is a pre-read-before-write operation: the system confirms the member is still present before attempting removal. Removing an already-absent member is treated as success (idempotent).

**Key trade-off:** Per-member execution is slower than batch operations but provides granular failure isolation. If member 7 of 12 fails, members 1-6 are confirmed removed and members 8-12 can still be attempted. Batch operations risk all-or-nothing failures.

---

## 2. Problem Statement

### Why action execution is hard

**Write actions can cause more damage than the incident.** Removing the wrong member from a group, or removing members from the wrong group, can cause authentication failures, access revocations, or downstream provisioning side effects that are worse than the original unauthorized access expansion.

**Microsoft Graph API is not perfectly uniform.** Different endpoints have different idempotency guarantees, error codes, and eventual-consistency behaviors. The `DELETE /groups/{groupId}/members/{memberId}/$ref` endpoint returns `204 No Content` on success and `404 Not Found` if the member is already absent, which is useful for idempotency. But not all future action types will have this behavior.

**State may change between plan and execution.** An operator may approve a recovery step, then another agent or operator modifies the same group before execution occurs. Executing against stale assumptions is dangerous.

**Partial execution creates inconsistent state.** If the system removes 8 of 12 members before hitting a rate limit, the group is in a state that was never intended: not the pre-incident state, not the baseline, not the target. The system must track and communicate partial completion.

**Recovery actions generate audit events.** Every Graph API write appears in the customer's Entra audit log. The ingestion service must not treat these as new incidents. The execution layer must make its writes identifiable.

**Retries can duplicate side effects.** If a network timeout occurs after the request was sent but before the response was received, the system does not know whether the operation succeeded. Retrying may be safe (if the operation is idempotent) or harmful (if it is not).

---

## 3. Design Goals

1. **Narrow and safe v1 scope.** One action type, thoroughly validated, rather than many action types poorly understood.
2. **Approval-gated execution.** No write without a verified, non-expired, state-matched approval token.
3. **Strict pre-execution validation.** Read current state before every write. Do not execute if state does not match assumptions.
4. **Granular idempotency.** Each sub-action (individual member removal) is independently idempotent.
5. **Granular failure tracking.** Each sub-action is independently tracked. Partial completion is accurately represented.
6. **Self-action provenance.** Every write is tagged with the plan ID, step ID, and action instance ID for correlation.
7. **Auditable execution records.** Pre-state, post-state, response, and timing are recorded for every sub-action.
8. **Clean handoff to validation.** After execution, the validation service receives a structured handoff with expected post-state and propagation timing.
9. **Circuit breaker.** If multiple sub-actions fail consecutively, halt and escalate.

---

## 4. Non-Goals and Boundaries

- **Not generalized write automation.** v1 executes group membership removal only. No property modifications, no object creation/deletion, no policy writes.
- **Not autonomous execution.** Every execution requires a prior operator approval. No auto-approval in v1 for system-executed writes.
- **Not CA policy modification.** Too high-risk. CA policy validation is read-only in v1.
- **Not Exchange write actions.** Exchange delegation management requires EWS/PowerShell, not Graph API. Deferred.
- **Not downstream SaaS remediation.** Downstream app entitlement changes are recommendation-only.
- **Not write-path optimization.** v1 prioritizes safety over speed. Per-member execution is slower but safer than batching.

---

## 5. v1 Execution Scope

### Supported: Entra Group Membership Removal

| Property | Value |
|----------|-------|
| **Action** | Remove specified members from a security group |
| **Graph API** | `DELETE /groups/{groupId}/members/{memberId}/$ref` |
| **Permission required** | `GroupMember.ReadWrite.All` (application) |
| **Idempotency** | Natural: removing an absent member returns 404, treated as success |
| **Reversibility** | Yes: removed members can be re-added |
| **Risk** | Medium: may trigger downstream provisioning deprovisioning |
| **Approval required** | Always in v1 |
| **v1 status** | **Supported** |

### Evaluated and Deferred

| Action | v1 Status | Why Deferred |
|--------|-----------|-------------|
| Add members to group | Deferred | Adding creates access; higher risk than removing. Requires different approval posture. |
| Modify group properties | Deferred | Property changes (displayName, description) are low-impact but add execution surface for limited recovery value. |
| Remove app role assignment | Deferred | App role removal via `DELETE /servicePrincipals/{id}/appRoleAssignedTo/{id}` is viable but adds a second action type to validate. v2. |
| Modify CA policy | Deferred | `PATCH /identity/conditionalAccess/policies/{id}` is high-risk. A misconfigured policy can lock out administrators. Not before extensive validation. |
| Modify SharePoint permissions | Deferred | SharePoint permission APIs are complex (inheritance, sharing links, direct permissions). v2+. |
| Exchange delegation | Deferred | Requires EWS or PowerShell, not Graph API. Adds deployment complexity. |

---

## 6. Action Model

### Core Abstractions

```
ActionTemplate
  ├── templateId: "entra-group-member-remove"
  ├── objectType: "group"
  ├── operationType: "member-removal"
  ├── graphEndpoint: "DELETE /groups/{groupId}/members/{memberId}/$ref"
  ├── requiredPermission: "GroupMember.ReadWrite.All"
  ├── idempotencyModel: "natural" (404 = already applied)
  ├── retriable: true
  ├── maxRetries: 2
  └── expectedPropagation: { sharepoint: 900s, teams: 300s, ca: 300s }

ActionInstance
  ├── instanceId: string (UUID)
  ├── templateId: "entra-group-member-remove"
  ├── incidentId: string
  ├── planId: string
  ├── planVersion: number
  ├── stepId: string
  ├── approvalTokenId: string
  ├── targetGroupId: string
  ├── targetGroupName: string
  ├── membersToRemove: MemberTarget[]
  ├── targetState: { expectedMemberCount: number, expectedMemberIds: string[] }
  ├── status: ActionStatus
  ├── subActions: SubAction[]
  └── createdAt: timestamp

MemberTarget
  ├── memberId: string
  ├── memberUPN: string
  ├── memberDisplayName: string
  └── removalReason: string ("added by incident-triggering agent action")

SubAction
  ├── subActionId: string
  ├── memberId: string
  ├── status: SubActionStatus
  ├── preReadState: "present" | "absent" | "read-failed"
  ├── attempt: AttemptRecord[]
  └── postReadState: "present" | "absent" | "read-failed" | null
```

### How a Recovery Step Becomes an Action Instance

1. Recovery planner generates step: "Rollback: remove 12 members from Finance-Privileged-Access"
2. Operator approves the step. Approval service issues a signed token.
3. Orchestrator creates an `ActionInstance` with the step reference, approval token, target group, and member list.
4. Execution engine receives the instance and begins the execution lifecycle.

---

## 7. Execution Request Lifecycle

```
┌──────────────┐
│ Step Approved │
│ (token issued)│
└──────┬───────┘
       │
┌──────▼───────┐
│ Action       │ Create ActionInstance from step + approval
│ Instance     │
│ Created      │
└──────┬───────┘
       │
┌──────▼───────────┐
│ Pre-Execution    │ Verify token, read current state,
│ Validation       │ check preconditions
└──────┬───────────┘
       │
  ┌────┴────┐
  │ Pass?   │
  ├── No ──▶ Halt. Report failure. Require re-approval.
  │
  ├── Yes
  │
┌─▼────────────────┐
│ Execute          │ Per-member removal loop
│ Sub-Actions      │ (pre-read → delete → record)
└──────┬───────────┘
       │
  ┌────┴────┐
  │ All OK? │
  ├── Yes ──▶ Mark completed. Record post-state. Hand off to validation.
  │
  ├── Partial ──▶ Mark partially-completed. Report to operator. Halt tier.
  │
  └── All fail ──▶ Mark failed. Escalate. Halt tier.
       │
┌──────▼───────────┐
│ Self-Action      │ Tag execution in audit with instanceId,
│ Provenance       │ planId, stepId for ingestion recognition
└──────┬───────────┘
       │
┌──────▼───────────┐
│ Validation       │ Schedule immediate check + deferred re-check
│ Handoff          │ for downstream propagation
└──────────────────┘
```

---

## 8. Preconditions and Pre-Execution Validation

### Mandatory Pre-Execution Checks

| Check | How | Failure Behavior |
|-------|-----|-----------------|
| **Approval token valid** | Verify HMAC/RSA signature against approval service public key | Reject. Cannot execute without valid approval. |
| **Approval not expired** | Compare `expiresAt` against current time (30-min default) | Reject. Require re-approval. |
| **State hash matches** | Read current group membership via `GET /groups/{id}/members`; compute hash; compare to `stateHashAtApproval` in token | Reject. State changed since approval. Present new state to operator. |
| **Target group exists** | `GET /groups/{id}` returns 200 | Reject. Group may have been deleted or renamed. |
| **Members to remove are present** | Check each target member ID against current member list | For each absent member: mark sub-action as "already applied" (idempotent success). Continue with remaining. |
| **SP-Execute has permission** | Verify `GroupMember.ReadWrite.All` is consented for the tenant | Reject. Alert operator with permission guidance. |
| **Rate limit headroom** | Check remaining rate-limit budget (from response headers of pre-read) | Defer. Retry after rate-limit reset. |
| **No circuit breaker active** | Check whether this tenant has an active circuit breaker from prior failures | Reject. Escalate. |

### Design Invariant

**No write operation proceeds if any precondition check fails.** This is enforced in code, not by convention. The execution function returns an error without reaching the write path if preconditions are not met.

---

## 9. Graph API Execution Model

### Group Member Removal

**Endpoint:** `DELETE /groups/{groupId}/members/{memberId}/$ref`

**Authentication:** SP-Execute client certificate (per-tenant vault)

**Request construction:**
```http
DELETE https://graph.microsoft.com/v1.0/groups/{groupId}/members/{memberId}/$ref
Authorization: Bearer {token-from-SP-Execute}
Content-Type: application/json
```

No request body. The member is identified by the URL path.

**Expected responses:**

| Status Code | Meaning | Action |
|-------------|---------|--------|
| `204 No Content` | Member successfully removed | Record success |
| `404 Not Found` | Member was not in the group (already removed) | Record as idempotent success |
| `403 Forbidden` | Insufficient permissions | Record failure; halt; check SP-Execute consent |
| `429 Too Many Requests` | Rate limited | Wait `Retry-After` seconds; retry |
| `5xx` | Server error | Retry with backoff (up to 2 retries) |
| Network timeout | No response received | Pre-read to check if the member is still present; if absent, success; if present, retry |

**Execution order:** Members are removed sequentially, one `DELETE` per member. The system does not use batch requests (`$batch`) for member removal because:
1. Per-member tracking provides granular failure isolation
2. Per-member pre-read ensures idempotency per sub-action
3. A batch failure is opaque (which sub-requests succeeded?)
4. Sequential execution respects rate limits more gracefully

**Rate-limit handling:** After each `DELETE`, the system checks the `x-ms-ratelimit-remaining` response header. If remaining budget drops below a threshold (default: 100), the system pauses for 10 seconds before continuing. If a `429` is received, the system waits for the `Retry-After` duration.

### Pre-Read: Current Membership Check

Before executing any removals, the system reads the current membership:
```http
GET /groups/{groupId}/members?$select=id,userPrincipalName,displayName
```

This serves three purposes:
1. **State-hash validation:** Compute the hash and compare to the approval token
2. **Already-absent detection:** Members already removed are skipped (idempotent)
3. **Unexpected-member detection:** If the group now has members not in the plan (someone added during the window), the system logs the discrepancy but does not modify those members

---

## 10. Idempotency Model

### Natural Idempotency of Member Removal

Removing a member who is already absent returns `404 Not Found`. This is treated as success ("already applied"). The system records this as `SubActionStatus: "already-absent"`, not as a failure.

### Action-Level Idempotency

Each `ActionInstance` has a unique `instanceId`. If the same `instanceId` is submitted twice (retry at the orchestrator level), the execution engine checks the action's current status:
- If all sub-actions are already completed: return the existing result (no re-execution)
- If some sub-actions are incomplete: resume from the first incomplete sub-action
- If the action has not started: begin execution normally

### Sub-Action-Level Idempotency

Each sub-action follows the pattern: **pre-read → write → post-read**.

```
Pre-read: Is member X in the group?
  ├── No  → Mark "already-absent". Skip write.
  └── Yes → Execute DELETE.
             ├── 204 → Mark "removed". Post-read to confirm.
             ├── 404 → Mark "already-absent" (race condition: removed between pre-read and write).
             └── Error → Handle per retry/failure model.
```

This pre-read-before-write pattern makes each sub-action independently idempotent regardless of the underlying API's behavior.

---

## 11. Retry and Backoff Model

### Retry Policy

| Failure Class | Retriable | Max Retries | Backoff | Notes |
|--------------|-----------|-------------|---------|-------|
| `429 Too Many Requests` | Yes | 3 | `Retry-After` header (or 30s if absent) | Rate limit; always retry after cooldown |
| `5xx Server Error` | Yes | 2 | Exponential: 2s, 8s | Transient server issue |
| Network timeout | Yes | 2 | Exponential: 5s, 15s | Pre-read after timeout to check state |
| `403 Forbidden` | No | 0 | N/A | Permission issue; requires operator intervention |
| `400 Bad Request` | No | 0 | N/A | Request construction error; requires engineering fix |
| `404 Not Found` (member) | No (success) | 0 | N/A | Idempotent: member already removed |
| `404 Not Found` (group) | No (fatal) | 0 | N/A | Group deleted; halt all sub-actions |

### Retry Interaction with Approval

If a retry is needed more than 5 minutes after the original execution started, the system re-verifies the approval token. If the token has expired during the retry window, the system halts and requires re-approval.

### Circuit Breaker

If 3 consecutive sub-actions fail with non-retriable errors, the execution engine:
1. Halts all remaining sub-actions for this action instance
2. Marks the action as "circuit-broken"
3. Halts the recovery tier (no downstream steps proceed)
4. Alerts the operator with failure details
5. Logs the circuit breaker activation in the audit trail

---

## 12. Partial Failure Handling

### Scenario: 8 of 12 Members Removed, Then Rate-Limited

```
Sub-actions 1-8: Completed (members removed)
Sub-action 9: 429 Rate Limited
  → Wait for Retry-After
  → Retry sub-action 9: Success
Sub-actions 10-12: Completed

Result: All 12 members removed. Action marked "completed."
```

### Scenario: 8 of 12 Members Removed, Then Permission Failure

```
Sub-actions 1-8: Completed (members removed)
Sub-action 9: 403 Forbidden
  → Not retriable
  → Sub-action 9 marked "failed"
  → Circuit check: 1 failure, not yet at threshold
Sub-action 10: 403 Forbidden
  → Circuit check: 2 failures
Sub-action 11: 403 Forbidden
  → Circuit check: 3 consecutive → CIRCUIT BREAKER ACTIVATED

Result: 8 of 12 removed. Action marked "partially-completed."
Operator sees: "8 members removed. 4 remaining. Execution halted due to permission error."
```

### Partial Completion State

```
ActionInstance.status: "partially-completed"
ActionInstance.subActions:
  [1] memberId: user-1  → status: "removed"
  [2] memberId: user-2  → status: "removed"
  ...
  [8] memberId: user-8  → status: "removed"
  [9] memberId: user-9  → status: "failed" (403)
  [10] memberId: user-10 → status: "failed" (403)
  [11] memberId: user-11 → status: "failed" (403 / circuit breaker)
  [12] memberId: user-12 → status: "not-attempted" (halted)
```

### Operator Options for Partial Completion

1. **Resolve permission issue and resume.** Operator fixes SP-Execute consent; clicks "Resume remaining sub-actions."
2. **Complete manually.** Operator removes remaining members via Entra portal; confirms completion in KavachIQ.
3. **Accept partial.** Operator acknowledges partial completion; marks remaining as "manual / deferred."

---

## 13. Execution State Model

```
                  ┌───────────┐
                  │  created   │
                  └─────┬─────┘
                        │ pre-execution validation begins
                  ┌─────▼─────┐
                  │ validating │
                  └─────┬─────┘
                        │
              ┌─────────┴─────────┐
              │                   │
        ┌─────▼─────┐     ┌──────▼──────┐
        │  ready     │     │  blocked    │ precondition failed
        └─────┬─────┘     └─────────────┘ (requires re-approval or fix)
              │ begin execution
        ┌─────▼─────┐
        │ executing  │ sub-actions in progress
        └─────┬─────┘
              │
    ┌─────────┼──────────────┐
    │         │              │
┌───▼───┐ ┌──▼──────────┐ ┌─▼──────┐
│completed│ │partially-   │ │failed  │
│        │ │completed    │ │        │
└───┬────┘ └──────┬──────┘ └───┬────┘
    │             │            │
    │        (operator         │
    │        resumes or        │
    │        confirms)         │
    │             │            │
    ▼             ▼            ▼
┌─────────────────────────────────┐
│     validation-handoff          │
└─────────────────────────────────┘
```

### Sub-Action States

| State | Meaning |
|-------|---------|
| `pending` | Not yet attempted |
| `pre-reading` | Reading current state for this member |
| `already-absent` | Pre-read confirmed member is not in group (idempotent success) |
| `executing` | DELETE request in flight |
| `removed` | DELETE returned 204 or 404 (confirmed removed) |
| `failed` | Non-retriable error |
| `retrying` | Retriable error; waiting for backoff |
| `not-attempted` | Halted by circuit breaker before this sub-action was tried |

---

## 14. Postconditions and Validation Handoff

### What Execution Hands to Validation

```
ValidationHandoff
  ├── incidentId: string
  ├── stepId: string
  ├── actionInstanceId: string
  ├── executionOutcome: "completed" | "partially-completed" | "failed"
  ├── targetGroupId: string
  ├── targetGroupName: string
  ├── expectedPostState: { memberCount: number, memberIds: string[] }
  ├── preExecutionState: { memberCount: number, memberIds: string[] }
  ├── postExecutionState: { memberCount: number, memberIds: string[] } // read after execution
  ├── subActionResults: { memberId, status }[]
  ├── executedAt: timestamp
  ├── selfActionMarkers: { instanceId, templateId, graphCorrelationId }
  └── expectedPropagationDelays: { sharepoint: 900s, teams: 300s, ca: 300s }
```

### What Execution Considers "Success"

Execution considers a sub-action successful if the member is absent from the group after the operation (whether removed by the DELETE call or already absent before it). Execution considers the full action "completed" if all target members are confirmed absent.

**Execution success does not mean recovery is complete.** Downstream systems (SharePoint, Teams, CA policy scope) may still reflect the old membership due to propagation delay. Only the validation service, operating after the propagation window, can confirm downstream recovery.

### Post-Execution Read

After all sub-actions complete (or after partial completion), the execution engine performs one final group membership read:
```http
GET /groups/{groupId}/members?$select=id,userPrincipalName
```

This post-execution state is recorded in the handoff. If the post-read shows unexpected members (someone added during execution), this is logged as a discrepancy but not automatically acted upon. The validation service and operator handle it.

---

## 15. Self-Action Tagging and Loop Prevention

### Execution Identity

All Graph API calls by the execution engine use the **SP-Execute** service principal. This service principal has a known, fixed `appId` per tenant.

### Audit Event Correlation

When SP-Execute removes a group member, Microsoft generates an Entra audit event with:
- `initiatedBy.app.appId` = SP-Execute's appId
- `activityDisplayName` = "Remove member from group"
- `targetResources[0].id` = the group object ID

### Ingestion Recognition

The ingestion service (which monitors audit logs) recognizes self-actions by matching:
1. `initiatedBy.app.appId` == configured SP-Execute appId for this tenant
2. The audit event's `correlationId` or timing matches a known `ActionInstance`

When both match, the normalized change is tagged `selfAction: true` and linked to the specific `actionInstanceId`. This event is:
- **Stored** in the raw event store and normalized change store (for audit completeness)
- **Excluded** from incident candidate scoring (no false incident)
- **Visible** in the audit trail with full provenance (plan, step, action, approval)

### Unauthorized Write Detection

If the ingestion service sees a write by SP-Execute that does **not** match any known `ActionInstance`:
1. Alert the security monitoring system
2. Flag the event as "unauthorized self-action"
3. Trigger the safe-mode evaluation: consider revoking SP-Execute certificate
4. Notify the tenant admin

---

## 16. Data Model

```
ActionInstance
  ├── instanceId: string (UUID)
  ├── templateId: string
  ├── incidentId: string
  ├── planId: string
  ├── planVersion: number
  ├── stepId: string
  ├── approvalTokenId: string
  ├── tenantId: string
  ├── targetObjectId: string
  ├── targetObjectType: string
  ├── targetObjectName: string
  ├── membersToRemove: MemberTarget[]
  ├── expectedPostState: object
  ├── status: ActionStatus
  ├── subActions: SubAction[]
  ├── preExecutionState: object | null
  ├── postExecutionState: object | null
  ├── circuitBroken: boolean
  ├── createdAt: timestamp
  ├── startedAt: timestamp | null
  ├── completedAt: timestamp | null
  └── validationHandoffId: string | null

SubAction
  ├── subActionId: string
  ├── actionInstanceId: string
  ├── memberId: string
  ├── memberUPN: string
  ├── status: SubActionStatus
  ├── preReadResult: "present" | "absent" | "read-failed"
  ├── attempts: AttemptRecord[]
  ├── postReadResult: "present" | "absent" | null
  └── completedAt: timestamp | null

AttemptRecord
  ├── attemptNumber: number
  ├── startedAt: timestamp
  ├── completedAt: timestamp
  ├── httpStatus: number | null
  ├── graphCorrelationId: string | null  // from x-ms-correlation-id response header
  ├── outcome: "success" | "already-absent" | "rate-limited" | "server-error" | "timeout" | "permission-denied" | "bad-request"
  ├── retryAfter: number | null
  └── errorDetail: string | null

PreconditionRecord
  ├── actionInstanceId: string
  ├── checkedAt: timestamp
  ├── approvalValid: boolean
  ├── approvalExpired: boolean
  ├── stateHashMatch: boolean
  ├── targetExists: boolean
  ├── permissionAvailable: boolean
  ├── rateLimitSufficient: boolean
  ├── circuitBreakerClear: boolean
  ├── overallResult: "pass" | "fail"
  └── failureReasons: string[]
```

---

## 17. Security and Permission Boundaries

### SP-Execute Scope in v1

The execution service principal has exactly one application permission: `GroupMember.ReadWrite.All`. This permission allows:
- Read group membership (used for pre-read and post-read)
- Add members to groups (not used in v1, but permitted by the scope)
- Remove members from groups (the v1 action)

The execution engine's code only invokes `DELETE /groups/{id}/members/{id}/$ref`. The `add member` capability is not invoked by any code path in v1. The permission is scoped this way because Microsoft does not offer `GroupMember.Remove.All` as a separate permission.

### Approval Token Verification

The execution engine holds SP-Execute credentials but cannot use them until an approval token is verified. The token verification is performed by the execution engine itself (not delegated to another service) using the approval service's public key. This means:
- Compromising the execution engine alone is not sufficient for unauthorized writes (also need the approval signing key)
- Compromising the approval signing key alone is not sufficient (also need SP-Execute credentials)
- Both must be compromised for an unauthorized write

### Safe Mode

Write-disable safe mode (defined in tenant security doc) is enforced at the execution engine level. When safe mode is active:
- The execution engine refuses all action instances regardless of approval status
- SP-Execute credentials may be revoked from the vault as an additional safeguard
- The engine logs all refused actions for audit

---

## 18. Operational Constraints

### Rate Limits

A single group membership rollback of 12 members requires:
- 1 GET for current membership (pre-read)
- Up to 12 pre-reads (individual member checks — can be skipped if bulk GET suffices)
- 12 DELETE requests
- 1 GET for post-execution state read

**Total: ~14-25 API calls per action instance.** At the default rate limit (10,000 req/10 min), this is negligible. Even a large rollback (100 members) would use ~115 calls.

### Timing Expectations

| Phase | Expected Duration |
|-------|------------------|
| Pre-execution validation (state read + hash check) | 1-3 seconds |
| Per-member removal (pre-read + DELETE) | 0.5-1 second per member |
| 12-member rollback total execution | 6-15 seconds |
| Post-execution state read | 1-2 seconds |
| **Total for canonical scenario** | **10-20 seconds** |

### Large Groups

For groups with 100+ members to remove:
- Sequential execution takes 50-100+ seconds
- Rate-limit pauses may extend this
- The operator should see a progress indicator (X of N members removed)
- The circuit breaker threshold (3 consecutive failures) remains at 3 regardless of group size

---

## 19. Risk Register

| Risk | Why It Matters | Severity | Mitigation |
|------|---------------|----------|------------|
| Wrong member removed | Removes a legitimate member not involved in the incident | Critical | Pre-read confirms target member is present; member list comes from blast-radius output, not user input; operator reviews plan |
| Partial rollback leaves inconsistent group | Some members removed, others not; group is in an unintended state | High | Granular sub-action tracking; partial-completion status; operator resume/manual options |
| Stale approval used for execution | State changed between approval and execution; execution acts on wrong assumptions | Critical | Mandatory state-hash check before execution; approval expires after 30 minutes |
| Retry duplicates removal of re-added member | Member removed, re-added by operator, then retry removes them again | Medium | Pre-read before every write; "already absent" treated as success; no blind retry |
| Self-action not recognized by ingestion | Recovery write flagged as new incident; creates feedback loop | High | SP-Execute appId matching; action instance correlation; self-action tag in normalized changes |
| Graph API behavior differs from assumptions | 404 for absent member is assumed; Microsoft changes behavior | Medium | Integration tests against real tenant; response code handling is enumerated, not assumed |
| SP-Execute permission used for unauthorized write | Compromised service adds members (not just removes) | Critical | Approval token required for any execution path; code review of execution engine paths; write monitoring alerts |
| Network timeout after DELETE sent | Unknown whether member was removed | Medium | Post-timeout pre-read to check state; if absent, mark success; if present, retry |
| Execution during concurrent incident | Another incident modifies the same group during rollback | Medium | Pre-read before each sub-action detects unexpected changes; discrepancies logged; operator alerted |

---

## 20. Open Questions

1. **Should the system support batch removal (`$batch`) as an optimization for large groups?** Batch is faster but provides less granular error handling. Could be a v2 optimization with fallback to sequential on batch failure.

2. **Should the pre-read check each member individually or rely on the bulk membership list?** Individual checks are more precise but cost more API calls. Bulk list + in-memory check is faster. Recommendation: bulk list for groups under 500 members; individual checks or delta queries for larger groups.

3. **What happens if the group type changes between plan and execution?** If the group becomes a dynamic group, member removal via Graph API will fail (dynamic groups do not support explicit member removal). Should the precondition check include group type verification?

4. **Should the execution engine support "dry run" mode?** Dry run would perform all precondition checks and pre-reads but skip the actual DELETE. Useful for operator confidence before first real execution. Adds implementation cost.

5. **How should the system handle removing members from groups with ownership constraints?** If one of the members to remove is a group owner, removal may fail or behave differently. Should owner status be checked during pre-execution?

6. **What is the right circuit breaker reset behavior?** After a circuit breaker activates and the operator resolves the issue, should the circuit breaker auto-reset or require explicit operator reset?

---

## 21. Recommendation Summary

### Build for v1

- **One action type:** Entra group member removal via `DELETE /groups/{id}/members/{id}/$ref`
- **Per-member sequential execution** with pre-read-before-write idempotency
- **Mandatory preconditions:** approval token verification, state-hash match, target existence, permission check, rate-limit check, circuit-breaker check
- **Granular sub-action tracking** with per-member status, attempt records, and timing
- **Self-action tagging** via SP-Execute appId matching in ingestion + action instance correlation
- **Circuit breaker** after 3 consecutive non-retriable failures
- **Structured validation handoff** with expected post-state and propagation delay schedule

### Defer to v2+

- App role assignment removal
- Group member addition (inverse rollback)
- Batch execution optimization
- CA policy modification
- SharePoint permission writes
- Dry-run execution mode
- Exchange delegation management

### Assumptions That Must Hold

1. `DELETE /groups/{groupId}/members/{memberId}/$ref` returns `204` on success and `404` when the member is already absent. Microsoft does not change this behavior.
2. `GroupMember.ReadWrite.All` application permission is sufficient for the remove-member operation and does not require additional consent prompts.
3. Removing a member from a security group does not trigger unexpected provisioning connector behavior that cannot be detected through the existing ingestion pipeline.
4. The rate-limit budget for 12-25 API calls per action instance is consistently available within the 10,000 req/10 min tenant limit.

### Prototype/Validate Next

1. **Member removal reliability.** Execute 100+ member removals against a test Entra tenant across various group types (security, M365, mail-enabled). Verify: 204 on success, 404 on already-absent, no unexpected side effects, consistent timing.
2. **Idempotency under network failure.** Simulate network timeouts during DELETE requests. Verify that post-timeout pre-reads correctly detect whether the member was removed. Confirm no duplicate side effects from retries.
3. **Self-action recognition latency.** After a system-executed member removal, measure the time until the corresponding Entra audit event is ingested and tagged as `selfAction: true`. Confirm the ingestion pipeline does not create an incident candidate for the self-action.
