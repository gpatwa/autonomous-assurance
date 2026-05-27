import test from "node:test";
import assert from "node:assert/strict";
import type {
  ApprovalRecord,
  RecoveryPlan,
  RecoveryStep,
  StateSnapshot,
} from "@kavachiq/schema";
import {
  GraphWriteError,
  createGroupMemberRemovalActionInstance,
  executeGroupMemberRemovalAction,
  signApprovalPayload,
  type EntraGroupMember,
  type GroupMemberRemovalGraphClient,
} from "../index.js";

const SECRET = "test-secret";
const NOW = new Date("2026-05-27T00:00:00.000Z");

test("execution: creates action instance from signed approval and recovery step", () => {
  const { plan, step, approval } = fixture();
  const action = createGroupMemberRemovalActionInstance(plan, step, approval, {
    signingSecret: SECRET,
    now: NOW,
    newActionInstanceId: () => "act_test",
    newSubActionId: (() => {
      let i = 0;
      return () => `sub_${++i}`;
    })(),
  });

  assert.equal(action.instanceId, "act_test");
  assert.equal(action.templateId, "entra-group-member-remove");
  assert.equal(action.membersToRemove.length, 3);
  assert.equal(action.subActions.length, 3);
  assert.ok(action.subActions.every((sub) => sub.status === "pending"));
});

test("execution: removes present members and marks action completed", async () => {
  const { plan, step, approval } = fixture();
  const action = createGroupMemberRemovalActionInstance(plan, step, approval, {
    signingSecret: SECRET,
    now: NOW,
    newActionInstanceId: () => "act_test",
    newSubActionId: (() => {
      let i = 0;
      return () => `sub_${++i}`;
    })(),
  });
  const graph = new FakeGraph(["u1", "u2", "u3", "baseline"]);

  const result = await executeGroupMemberRemovalAction(action, graph, {
    now: () => NOW,
  });

  assert.equal(result.status, "completed");
  assert.equal(result.postExecutionState?.state.memberCount, 1);
  assert.deepEqual([...graph.members].sort(), ["baseline"]);
  assert.ok(result.subActions.every((sub) => sub.status === "removed"));
});

test("execution: treats already-absent members as idempotent success", async () => {
  const { plan, step, approval } = fixture();
  const action = createGroupMemberRemovalActionInstance(plan, step, approval, {
    signingSecret: SECRET,
    now: NOW,
  });
  const graph = new FakeGraph(["u1", "baseline"]);

  const result = await executeGroupMemberRemovalAction(action, graph, {
    now: () => NOW,
  });

  assert.equal(result.status, "completed");
  assert.equal(result.subActions[0]?.status, "removed");
  assert.equal(result.subActions[1]?.status, "already-absent");
  assert.equal(result.subActions[2]?.status, "already-absent");
});

test("execution: circuit-breaks after repeated non-retriable failures", async () => {
  const { plan, step, approval } = fixture();
  const action = createGroupMemberRemovalActionInstance(plan, step, approval, {
    signingSecret: SECRET,
    now: NOW,
  });
  const graph = new FakeGraph(["u1", "u2", "u3"]);
  graph.failStatus = 403;

  const result = await executeGroupMemberRemovalAction(action, graph, {
    now: () => NOW,
    circuitBreakerThreshold: 2,
  });

  assert.equal(result.status, "failed");
  assert.equal(result.circuitBroken, true);
  assert.equal(result.subActions[0]?.status, "failed");
  assert.equal(result.subActions[1]?.status, "failed");
  assert.equal(result.subActions[2]?.status, "not-attempted");
});

test("execution: rejects tampered approval signature", () => {
  const { plan, step, approval } = fixture();
  assert.throws(
    () =>
      createGroupMemberRemovalActionInstance(
        plan,
        step,
        { ...approval, signature: "0".repeat(64) },
        { signingSecret: SECRET, now: NOW },
      ),
    /signature-mismatch/,
  );
});

