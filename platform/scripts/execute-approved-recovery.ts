/**
 * Live recovery MVP execution bridge.
 *
 * Loads the latest approved system-executable recovery step, creates an
 * ActionInstance, executes Entra group member removal via SP-Execute, and
 * persists execution + validation records.
 *
 * Dry-run is the default. Pass --apply for real Microsoft Graph writes.
 */

import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  ExitCodes,
  createLogger,
  currentCorrelationId,
  isPlatformError,
  loadDotenvCascade,
  newCorrelationId,
  nowIso,
  parseDryRunFlag,
  requireEnv,
  rootLogger,
  withContext,
  type DryRunContext,
  type Logger,
} from "@kavachiq/platform";
import {
  GraphWriteError,
  createGroupMemberRemovalActionInstance,
  executeGroupMemberRemovalAction,
  type EntraGroupMember,
  type GroupMemberRemovalGraphClient,
} from "@kavachiq/execution";
import {
  appendAuditRecord,
  closePool,
  findApprovalRecord,
  findLatestRecoveryPlanForIncident,
  insertActionInstance,
  insertValidationRecord,
  updateActionInstance,
  updateRecoveryPlan,
  withTenantContext,
} from "@kavachiq/storage";
import type { ActionInstance, RecoveryPlan, RecoveryStep, ValidationRecord } from "@kavachiq/schema";
import { loadSpCredentials, tokenProviderFor } from "./lib/credentials.js";
import { GraphRequestError, GraphTransport } from "./lib/transport.js";

interface Args {
  tenantId: string;
  incidentId: string;
  stepId: string | null;
  output: string | null;
  dryRun: DryRunContext;
}

interface ExecuteApprovedRecoveryResult {
  runMetadata: {
    script: "execute-approved-recovery";
    tenantId: string;
    incidentId: string;
    stepId: string;
    correlationId: string;
    dryRun: boolean;
    dryRunReason?: string;
    startedAt: string;
    finishedAt: string;
    elapsedMs: number;
  };
  actionInstance: ActionInstance;
  validation: ValidationRecord | null;
  persisted: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    tenantId: "",
    incidentId: "",
    stepId: null,
    output: null,
    dryRun: parseDryRunFlag(argv),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(usage());
      process.exit(ExitCodes.OK);
    } else if (arg === "--tenant-id") {
      args.tenantId = requireValue(argv, ++i, "--tenant-id");
    } else if (arg === "--incident-id") {
      args.incidentId = requireValue(argv, ++i, "--incident-id");
    } else if (arg === "--step-id") {
      args.stepId = requireValue(argv, ++i, "--step-id");
    } else if (arg === "--output") {
      args.output = requireValue(argv, ++i, "--output");
    } else if (arg === "--apply" || arg === "--dry-run") {
      continue;
    } else {
      failUsage(`Unknown argument: ${arg}`);
    }
  }
  if (!args.tenantId) failUsage("--tenant-id is required");
  if (!args.incidentId) failUsage("--incident-id is required");
  if (argv.includes("--dry-run")) {
    args.dryRun.apply = false;
    args.dryRun.reason = "explicit --dry-run";
  }
  return args;
}

function usage(): string {
  return [
    "Usage: npm run execute-approved-recovery -- --tenant-id <uuid> --incident-id <id> [--step-id <id>] [--apply] [--output PATH]",
    "",
    "Dry-run is default. Pass --apply to persist records and execute Graph DELETE calls.",
    "",
    "Required env:",
    "  DATABASE_URL",
    "  RECOVERY_APPROVAL_SIGNING_SECRET",
    "  SP_EXECUTE_TENANT_ID, SP_EXECUTE_CLIENT_ID, and certificate or secret.",
    "",
  ].join("\n");
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value) failUsage(`${flag} requires a value`);
  return value;
}

function failUsage(message: string): never {
  process.stderr.write(`${message}\n\n${usage()}`);
  process.exit(ExitCodes.USAGE);
}

