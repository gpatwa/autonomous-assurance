# Live End-to-End Recovery Execution MVP Plan

**Status:** Implementation in progress
**Date:** 2026-05-26  
**Scope:** CANONICAL-001, privileged Entra group membership expansion by agent  
**Audience:** Engineering, founder, prospect-demo preparation  

---

## MVP Goal

Build one real, repeatable, prospect-safe recovery path:

```text
audit event ingestion
→ incident creation
→ blast radius view
→ recovery plan
→ operator approval
→ live Entra group rollback
→ validation
→ evidence pack
```

The MVP proves the wedge without overclaim:

- **System-assisted execution only for Entra group member removal.**
- **Downstream Microsoft 365 surfaces remain recommendation, validation, or manual-confirmation steps.**
- **No autonomous rollback. Every write requires explicit operator approval.**

Current implementation progress:

- Persistence, canonical demo-tenant harness, blast-radius generation, plan generation, planning APIs, approval API, and group-member rollback execution package are implemented.
- The operator bridge `platform/scripts/execute-approved-recovery.ts` now connects an approved plan step to SP-Execute Graph writes, validation persistence, plan update, and audit records.
- Authenticated evidence-pack export is implemented at
  `GET /tenants/:tenantId/incidents/:incidentId/evidence-pack`.
- The auth-gated console incident view now shows live recovery execution
  evidence when an evidence pack exists.
- `platform/scripts/live-demo-readiness.ts` runs the repeatable live gate.
- `platform/scripts/live-demo-safety-checks.ts` validates the stale-plan
  fail-closed path and already-absent idempotency path.

Latest prospect-demo validation, completed on 2026-05-28:

- Safety checks: stale-plan incident `inc_ae3d7905f192e7539395dba2e5a5848e`
  blocked execution with zero persisted action instances; idempotency incident
  `inc_522c3217e56143db044e135ad6227344` completed with 3
  `already-absent` sub-actions, 9 removals, validation `match`, and post
  member count 4.
- Happy-path readiness: incident `inc_d5bc4a82b4124da038f464870fdcc547`
  completed with 12 root changes, 22 impacted objects, 8 plan steps,
  validation `match`, and post member count 4.
- Fallback screenshot: `artifacts/live-mvp/prospect-demo-console-evidence.png`.

---

## Locked Demo Scenario

Use `CANONICAL-001` from `docs/CANONICAL_SCENARIO_FIXTURE.md`.

| Element | MVP value |
|---|---|
| Actor | `Access Lifecycle Agent` service principal |
| Target | `Finance-Privileged-Access` Entra security group |
| Incident | 12 members added to privileged group |
| Baseline | 4 approved finance leaders |
| System write | Remove only the 12 incident-added members |
| Validation | Confirm group membership is restored to the 4-member baseline |
| Evidence | Export the incident, plan, approval, execution, validation, and audit trail |

---

## Non-Goals

- No production customer tenant execution before design-partner approval.
- No SharePoint, Exchange, Teams, Conditional Access, or downstream app writes.
- No silent remediation.
- No "one click restores everything" demo framing.
- No pricing, compliance-certification, or customer-logo claims.

---

## Phase 1 — Demo Tenant And Reset Harness

Create a controlled Microsoft 365 tenant that can be reset before every prospect call.

Deliverables:

- `Finance-Privileged-Access` group with 4 baseline members.
- 12 test users matching the canonical fixture.
- `Access Lifecycle Agent` service principal.
- Script to trigger the incident by adding 12 members via Graph.
- Script to reset the group to the 4-member baseline.
- Script to verify baseline before demo.

Acceptance criteria:

- One command resets the tenant.
- One command triggers the incident.
- Audit logs show 12 member-add events by the agent service principal.
- Reset can run safely multiple times.

---

## Phase 2 — Recovery Persistence

Persist the entities needed for a real approval-gated execution trail.

Deliverables:

- `blast_radius_results`
- `recovery_plans`
- `approval_records`
- `action_instances`
- `validation_records`
- `audit_records`
- Storage helpers under `platform/packages/storage/src/`
- Row-level security on every tenant-scoped table.

Acceptance criteria:

- Every recovery entity is tenant-scoped.
- Recovery plans are versioned by `(tenant_id, incident_id, version)`.
- Approval records are immutable except invalidation metadata.
- Audit records are append-only and hash-chained.
- Rerunning plan generation does not create duplicate plan versions unless the plan changes.

---

## Phase 3 — Minimal Blast Radius Engine

Build only what CANONICAL-001 needs.

Deliverables:

- Read the incident root bundle and normalized member-add changes.
- Identify the impacted Entra group and 12 added members from platform data.
- Attach fixture-backed downstream objects for the prospect demo narrative.
- Store a `BlastRadiusResult`.
- Mark platform-derived vs fixture-derived fields clearly.

Acceptance criteria:

- Entra identity impact is platform-derived.
- Downstream blast radius is explicitly scenario-backed, not implied as live graph coverage.
- The console can read blast radius from storage instead of hard-coded page constants.

---

## Phase 4 — Recovery Plan Generator

Generate the canonical 8-step plan.

