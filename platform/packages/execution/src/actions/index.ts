/**
 * Action execution (Graph API writes).
 *
 * v1 supports one write action only: remove specified members from an
 * Entra group. The Graph client is injected so this package stays free of
 * credential construction and can be tested without Microsoft access.
 */

import { createHash, randomUUID } from "node:crypto";
import type {
  ActionInstance,
  ApprovalRecord,
  ExecutionAttempt,
  RecoveryPlan,
  RecoveryStep,
  StateSnapshot,
  SubAction,
} from "@kavachiq/schema";
import { verifyApprovalForStep } from "../approval/index.js";

export const ENTRA_GROUP_MEMBER_REMOVE_TEMPLATE_ID = "entra-group-member-remove";

export interface EntraGroupMember {
  id: string;
  userPrincipalName: string | null;
  displayName: string | null;
}

export interface GraphWriteResult {
  status: number;
  graphCorrelationId: string | null;
  retryAfter: number | null;
}

export class GraphWriteError extends Error {
  readonly status: number | null;
  readonly graphCorrelationId: string | null;
  readonly retryAfter: number | null;

  constructor(message: string, opts: {
    status: number | null;
    graphCorrelationId?: string | null;
    retryAfter?: number | null;
  }) {
    super(message);
    this.name = "GraphWriteError";
    this.status = opts.status;
    this.graphCorrelationId = opts.graphCorrelationId ?? null;
    this.retryAfter = opts.retryAfter ?? null;
  }
}

export interface GroupMemberRemovalGraphClient {
  listGroupMembers(groupId: string): Promise<EntraGroupMember[]>;
  removeGroupMember(groupId: string, memberId: string): Promise<GraphWriteResult>;
}

export interface CreateActionInstanceOptions {
  signingSecret: string;
  now?: Date;
  newActionInstanceId?: () => string;
  newSubActionId?: () => string;
}

export interface ExecuteActionOptions {
  now?: () => Date;
  maxRetries?: number;
  circuitBreakerThreshold?: number;
  sleep?: (ms: number) => Promise<void>;
}

export function createGroupMemberRemovalActionInstance(
  plan: RecoveryPlan,
  step: RecoveryStep,
  approval: ApprovalRecord,
  opts: CreateActionInstanceOptions,
): ActionInstance {
  if (step.executionMode !== "system" || step.actionType !== "rollback") {
    throw new Error("only system rollback steps can create group member removal actions");
  }
  const verification = verifyApprovalForStep(approval, step, {
    signingSecret: opts.signingSecret,
    now: opts.now,
  });
  if (!verification.ok) {
    throw new Error(`approval verification failed: ${verification.reason}`);
  }

  const memberIds = readStringArray(
    step.currentStateAtPlan.state.incidentAddedMemberIds,
    "incidentAddedMemberIds",
  );
  const memberUPNs = readStringArray(
    step.currentStateAtPlan.state.incidentAddedMemberUPNs,
    "incidentAddedMemberUPNs",
  );
  if (memberIds.length === 0) throw new Error("step has no members to remove");
  const nowIso = (opts.now ?? new Date()).toISOString();
  const instanceId = opts.newActionInstanceId?.() ?? `act_${randomUUID()}`;
  const membersToRemove = memberIds.map((memberId, idx) => ({
    memberId,
    memberUPN: memberUPNs[idx] ?? memberId,
    memberDisplayName: memberUPNs[idx] ?? memberId,
    removalReason: "added-by-incident-triggering-agent-action",
  }));
  const subActions: SubAction[] = membersToRemove.map((member) => ({
    subActionId: opts.newSubActionId?.() ?? `sub_${randomUUID()}`,
    actionInstanceId: instanceId,
    memberId: member.memberId,
    memberUPN: member.memberUPN,
    status: "pending",
    preReadResult: "read-failed",
    attempts: [],
    postReadResult: null,
    completedAt: null,
  }));

  return {
    instanceId,
    tenantId: plan.tenantId,
    templateId: ENTRA_GROUP_MEMBER_REMOVE_TEMPLATE_ID,
    incidentId: plan.incidentId,
    planId: plan.planId,
    planVersion: plan.version,
    stepId: step.stepId,
    approvalId: approval.approvalId,
    targetObjectId: step.targetObjectId,
    targetObjectName: step.targetObjectName,
    membersToRemove,
    expectedPostState: step.targetState,
    status: "created",
    subActions,
    preExecutionState: null,
    postExecutionState: null,
    circuitBroken: false,
    validationHandoffId: null,
    createdAt: nowIso,
    startedAt: null,
    completedAt: null,
    schemaVersion: 1,
  };
}