async function run(args: Args, log: Logger): Promise<ExecuteApprovedRecoveryResult> {
  const startedAt = nowIso();
  const startedMs = Date.now();
  const signingSecret = requireEnv("RECOVERY_APPROVAL_SIGNING_SECRET");

  const { plan, step } = await loadPlanAndStep(args);
  if (!step.approvalId) throw new Error(`step ${step.stepId} is not approved`);
  const approval = await withTenantContext(args.tenantId, (client) =>
    findApprovalRecord(client, step.approvalId!),
  );
  if (!approval) throw new Error(`approval not found: ${step.approvalId}`);

  const action = createGroupMemberRemovalActionInstance(plan, step, approval, {
    signingSecret,
  });

  if (!args.dryRun.apply) {
    return {
      runMetadata: metadata(args, step.stepId, startedAt, startedMs),
      actionInstance: action,
      validation: null,
      persisted: false,
    };
  }

  log.info("persisting action instance", { instanceId: action.instanceId, stepId: step.stepId });
  await withTenantContext(args.tenantId, (client) => insertActionInstance(client, action));

  const graph = new ExecuteGraphClient();
  const executed = await executeGroupMemberRemovalAction(action, graph);
  const validation = buildValidationRecord(executed, step);
  const updatedPlan = updatePlanWithExecution(plan, step.stepId, executed, validation);

  await withTenantContext(args.tenantId, async (client) => {
    await updateActionInstance(client, executed);
    await insertValidationRecord(client, validation);
    await updateRecoveryPlan(client, updatedPlan);
    await appendAuditRecord(client, {
      auditRecordId: `aud_${randomUUID()}`,
      tenantId: args.tenantId,
      eventType: executed.status === "completed" ? "action-executed" : "action-failed",
      actor: systemActor(),
      entityType: "action-instance",
      entityId: executed.instanceId,
      action: executed.status,
      detail: {
        incidentId: args.incidentId,
        stepId: step.stepId,
        planId: plan.planId,
        planVersion: plan.version,
        subActions: executed.subActions.length,
        circuitBroken: executed.circuitBroken,
      },
      timestamp: new Date().toISOString(),
      schemaVersion: 1,
    });
    await appendAuditRecord(client, {
      auditRecordId: `aud_${randomUUID()}`,
      tenantId: args.tenantId,
      eventType: "validation-completed",
      actor: systemActor(),
      entityType: "validation-record",
      entityId: validation.validationId,
      action: validation.result,
      detail: {
        incidentId: args.incidentId,
        stepId: step.stepId,
        actionInstanceId: executed.instanceId,
      },
      timestamp: new Date().toISOString(),
      schemaVersion: 1,
    });
  });

  return {
    runMetadata: metadata(args, step.stepId, startedAt, startedMs),
    actionInstance: executed,
    validation,
    persisted: true,
  };
}

async function loadPlanAndStep(args: Args): Promise<{ plan: RecoveryPlan; step: RecoveryStep }> {
  const plan = await withTenantContext(args.tenantId, (client) =>
    findLatestRecoveryPlanForIncident(client, args.incidentId),
  );
  if (!plan) throw new Error(`no recovery plan found for incident ${args.incidentId}`);
  const step = args.stepId
    ? plan.steps.find((s) => s.stepId === args.stepId)
    : plan.steps.find((s) => s.executionMode === "system" && s.approvalRequired);
  if (!step) throw new Error("no matching approved system recovery step found");
  return { plan, step };
}

class ExecuteGraphClient implements GroupMemberRemovalGraphClient {
  private readonly graph: GraphTransport;

  constructor() {
    const creds = loadSpCredentials("execute");
    this.graph = new GraphTransport({ tokenProvider: tokenProviderFor(creds) });
  }

  async listGroupMembers(groupId: string): Promise<EntraGroupMember[]> {
    const members: EntraGroupMember[] = [];
    const path =
      `/groups/${encodeURIComponent(groupId)}/members/microsoft.graph.user` +
      "?$select=id,userPrincipalName,displayName&$top=999";
    for await (const page of this.graph.getPaged<{
      id: string;
      userPrincipalName?: string;
      displayName?: string;
    }>(path)) {
      for (const member of page.value) {
        members.push({
          id: member.id,
          userPrincipalName: member.userPrincipalName ?? null,
          displayName: member.displayName ?? null,
        });
      }
    }
    return members;
  }

