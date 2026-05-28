/**
 * Prospect-demo safety checks for the live recovery path.
 *
 * Runs focused live scenarios against the canonical Microsoft 365 demo tenant:
 *   - stale-plan: unexpected membership appears after approval; execution must
 *     fail closed before persisting an ActionInstance.
 *   - idempotency: a subset of planned removals is already absent before
 *     execution; recovery must complete and record already-absent sub-actions.
 *
 * Pass --apply for real Graph writes. This is a demo-tenant-only script.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { dirname, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { pollTenantBatch } from "@kavachiq/orchestration";
import { closePool } from "@kavachiq/storage";
import {
  ExitCodes,
  createLogger,
  loadDotenvCascade,
  parseDryRunFlag,
  requireEnv,
} from "@kavachiq/platform";
import { loadSpCredentials, tokenProviderFor } from "./lib/credentials.js";
import {
  GraphRequestError,
  GraphTransport,
  type DeleteResult,
  type PostResult,
} from "./lib/transport.js";

type Mode = "all" | "stale-plan" | "idempotency";

interface Args {
  apply: boolean;
  mode: Mode;
  output: string;
  apiUrl: string | null;
  pollAttempts: number;
  pollDelayMs: number;
}

interface PreparedIncident {
  scenario: string;
  startedAt: string;
  incidentId: string;
  plan: ApiRecoveryPlan;
  approvalId: string;
  step: ApiRecoveryStep;
}

interface ApiRecoveryPlan {
  planId: string;
  steps: ApiRecoveryStep[];
}

interface ApiRecoveryStep {
  stepId: string;
  executionMode: string;
  approvalRequired: boolean;
  targetObjectId: string;
  targetObjectName: string;
  targetState: {
    state: {
      expectedMemberCountAfterRollback?: number;
    };
  };
  currentStateAtPlan: {
    state: {
      incidentAddedMemberIds?: string[];
      incidentAddedMemberUPNs?: string[];
    };
  };
}

interface SafetyResult {
  script: "live-demo-safety-checks";
  mode: Mode;
  startedAt: string;
  finishedAt: string;
  dryRun: boolean;
  stalePlan?: {
    incidentId: string;
    planId: string;
    approvalId: string;
    probeMemberUPN: string;
    blocked: boolean;
    exitCode: number;
    stalePlanMessageSeen: boolean;
    persistedActionInstances: number;
  };
  idempotency?: {
    incidentId: string;
    planId: string;
    approvalId: string;
    preRemovedMembers: string[];
    completed: boolean;
    validationResult: string | null;
    alreadyAbsentSubActions: number;
    removedSubActions: number;
    postMemberCount: number | null;
  };
}

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const API_RETRY_ATTEMPTS = 4;
const API_RETRY_DELAY_MS = 2_000;
const INCIDENT_DETECTED_LOOKBACK_MS = 2 * 60 * 1000;
const PROBE_USER_SEQ = 17;

function parseArgs(argv: string[]): Args {
  const dryRun = parseDryRunFlag(argv);
  const args: Args = {
    apply: dryRun.apply,
    mode: "all",
    output: "../artifacts/live-mvp/safety-checks-summary.json",
    apiUrl: null,
    pollAttempts: 24,
    pollDelayMs: 15_000,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(usage());
      process.exit(ExitCodes.OK);
    } else if (arg === "--mode") {
      args.mode = parseMode(requireValue(argv, ++i, "--mode"));
    } else if (arg === "--output") {
      args.output = requireValue(argv, ++i, "--output");
    } else if (arg === "--api-url") {
      args.apiUrl = requireValue(argv, ++i, "--api-url");
    } else if (arg === "--poll-attempts") {
      args.pollAttempts = readPositiveInt(argv[++i], "--poll-attempts");
    } else if (arg === "--poll-delay-ms") {
      args.pollDelayMs = readPositiveInt(argv[++i], "--poll-delay-ms");
    } else if (arg === "--apply" || arg === "--dry-run") {
      continue;
    } else {
      failUsage(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function usage(): string {
  return [
    "Usage: npm run live-demo-safety-checks -- --apply [--mode all|stale-plan|idempotency] [--api-url URL] [--output PATH]",
    "",
    "Required env for --apply:",
    "  AUTH_TID_TO_TENANT, KAVACHIQ_API_KEY",
    "  KAVACHIQ_API_URL or --api-url",
    "  DATABASE_URL, SERVICE_BUS_CONNECTION_STRING, STORAGE_CONNECTION_STRING",
    "  RECOVERY_APPROVAL_SIGNING_SECRET",
    "  SP_READ_*, SP_EXECUTE_*, SP_SETUP_*",
    "",
  ].join("\n");
}

async function main(): Promise<void> {
  loadDotenvCascade(resolve(".."));
  loadDotenvCascade();

  const args = parseArgs(process.argv.slice(2));
  const log = createLogger({ bindings: { script: "live-demo-safety-checks" } });
  const startedAt = new Date().toISOString();

  if (!args.apply) {
    throw new Error("live-demo-safety-checks requires --apply because it validates live Graph writes");
  }

  process.env.KAVACHIQ_APP_CLIENT_ID ??= process.env.SP_READ_CLIENT_ID;
  process.env.KAVACHIQ_APP_CLIENT_SECRET ??= process.env.SP_READ_CLIENT_SECRET;

  const tenantId = requireEnv("AUTH_TID_TO_TENANT").split(":").at(-1)!;
  const apiUrl = (args.apiUrl ?? requireEnv("KAVACHIQ_API_URL")).replace(/\/$/, "");
  const apiKey = requireEnv("KAVACHIQ_API_KEY");
  requireEnv("DATABASE_URL");
  requireEnv("SERVICE_BUS_CONNECTION_STRING");
  requireEnv("STORAGE_CONNECTION_STRING");
  requireEnv("RECOVERY_APPROVAL_SIGNING_SECRET");

  const graph = new DemoGraph();
  await cleanupProbeMember(graph);

  const result: SafetyResult = {
    script: "live-demo-safety-checks",
    mode: args.mode,
    startedAt,
    finishedAt: startedAt,
    dryRun: false,
  };

  if (args.mode === "all" || args.mode === "stale-plan") {
    log.info("stale-plan check starting");
    result.stalePlan = await runStalePlanCheck({ args, apiUrl, apiKey, tenantId, graph });
    log.info("stale-plan check completed", { incidentId: result.stalePlan.incidentId });
  }

  if (args.mode === "all" || args.mode === "idempotency") {
    log.info("idempotency check starting");
    result.idempotency = await runIdempotencyCheck({ args, apiUrl, apiKey, tenantId, graph });
    log.info("idempotency check completed", { incidentId: result.idempotency.incidentId });
  }

  result.finishedAt = new Date().toISOString();
  writeJson(args.output, result);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function runStalePlanCheck(input: {
  args: Args;
  apiUrl: string;
  apiKey: string;
  tenantId: string;
  graph: DemoGraph;
}): Promise<NonNullable<SafetyResult["stalePlan"]>> {
  const prefix = "../artifacts/live-mvp/safety-stale-plan";
  const prepared = await prepareApprovedIncident({
    scenario: "stale-plan",
    prefix,
    ...input,
  });

  const probe = await input.graph.findCanonicalUser(PROBE_USER_SEQ);
  try {
    await input.graph.addGroupMember(prepared.step.targetObjectId, probe.id);
    const expectedAfterRollback = readNumber(
      prepared.step.targetState.state.expectedMemberCountAfterRollback,
    );
    if (expectedAfterRollback === null) {
      throw new Error("stale-plan check could not read expectedMemberCountAfterRollback");
    }
    await waitForMemberCount({
      graph: input.graph,
      groupId: prepared.step.targetObjectId,
      minCount: expectedAfterRollback + 13,
      label: "unexpected stale-plan member",
    });

    const executionPath = `${prefix}-execution-blocked.json`;
    removeFileIfExists(executionPath);
    const exec = await runCommandCapture("npm", [
      "run",
      "execute-approved-recovery",
      "--",
      "--tenant-id",
      input.tenantId,
      "--incident-id",
      prepared.incidentId,
      "--apply",
      "--output",
      executionPath,
    ], { allowFailure: true });
    writeJson(`${prefix}-execution-result.json`, exec);

    const stalePlanMessageSeen = /stale-plan/i.test(`${exec.stdout}\n${exec.stderr}`);
    if (exec.exitCode === 0) {
      throw new Error("stale-plan check expected execute-approved-recovery to fail closed");
    }
    if (!stalePlanMessageSeen) {
      throw new Error("stale-plan check failed without emitting stale-plan");
    }

    const evidence = await apiRequest({
      apiUrl: input.apiUrl,
      apiKey: input.apiKey,
      path: `/tenants/${input.tenantId}/incidents/${prepared.incidentId}/evidence-pack`,
      method: "GET",
    });
    writeJson(`${prefix}-evidence-pack-after-block.json`, evidence);
    const persistedActionInstances = evidence.data.actionInstances.length;
    if (persistedActionInstances !== 0) {
      throw new Error(`stale-plan check persisted ${persistedActionInstances} action instances`);
    }

    return {
      incidentId: prepared.incidentId,
      planId: prepared.plan.planId,
      approvalId: prepared.approvalId,
      probeMemberUPN: probe.upn,
      blocked: true,
      exitCode: exec.exitCode,
      stalePlanMessageSeen,
      persistedActionInstances,
    };
  } finally {
    await input.graph.removeGroupMember(prepared.step.targetObjectId, probe.id).catch(() => undefined);
    await resetAndWaitBaseline(prefix);
  }
}

async function runIdempotencyCheck(input: {
  args: Args;
  apiUrl: string;
  apiKey: string;
  tenantId: string;
  graph: DemoGraph;
}): Promise<NonNullable<SafetyResult["idempotency"]>> {
  const prefix = "../artifacts/live-mvp/safety-idempotency";
  const prepared = await prepareApprovedIncident({
    scenario: "idempotency",
    prefix,
    ...input,
  });

  const state = prepared.step.currentStateAtPlan.state;
  const ids = state.incidentAddedMemberIds ?? [];
  const upns = state.incidentAddedMemberUPNs ?? [];
  const preRemoved = ids.slice(0, 3).map((id, index) => ({
    id,
    upn: upns[index] ?? id,
  }));
  if (preRemoved.length !== 3) {
    throw new Error(`idempotency check expected at least 3 planned members, got ${preRemoved.length}`);
  }

  const preRemovalAttempts = [];
  for (const member of preRemoved) {
    preRemovalAttempts.push(await input.graph.removeGroupMember(prepared.step.targetObjectId, member.id));
  }
  writeJson(`${prefix}-pre-removed-members.json`, { preRemoved, preRemovalAttempts });
  await waitForMembersAbsent({
    graph: input.graph,
    groupId: prepared.step.targetObjectId,
    memberIds: preRemoved.map((member) => member.id),
  });

  await runCommand("npm", [
    "run",
    "execute-approved-recovery",
    "--",
    "--tenant-id",
    input.tenantId,
    "--incident-id",
    prepared.incidentId,
    "--apply",
    "--output",
    `${prefix}-execution.json`,
  ]);

  await waitForTenantReadiness({
    outputPrefix: `${prefix}-verify-after-recovery`,
    desiredState: "baseline",
    attempts: 24,
    delayMs: 5_000,
    stableObservations: 2,
  });

  const execution = readJsonFile<{ actionInstance: {
    status: string;
    subActions: Array<{ status: string }>;
    postExecutionState: { state: { memberCount?: number } } | null;
  }; validation: { result: string } | null }>(`${prefix}-execution.json`);
  const alreadyAbsentSubActions = execution.actionInstance.subActions
    .filter((sub) => sub.status === "already-absent").length;
  const removedSubActions = execution.actionInstance.subActions
    .filter((sub) => sub.status === "removed").length;

  if (execution.actionInstance.status !== "completed") {
    throw new Error(`idempotency check expected completed action, got ${execution.actionInstance.status}`);
  }
  if (alreadyAbsentSubActions < preRemoved.length) {
    throw new Error(
      `idempotency check expected at least ${preRemoved.length} already-absent sub-actions, got ${alreadyAbsentSubActions}`,
    );
  }
  if (execution.validation?.result !== "match") {
    throw new Error(`idempotency check expected validation match, got ${execution.validation?.result ?? "none"}`);
  }

  const evidence = await apiRequest({
    apiUrl: input.apiUrl,
    apiKey: input.apiKey,
    path: `/tenants/${input.tenantId}/incidents/${prepared.incidentId}/evidence-pack`,
    method: "GET",
  });
  writeJson(`${prefix}-evidence-pack.json`, evidence);

  return {
    incidentId: prepared.incidentId,
    planId: prepared.plan.planId,
    approvalId: prepared.approvalId,
    preRemovedMembers: preRemoved.map((member) => member.upn),
    completed: true,
    validationResult: execution.validation?.result ?? null,
    alreadyAbsentSubActions,
    removedSubActions,
    postMemberCount: execution.actionInstance.postExecutionState?.state.memberCount ?? null,
  };
}

async function prepareApprovedIncident(input: {
  scenario: string;
  prefix: string;
  args: Args;
  apiUrl: string;
  apiKey: string;
  tenantId: string;
}): Promise<PreparedIncident> {
  const startedAt = new Date().toISOString();

  await resetAndWaitBaseline(input.prefix);
  await triggerCanonicalIncident({
    outputPrefix: `${input.prefix}-trigger`,
    baselineOutputPrefix: `${input.prefix}-baseline-before-trigger`,
  });
  await waitForTenantReadiness({
    outputPrefix: `${input.prefix}-triggered-ready`,
    desiredState: "triggered",
    attempts: 24,
    delayMs: 5_000,
    stableObservations: 2,
  });

  const incidentId = await pollUntilIncident({
    tenantId: input.tenantId,
    apiUrl: input.apiUrl,
    apiKey: input.apiKey,
    observedAfter: startedAt,
    attempts: input.args.pollAttempts,
    delayMs: input.args.pollDelayMs,
    outputPrefix: input.prefix,
  });

  const blast = await apiRequest({
    apiUrl: input.apiUrl,
    apiKey: input.apiKey,
    path: `/tenants/${input.tenantId}/incidents/${incidentId}/blast-radius`,
    method: "POST",
  });
  writeJson(`${input.prefix}-blast-radius.json`, blast);

  const plan = await apiRequest({
    apiUrl: input.apiUrl,
    apiKey: input.apiKey,
    path: `/tenants/${input.tenantId}/incidents/${incidentId}/plans`,
    method: "POST",
  }) as { data: ApiRecoveryPlan };
  writeJson(`${input.prefix}-recovery-plan.json`, plan);

  const step = plan.data.steps.find((candidate) =>
    candidate.executionMode === "system" && candidate.approvalRequired,
  );
  if (!step) throw new Error(`${input.scenario}: no approval-required system recovery step`);

  const approval = await apiRequest({
    apiUrl: input.apiUrl,
    apiKey: input.apiKey,
    path: `/tenants/${input.tenantId}/incidents/${incidentId}/plans/latest/steps/${step.stepId}/approve`,
    method: "POST",
    body: { approvedBy: "demo-operator@kavachiq.com", expiresInMinutes: 60 },
  });
  writeJson(`${input.prefix}-approval.json`, approval);

  return {
    scenario: input.scenario,
    startedAt,
    incidentId,
    plan: plan.data,
    approvalId: approval.data.approval.approvalId,
    step,
  };
}

async function resetAndWaitBaseline(prefix: string): Promise<void> {
  const resetPath = `${prefix}-reset.json`;
  removeFileIfExists(resetPath);
  await runCommand("npm", [
    "run",
    "canonical-demo-tenant",
    "--",
    "--mode",
    "reset",
    "--apply",
    "--output",
    resetPath,
  ], { allowFailure: true });

  await waitForTenantReadiness({
    outputPrefix: `${prefix}-baseline-ready`,
    desiredState: "baseline",
    attempts: 24,
    delayMs: 5_000,
    stableObservations: 2,
  });
}

async function waitForTenantReadiness(input: {
  outputPrefix: string;
  desiredState: "baseline" | "triggered";
  attempts: number;
  delayMs: number;
  stableObservations: number;
}): Promise<void> {
  let consecutiveReady = 0;
  for (let attempt = 1; attempt <= input.attempts; attempt += 1) {
    const output = `${input.outputPrefix}-${attempt}.json`;
    removeFileIfExists(output);
    await runCommand("npm", [
      "run",
      "canonical-demo-tenant",
      "--",
      "--mode",
      "verify",
      "--output",
      output,
    ], { allowFailure: true });
    const result = readJsonFile<{
      after?: { readiness?: { baselineReady?: boolean; triggeredReady?: boolean } };
    }>(output);
    const readiness = result.after?.readiness;
    const ready = input.desiredState === "baseline"
      ? readiness?.baselineReady === true
      : readiness?.triggeredReady === true;
    consecutiveReady = ready ? consecutiveReady + 1 : 0;
    if (consecutiveReady >= input.stableObservations) return;
    await sleep(input.delayMs);
  }
  throw new Error(`canonical tenant did not reach ${input.desiredState} readiness`);
}

async function triggerCanonicalIncident(input: {
  outputPrefix: string;
  baselineOutputPrefix: string;
}): Promise<void> {
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const output = attempt === 1
      ? `${input.outputPrefix}.json`
      : `${input.outputPrefix}-${attempt}.json`;
    removeFileIfExists(output);
    await runCommand("npm", [
      "run",
      "canonical-demo-tenant",
      "--",
      "--mode",
      "trigger",
      "--apply",
      "--output",
      output,
    ], { allowFailure: true });

    if (existsSync(resolve(output))) {
      try {
        assertTriggerWritesSucceeded(output);
        return;
      } catch (err) {
        if (attempt === attempts) throw err;
      }
    }

    if (attempt < attempts) {
      await waitForTenantReadiness({
        outputPrefix: `${input.baselineOutputPrefix}-${attempt}`,
        desiredState: "baseline",
        attempts: 12,
        delayMs: 5_000,
        stableObservations: 2,
      });
    }
  }
  throw new Error("trigger did not write a fresh artifact");
}

function assertTriggerWritesSucceeded(path: string): void {
  const result = readJsonFile<{
    operations?: Array<{ kind?: string; status?: string }>;
  }>(path);
  const triggerOps = result.operations?.filter((op) => op.kind === "trigger-add-member") ?? [];
  const successful = triggerOps.filter((op) => op.status === "success").length;
  if (successful !== 12) {
    throw new Error(`trigger wrote ${successful}/12 incident members`);
  }
}

async function pollUntilIncident(input: {
  tenantId: string;
  apiUrl: string;
  apiKey: string;
  observedAfter: string;
  attempts: number;
  delayMs: number;
  outputPrefix: string;
}): Promise<string> {
  for (let attempt = 1; attempt <= input.attempts; attempt += 1) {
    const result = await pollTenantBatch({
      tenantId: input.tenantId,
      serviceBusConnectionString: requireEnv("SERVICE_BUS_CONNECTION_STRING"),
      initialLookbackHours: 24 * 30,
    });
    writeJson(`${input.outputPrefix}-poll-${attempt}.json`, result);

    const incident = await findLatestCanonicalIncident(input);
    if (incident) return incident.incidentId;
    await sleep(input.delayMs);
  }
  throw new Error(`no 12-change incident appeared after ${input.attempts} poll attempts`);
}

async function findLatestCanonicalIncident(input: {
  tenantId: string;
  apiUrl: string;
  apiKey: string;
  observedAfter: string;
}): Promise<{ incidentId: string } | null> {
  const detectedAfter = new Date(
    Date.parse(input.observedAfter) - INCIDENT_DETECTED_LOOKBACK_MS,
  ).toISOString();
  const incidents = await apiRequest({
    apiUrl: input.apiUrl,
    apiKey: input.apiKey,
    path: `/tenants/${input.tenantId}/incidents?limit=10`,
    method: "GET",
  });

  return (
    incidents.data.find((incident: {
      incidentId: string;
      detectedAt: string;
      rootChangeIds?: string[];
    }) =>
      incident.detectedAt >= detectedAfter &&
      Array.isArray(incident.rootChangeIds) &&
      incident.rootChangeIds.length === 12,
    ) ?? null
  );
}

class DemoGraph {
  private readonly readGraph: GraphTransport;
  private readonly executeGraph: GraphTransport;

  constructor() {
    const readCreds = loadSpCredentials("read");
    const executeCreds = loadSpCredentials("execute");
    this.readGraph = new GraphTransport({ tokenProvider: tokenProviderFor(readCreds) });
    this.executeGraph = new GraphTransport({ tokenProvider: tokenProviderFor(executeCreds) });
  }

  async findCanonicalUser(seq: number): Promise<{ id: string; upn: string }> {
    const upn = `kq-test-${String(seq).padStart(2, "0")}@patwainc.onmicrosoft.com`;
    const filter = encodeURIComponent(`userPrincipalName eq '${upn}'`);
    const res = await this.readGraph.get<{ value: Array<{ id: string; userPrincipalName: string }> }>(
      `/users?$filter=${filter}&$select=id,userPrincipalName&$top=1`,
    );
    const user = res.value[0];
    if (!user) throw new Error(`missing probe user ${upn}`);
    return { id: user.id, upn: user.userPrincipalName };
  }

  async addGroupMember(groupId: string, userId: string): Promise<{ status: number }> {
    try {
      const res: PostResult = await this.executeGraph.post(
        `/groups/${encodeURIComponent(groupId)}/members/$ref`,
        { "@odata.id": `https://graph.microsoft.com/v1.0/users/${userId}` },
      );
      return { status: res.status };
    } catch (err) {
      if (err instanceof GraphRequestError && (err.status === 400 || err.status === 409)) {
        return { status: err.status };
      }
      throw err;
    }
  }

  async removeGroupMember(groupId: string, userId: string): Promise<{ status: number }> {
    try {
      const res: DeleteResult = await this.executeGraph.delete(
        `/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}/$ref`,
      );
      return { status: res.status };
    } catch (err) {
      if (err instanceof GraphRequestError && err.status === 404) {
        return { status: err.status };
      }
      throw err;
    }
  }

  async listGroupMemberIds(groupId: string): Promise<string[]> {
    const ids: string[] = [];
    const path =
      `/groups/${encodeURIComponent(groupId)}/members/microsoft.graph.user` +
      "?$select=id&$top=999";
    for await (const page of this.executeGraph.getPaged<{ id: string }>(path)) {
      for (const member of page.value) {
        ids.push(member.id);
      }
    }
    return ids;
  }
}

async function cleanupProbeMember(graph: DemoGraph): Promise<void> {
  const probe = await graph.findCanonicalUser(PROBE_USER_SEQ);
  const groupId = "45a4b187-c7c6-422a-b82b-48e199f63bb3";
  await graph.removeGroupMember(groupId, probe.id).catch(() => undefined);
}

async function waitForMemberCount(input: {
  graph: DemoGraph;
  groupId: string;
  minCount: number;
  label: string;
}): Promise<void> {
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const memberIds = await input.graph.listGroupMemberIds(input.groupId);
    if (memberIds.length >= input.minCount) return;
    await sleep(5_000);
  }
  throw new Error(`timed out waiting for ${input.label} to appear in group state`);
}

async function waitForMembersAbsent(input: {
  graph: DemoGraph;
  groupId: string;
  memberIds: string[];
}): Promise<void> {
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const current = new Set(await input.graph.listGroupMemberIds(input.groupId));
    const remaining = input.memberIds.filter((id) => current.has(id));
    if (remaining.length === 0) return;
    await sleep(5_000);
  }
  throw new Error("timed out waiting for pre-removed members to become absent");
}

async function apiRequest(input: {
  apiUrl: string;
  apiKey: string;
  path: string;
  method: "GET" | "POST";
  body?: unknown;
}): Promise<any> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= API_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await httpJsonRequest(input);
    } catch (err) {
      lastError = err;
      if (attempt === API_RETRY_ATTEMPTS) break;
      await sleep(API_RETRY_DELAY_MS * attempt);
    }
  }
  throw lastError;
}

async function httpJsonRequest(input: {
  apiUrl: string;
  apiKey: string;
  path: string;
  method: "GET" | "POST";
  body?: unknown;
}): Promise<any> {
  const url = new URL(`${input.apiUrl}${input.path}`);
  const payload = input.body ? JSON.stringify(input.body) : undefined;
  const requestImpl = url.protocol === "http:" ? httpRequest : httpsRequest;

  return new Promise((resolvePromise, reject) => {
    const req = requestImpl(url, {
      method: input.method,
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        accept: "application/json",
        ...(payload
          ? {
              "content-type": "application/json",
              "content-length": Buffer.byteLength(payload),
            }
          : {}),
      },
      timeout: 30_000,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json: unknown = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch (err) {
          reject(new Error(`${input.method} ${input.path} returned non-JSON: ${text.slice(0, 200)}`, {
            cause: err,
          }));
          return;
        }

        const status = res.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          reject(new Error(`${input.method} ${input.path} failed: ${status} ${JSON.stringify(json)}`));
          return;
        }
        resolvePromise(json);
      });
    });
    req.on("timeout", () => req.destroy(new Error(`${input.method} ${input.path} timed out`)));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runCommand(
  command: string,
  args: string[],
  opts: { allowFailure?: boolean } = {},
): Promise<CommandResult> {
  const result = await runCommandCapture(command, args, opts);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result;
}

async function runCommandCapture(
  command: string,
  args: string[],
  opts: { allowFailure?: boolean } = {},
): Promise<CommandResult> {
  return await new Promise<CommandResult>((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      const exitCode = code ?? 1;
      const result = { exitCode, stdout, stderr };
      if (exitCode === 0 || opts.allowFailure) resolvePromise(result);
      else reject(new Error(`${command} ${args.join(" ")} exited with ${exitCode}\n${stderr || stdout}`));
    });
  });
}

function parseMode(raw: string): Mode {
  const allowed: Mode[] = ["all", "stale-plan", "idempotency"];
  if ((allowed as string[]).includes(raw)) return raw as Mode;
  failUsage(`--mode must be one of ${allowed.join(", ")}`);
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value) failUsage(`${flag} requires a value`);
  return value;
}

function readPositiveInt(value: string | undefined, flag: string): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) failUsage(`${flag} must be a positive integer`);
  return parsed;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function failUsage(message: string): never {
  process.stderr.write(`${message}\n\n${usage()}`);
  process.exit(ExitCodes.USAGE);
}

function removeFileIfExists(path: string): void {
  const abs = resolve(path);
  if (existsSync(abs)) unlinkSync(abs);
}

function writeJson(path: string, data: unknown): void {
  const abs = resolve(path);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, `${JSON.stringify(data, null, 2)}\n`);
}

function readJsonFile<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(path), "utf-8")) as T;
}

main().catch(async (err: unknown) => {
  await closePool().catch(() => undefined);
  process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exitCode = ExitCodes.UNEXPECTED;
});