export async function executeGroupMemberRemovalAction(
  instance: ActionInstance,
  graph: GroupMemberRemovalGraphClient,
  opts: ExecuteActionOptions = {},
): Promise<ActionInstance> {
  if (instance.templateId !== ENTRA_GROUP_MEMBER_REMOVE_TEMPLATE_ID) {
    throw new Error(`unsupported action template: ${instance.templateId}`);
  }
  if (instance.status === "completed") return instance;

  const now = opts.now ?? (() => new Date());
  const maxRetries = opts.maxRetries ?? 2;
  const circuitBreakerThreshold = opts.circuitBreakerThreshold ?? 3;
  const sleep = opts.sleep ?? (async () => {});

  let next: ActionInstance = {
    ...instance,
    status: "validating",
    startedAt: instance.startedAt ?? now().toISOString(),
  };

  const preMembers = await graph.listGroupMembers(instance.targetObjectId);
  next = {
    ...next,
    status: "executing",
    preExecutionState: groupMembershipSnapshot(preMembers, now().toISOString()),
  };

  let consecutiveFailures = 0;
  const subActions: SubAction[] = [];
  for (const sub of next.subActions) {
    if (next.circuitBroken) {
      subActions.push({ ...sub, status: "not-attempted" });
      continue;
    }
    if (sub.status === "removed" || sub.status === "already-absent") {
      subActions.push(sub);
      continue;
    }

    const currentMembers = await graph.listGroupMembers(instance.targetObjectId);
    const currentlyPresent = currentMembers.some((member) => member.id === sub.memberId);
    if (!currentlyPresent) {
      subActions.push({
        ...sub,
        status: "already-absent",
        preReadResult: "absent",
        postReadResult: "absent",
        completedAt: now().toISOString(),
      });
      consecutiveFailures = 0;
      continue;
    }

    const executed = await executeOneMemberRemoval({
      graph,
      groupId: instance.targetObjectId,
      sub,
      maxRetries,
      sleep,
      now,
    });
    subActions.push(executed);

    if (executed.status === "failed") {
      consecutiveFailures += 1;
      if (consecutiveFailures >= circuitBreakerThreshold) {
        next = { ...next, circuitBroken: true };
      }
    } else {
      consecutiveFailures = 0;
    }
  }

  const postMembers = await graph.listGroupMembers(instance.targetObjectId);
  const failed = subActions.filter((sub) => sub.status === "failed").length;
  const notAttempted = subActions.filter((sub) => sub.status === "not-attempted").length;
  const successful = subActions.filter(
    (sub) => sub.status === "removed" || sub.status === "already-absent",
  ).length;
  const status =
    failed === 0 && notAttempted === 0
      ? "completed"
      : successful > 0
        ? "partially-completed"
        : "failed";

  return {
    ...next,
    status,
    subActions,
    postExecutionState: groupMembershipSnapshot(postMembers, now().toISOString()),
    completedAt: now().toISOString(),
  };
}