  async removeGroupMember(groupId: string, memberId: string) {
    try {
      const result = await this.graph.delete(
        `/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(memberId)}/$ref`,
      );
      return {
        status: result.status,
        graphCorrelationId: result.headers.requestId ?? null,
        retryAfter: result.headers.retryAfterSec ?? null,
      };
    } catch (err) {
      if (err instanceof GraphRequestError) {
        throw new GraphWriteError(err.message, {
          status: err.status,
          graphCorrelationId: err.headers.requestId ?? null,
          retryAfter: err.headers.retryAfterSec ?? null,
        });
      }
      throw err;
    }
  }
}

function buildValidationRecord(
  action: ActionInstance,
  step: RecoveryStep,
): ValidationRecord {
  const postMemberIds = readMemberIds(action.postExecutionState);
  const remainingTargetMembers = action.membersToRemove.filter((member) =>
    postMemberIds.includes(member.memberId),
  );
  return {
    validationId: `val_${randomUUID()}`,
    tenantId: action.tenantId,
    incidentId: action.incidentId,
    stepId: action.stepId,
    objectId: action.targetObjectId,
    targetState: action.expectedPostState,
    observedState: action.postExecutionState ?? step.currentStateAtPlan,
    result: remainingTargetMembers.length === 0 ? "match" : "mismatch",
    confidence: {
      level: "high",
      reasons: ["post-execution-graph-read"],
      missingFields: [],
    },
    validatedAt: new Date().toISOString(),
    revalidateAt: null,
    revalidationId: null,
    schemaVersion: 1,
  };
}

function updatePlanWithExecution(
  plan: RecoveryPlan,
  stepId: string,
  action: ActionInstance,
  validation: ValidationRecord,
): RecoveryPlan {
  return {
    ...plan,
    status: action.status === "completed" ? "executing" : "partial",
    steps: plan.steps.map((step) =>
      step.stepId === stepId
        ? {
            ...step,
            status: action.status === "completed" ? "completed" : "partially-completed",
            actionInstanceId: action.instanceId,
            validationRecordId: validation.validationId,
          }
        : step,
    ),
  };
}

function readMemberIds(snapshot: ActionInstance["postExecutionState"]): string[] {
  const ids = snapshot?.state.memberIds;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}

function metadata(args: Args, stepId: string, startedAt: string, startedMs: number) {
  return {
    script: "execute-approved-recovery" as const,
    tenantId: args.tenantId,
    incidentId: args.incidentId,
    stepId,
    correlationId: currentCorrelationId() ?? "unknown",
    dryRun: !args.dryRun.apply,
    ...(args.dryRun.reason ? { dryRunReason: args.dryRun.reason } : {}),
    startedAt,
    finishedAt: nowIso(),
    elapsedMs: Date.now() - startedMs,
  };
}

function systemActor() {
  return {
    type: "kavachiq" as const,
    id: "execute-approved-recovery",
    displayName: "KavachIQ Recovery Executor",
    agentIdentified: false,
    sessionId: null,
  };
}

function writeResult(result: ExecuteApprovedRecoveryResult, output: string | null): void {
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (!output) {
    process.stdout.write(json);
    return;
  }
  const abs = resolve(output);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, json);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  loadDotenvCascade();
  const correlationId = newCorrelationId();
  await withContext({ correlationId, tenantId: args.tenantId }, async () => {
    const log = createLogger({ bindings: { script: "execute-approved-recovery" } });
    const result = await run(args, log);
    writeResult(result, args.output);
  });
  await closePool();
}

main().catch(async (err: unknown) => {
  rootLogger.error("execute-approved-recovery failed", err);
  await closePool().catch(() => undefined);
  process.exitCode =
    isPlatformError(err) && err.code === "CONFIG_MISSING"
      ? ExitCodes.CONFIG
      : ExitCodes.UNEXPECTED;
});