| Tier | Step | Execution mode |
|---|---|---|
| 0 | Remove 12 users from `Finance-Privileged-Access` | System, approval required |
| 1 | Validate MFA-bypass scope contracted | Read/manual validation |
| 1 | Validate data-restriction scope contracted | Read/manual validation |
| 2 | Revoke SharePoint access | Recommendation/manual |
| 2 | Restore Exchange delegation state | Recommendation/manual |
| 2 | Confirm Teams membership restored | Recommendation/manual |
| 3 | Verify SAP entitlement rollback | Manual, approval required |
| 4 | Mark trusted state restored | Operator confirmation |

Acceptance criteria:

- Step 1 cannot execute without approval.
- Steps have tiers, dependencies, rationale, and target state.
- The plan records current state at generation time.
- If group membership changes before approval or execution, the plan blocks.

---

## Phase 5 — Operator Approval

Create an explicit approval record for Step 1.

Deliverables:

- API endpoint to approve a recovery step.
- Approval record with operator identity, timestamp, target object, state hash, expiry, and plan version.
- Auth-gated console control.
- No approval path from public `/demo`.

Acceptance criteria:

- No approval means no write.
- Expired approval cannot execute.
- Approval is invalidated if pre-execution state changes.
- Approval appears in the evidence pack.

---

## Phase 6 — Execution Service

Implement the first real write path in `platform/packages/execution`: remove the 12 incident-added users from the Entra group.

Deliverables:

- Graph client for group member read/remove.
- Pre-read to confirm current group state.
- State-hash verification against approval.
- Sequential per-member `DELETE /groups/{groupId}/members/{memberId}/$ref`.
- Idempotent handling of already-absent members.
- Retry handling for 429, 5xx, and network timeout.
- Circuit breaker after repeated non-retriable failures.
- Action instance and sub-action updates.

Acceptance criteria:

- Only incident-added members are removed.
- The 4 baseline members are never removed.
- Re-running execution does not damage state.
- Partial failure is represented honestly.
- Missing permission fails closed before writes continue.

---

## Phase 7 — Validation And Trusted-State Outcome

Validate the executed Entra rollback and allow manual downstream confirmations.

Deliverables:

- Validation record for group membership restored to baseline.
- Manual validation controls for downstream steps.
- Trusted-state outcome evaluator.
- Incident status updates across recovery lifecycle.

Acceptance criteria:

- The system only says "trusted state restored" after required validations and operator confirmations.
- Partial recovery is allowed and clearly marked.
- Validation can be rerun.

---

## Phase 8 — Evidence Pack

Export a prospect-safe evidence pack from the actual run.

Contents:

- Incident metadata.
- Raw event references.
- Normalized changes.
- Correlated bundle.
- Blast radius result.
- Recovery plan.
- Approval record.
- Execution attempts.
- Validation records.
- Final trusted-state outcome.

Acceptance criteria:

- Evidence pack is JSON.
- It contains no business document content.
- It distinguishes system-executed, manual, and recommendation-only steps.
- It is suitable for demo, audit, and technical review.

---

## Phase 9 — Operator Console

Keep public `/demo` as the safe marketing walkthrough. Add the real execution path to the auth-gated console.

Deliverables:

- Incident list.
- Incident detail.
- Blast radius tab.
- Recovery plan tab.
- Approval control for Step 1.
- Execution progress.
- Validation and evidence tab.
- Demo reset/trigger controls hidden from public users.

Acceptance criteria:

- Prospect can watch a real controlled run.
- Public `/demo` remains noindex and unauthenticated-safe.
- No public write path exists.

---

## Phase 10 — Demo Readiness Gate

Before using this with prospects, require a repeatable green run.

Readiness script (`npm run live-demo-readiness -- --apply --runs 3 --poll-attempts 24 --api-url https://ca-api-dev.nicesand-85e14f44.centralus.azurecontainerapps.io`):

1. Reset tenant to baseline.
2. Trigger agent incident.
3. Poll Graph audit events.
4. Create incident.
5. Generate blast radius.
6. Generate recovery plan.
7. Approve Step 1.
8. Execute group rollback.
9. Validate group restored to 4 members.
10. Export evidence pack.
11. Reset tenant again.

Ship criteria:

- Three consecutive successful demo runs.
- One stale-plan run blocks execution when unexpected target-group membership
  appears before write execution.
- One idempotency run handles already-removed members.
- Logs and evidence pack reviewed.
- Demo script updated to match what is truly live.

Safety-check script:

```bash
npm run live-demo-safety-checks -- \
  --apply \
  --mode all \
  --poll-attempts 24 \
  --api-url https://ca-api-dev.nicesand-85e14f44.centralus.azurecontainerapps.io \
  --output ../artifacts/live-mvp/safety-checks-summary.json
```

---

## Commit Sequence

1. `feat(storage): add recovery execution persistence`
2. `feat(platform): add canonical demo tenant reset and trigger scripts`
3. `feat(core): generate canonical blast radius result`
4. `feat(core): generate recovery plan for canonical incident`
5. `feat(api): expose recovery plan and approval endpoints`
6. `feat(execution): execute approved Entra group rollback`
7. `feat(execution): validate post-recovery group state`
8. `feat(api): export recovery evidence pack`
9. `feat(console): add live recovery execution view`
10. `docs(demo): document live recovery MVP runbook`

---

## First Execution Slice

Start with storage. The execution service should not write to Microsoft Graph until the database can preserve:

- the immutable plan version that was approved,
- who approved it and when,
- each sub-action attempted,
- validation outcome,
- and the hash-chained audit trail.