async function executeOneMemberRemoval(args: {
  graph: GroupMemberRemovalGraphClient;
  groupId: string;
  sub: SubAction;
  maxRetries: number;
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
}): Promise<SubAction> {
  const attempts: ExecutionAttempt[] = [];
  for (let attemptNumber = 1; attemptNumber <= args.maxRetries + 1; attemptNumber += 1) {
    const startedAt = args.now().toISOString();
    try {
      const result = await args.graph.removeGroupMember(args.groupId, args.sub.memberId);
      attempts.push({
        attemptNumber,
        startedAt,
        completedAt: args.now().toISOString(),
        httpStatus: result.status,
        graphCorrelationId: result.graphCorrelationId,
        outcome: result.status === 404 ? "already-absent" : "success",
        retryAfter: result.retryAfter,
        errorDetail: null,
      });
      return {
        ...args.sub,
        status: result.status === 404 ? "already-absent" : "removed",
        preReadResult: "present",
        attempts,
        postReadResult: "absent",
        completedAt: args.now().toISOString(),
      };
    } catch (err) {
      const classified = classifyGraphWriteError(err);
      attempts.push({
        attemptNumber,
        startedAt,
        completedAt: args.now().toISOString(),
        httpStatus: classified.httpStatus,
        graphCorrelationId: classified.graphCorrelationId,
        outcome: classified.outcome,
        retryAfter: classified.retryAfter,
        errorDetail: classified.errorDetail,
      });
      if (classified.outcome === "already-absent") {
        return {
          ...args.sub,
          status: "already-absent",
          preReadResult: "present",
          attempts,
          postReadResult: "absent",
          completedAt: args.now().toISOString(),
        };
      }
      if (!classified.retriable || attemptNumber > args.maxRetries) {
        return {
          ...args.sub,
          status: "failed",
          preReadResult: "present",
          attempts,
          postReadResult: null,
          completedAt: args.now().toISOString(),
        };
      }
      await args.sleep(classified.retryAfter ? classified.retryAfter * 1000 : 0);
    }
  }
  return {
    ...args.sub,
    status: "failed",
    preReadResult: "present",
    attempts,
    postReadResult: null,
    completedAt: args.now().toISOString(),
  };
}

function classifyGraphWriteError(err: unknown): {
  httpStatus: number | null;
  graphCorrelationId: string | null;
  outcome: ExecutionAttempt["outcome"];
  retryAfter: number | null;
  errorDetail: string | null;
  retriable: boolean;
} {
  if (err instanceof GraphWriteError) {
    if (err.status === 404) {
      return {
        httpStatus: 404,
        graphCorrelationId: err.graphCorrelationId,
        outcome: "already-absent",
        retryAfter: err.retryAfter,
        errorDetail: err.message,
        retriable: false,
      };
    }
    if (err.status === 429) {
      return {
        httpStatus: 429,
        graphCorrelationId: err.graphCorrelationId,
        outcome: "rate-limited",
        retryAfter: err.retryAfter,
        errorDetail: err.message,
        retriable: true,
      };
    }
    if (err.status && err.status >= 500) {
      return {
        httpStatus: err.status,
        graphCorrelationId: err.graphCorrelationId,
        outcome: "server-error",
        retryAfter: err.retryAfter,
        errorDetail: err.message,
        retriable: true,
      };
    }
    return {
      httpStatus: err.status,
      graphCorrelationId: err.graphCorrelationId,
      outcome: err.status === 403 ? "permission-denied" : "bad-request",
      retryAfter: err.retryAfter,
      errorDetail: err.message,
      retriable: false,
    };
  }
  return {
    httpStatus: null,
    graphCorrelationId: null,
    outcome: "timeout",
    retryAfter: null,
    errorDetail: err instanceof Error ? err.message : String(err),
    retriable: true,
  };
}

function groupMembershipSnapshot(members: EntraGroupMember[], capturedAt: string): StateSnapshot {
  const ids = members.map((member) => member.id).sort();
  return {
    state: {
      memberCount: ids.length,
      memberIds: ids,
    },
    capturedAt,
    captureSource: "graph-api-read",
    confidence: "authoritative",
    stateHash: createHash("sha256").update(ids.join("|")).digest("hex"),
  };
}

function readStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`expected ${field} to be a string array`);
  }
  return value;
}