class FakeGraph implements GroupMemberRemovalGraphClient {
  readonly members: Set<string>;
  failStatus: number | null = null;

  constructor(memberIds: string[]) {
    this.members = new Set(memberIds);
  }

  async listGroupMembers(): Promise<EntraGroupMember[]> {
    return [...this.members].map((id) => ({
      id,
      userPrincipalName: `${id}@example.test`,
      displayName: id,
    }));
  }

  async removeGroupMember(_groupId: string, memberId: string) {
    if (this.failStatus) {
      throw new GraphWriteError("forced failure", { status: this.failStatus });
    }
    if (!this.members.has(memberId)) {
      throw new GraphWriteError("already absent", { status: 404 });
    }
    this.members.delete(memberId);
    return { status: 204, graphCorrelationId: `corr-${memberId}`, retryAfter: null };
  }
}

function fixture(): {
  plan: RecoveryPlan;
  step: RecoveryStep;
  approval: ApprovalRecord;
} {
  const currentStateAtPlan = snapshot({
    groupId: "group-1",
    groupDisplayName: "Finance-Privileged-Access",
    incidentAddedMemberIds: ["u1", "u2", "u3"],
    incidentAddedMemberUPNs: ["u1@example.test", "u2@example.test", "u3@example.test"],
  });
  const step: RecoveryStep = {
    stepId: "step-1",
    order: 1,
    tier: 0,
    actionType: "rollback",
    targetObjectId: "group-1",
    targetObjectType: "group",
    targetObjectName: "Finance-Privileged-Access",
    targetState: snapshot({ groupId: "group-1", incidentAddedMemberIds: [] }),
    currentStateAtPlan,
    dependsOn: [],
    approvalRequired: true,
    executionMode: "system",
    status: "ready",
    rationale: "test",
    dependencyChain: "test",
    confidence: { level: "high", reasons: ["test"], missingFields: [] },
    propagationDelay: null,
    approvalId: "apr-1",
    actionInstanceId: null,
    validationRecordId: null,
  };
  const plan: RecoveryPlan = {
    planId: "plan-1",
    tenantId: "tenant-1",
    incidentId: "incident-1",
    version: 1,
    status: "pending-approval",
    baselineVersionId: 1,
    steps: [step],
    trustedStateOutcome: null,
    generatedAt: NOW.toISOString(),
    supersededBy: null,
    schemaVersion: 1,
  };
  const unsigned: ApprovalRecord = {
    approvalId: "apr-1",
    tenantId: plan.tenantId,
    incidentId: plan.incidentId,
    planId: plan.planId,
    planVersion: plan.version,
    stepId: step.stepId,
    approvedBy: "operator@example.test",
    approvedAt: NOW.toISOString(),
    expiresAt: "2026-05-27T00:30:00.000Z",
    stateHashAtApproval: step.currentStateAtPlan.stateHash,
    targetObjectId: step.targetObjectId,
    targetState: step.targetState.state,
    signature: "",
    invalidated: false,
    invalidatedReason: null,
    schemaVersion: 1,
  };
  const approval = {
    ...unsigned,
    signature: signApprovalPayload({
      approvalId: unsigned.approvalId,
      tenantId: unsigned.tenantId,
      incidentId: unsigned.incidentId,
      planId: unsigned.planId,
      planVersion: unsigned.planVersion,
      stepId: unsigned.stepId,
      approvedBy: unsigned.approvedBy,
      approvedAt: unsigned.approvedAt,
      expiresAt: unsigned.expiresAt,
      stateHashAtApproval: unsigned.stateHashAtApproval,
      targetObjectId: unsigned.targetObjectId,
      targetState: unsigned.targetState,
    }, SECRET),
  };
  return { plan, step, approval };
}

function snapshot(state: Record<string, unknown>): StateSnapshot {
  return {
    state,
    capturedAt: NOW.toISOString(),
    captureSource: "kavachiq-system",
    confidence: "best-effort",
    stateHash: JSON.stringify(state),
  };
}
