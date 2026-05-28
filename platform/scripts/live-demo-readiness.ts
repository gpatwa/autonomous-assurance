/**
 * Live demo readiness gate.
 *
 * Runs the CANONICAL-001 recovery path against the configured Azure-backed
 * platform and Microsoft 365 demo tenant:
 *   reset -> trigger -> poll -> incident -> blast radius -> plan -> approval
 *   -> approved execution -> baseline verification -> evidence pack export.
 *
 * This script intentionally reuses the existing canonical tenant and executor
 * scripts at mutation boundaries so the live write behavior stays in one
 * place. Pass --apply for real Graph writes.
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

interface Args {
  apply: boolean;
  runs: number;
  output: string;
  apiUrl: string | null;
  pollAttempts: number;
  pollDelayMs: number;
}

interface ReadinessRunResult {
  runNumber: number;
  startedAt: string;
  finishedAt: string;
  incidentId: string;
  planId: string;
  approvalId: string;
  executionInstanceId: string;
  validationResult: string;
  rootChanges: number;
  impactedObjects: number | null;
  planSteps: number | null;
  postMemberCount: number | null;
  evidencePath: string;
}

interface ReadinessResult {
  script: "live-demo-readiness";
  startedAt: string;
  finishedAt: string;
  dryRun: boolean;
  runsRequested: number;
  runsCompleted: number;
  results: ReadinessRunResult[];
}

const API_RETRY_ATTEMPTS = 4;
const API_RETRY_DELAY_MS = 2_000;
const INCIDENT_DETECTED_LOOKBACK_MS = 2 * 60 * 1000;

function parseArgs(argv: string[]): Args {
  const dryRun = parseDryRunFlag(argv);
  const args: Args = {
    apply: dryRun.apply,
    runs: 1,
    output: "../artifacts/live-mvp/readiness-summary.json",
    apiUrl: null,
    pollAttempts: 24,
    pollDelayMs: 15_000,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(usage());
      process.exit(ExitCodes.OK);
    } else if (arg === "--runs") {
      args.runs = readPositiveInt(argv[++i], "--runs");
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
    "Usage: npm run live-demo-readiness -- --apply [--runs 3] [--api-url URL] [--output PATH]",
    "",
    "Required env for --apply:",
    "  AUTH_TID_TO_TENANT, KAVACHIQ_API_KEY",
    "  KAVACHIQ_API_URL or --api-url",
    "  DATABASE_URL, SERVICE_BUS_CONNECTION_STRING, STORAGE_CONNECTION_STRING",
    "  RECOVERY_APPROVAL_SIGNING_SECRET",
    "  SP_READ_*, SP_EXECUTE_*",
    "",
  ].join("\n");
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

function failUsage(message: string): never {
  process.stderr.write(`${message}\n\n${usage()}`);
  process.exit(ExitCodes.USAGE);
}

async function main(): Promise<void> {
  loadDotenvCascade(resolve(".."));
  loadDotenvCascade();

  const args = parseArgs(process.argv.slice(2));
  const log = createLogger({ bindings: { script: "live-demo-readiness" } });
  const startedAt = new Date().toISOString();

  if (!args.apply) {
    throw new Error("live-demo-readiness requires --apply because the readiness gate is a live write path");
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

  const results: ReadinessRunResult[] = [];
  for (let runNumber = 1; runNumber <= args.runs; runNumber += 1) {
    log.info("readiness run starting", { runNumber, runs: args.runs });
    results.push(await runOne({ runNumber, tenantId, apiUrl, apiKey, args }));
    log.info("readiness run completed", { runNumber });
  }

  const summary: ReadinessResult = {
    script: "live-demo-readiness",
    startedAt,
    finishedAt: new Date().toISOString(),
    dryRun: false,
    runsRequested: args.runs,
    runsCompleted: results.length,
    results,
  };
  writeJson(args.output, summary);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

async function runOne(input: {
  runNumber: number;
  tenantId: string;
  apiUrl: string;
  apiKey: string;
  args: Args;
}): Promise<ReadinessRunResult> {
  const { runNumber, tenantId, apiUrl, apiKey, args } = input;
  const startedAt = new Date().toISOString();
  const prefix = `../artifacts/live-mvp/readiness-run-${runNumber}`;

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

  await triggerCanonicalIncident({
    outputPrefix: `${prefix}-trigger`,
    baselineOutputPrefix: `${prefix}-baseline-before-trigger`,
  });
  await waitForTenantReadiness({
    outputPrefix: `${prefix}-triggered-ready`,
    desiredState: "triggered",
    attempts: 24,
    delayMs: 5_000,
    stableObservations: 2,
  });

  const incidentId = await pollUntilIncident({
    tenantId,
    apiUrl,
    apiKey,
    observedAfter: startedAt,
    attempts: args.pollAttempts,
    delayMs: args.pollDelayMs,
    outputPrefix: prefix,
  });

  const blast = await apiRequest({
    apiUrl,
    apiKey,
    path: `/tenants/${tenantId}/incidents/${incidentId}/blast-radius`,
    method: "POST",
  });
  writeJson(`${prefix}-blast-radius.json`, blast);

  const plan = await apiRequest({
    apiUrl,
    apiKey,
    path: `/tenants/${tenantId}/incidents/${incidentId}/plans`,
    method: "POST",
  });
  writeJson(`${prefix}-recovery-plan.json`, plan);

  const step = plan.data.steps.find((s: { executionMode: string; approvalRequired: boolean }) =>
    s.executionMode === "system" && s.approvalRequired,
  );
  if (!step) throw new Error(`run ${runNumber}: no approval-required system recovery step`);

  const approval = await apiRequest({
    apiUrl,
    apiKey,
    path: `/tenants/${tenantId}/incidents/${incidentId}/plans/latest/steps/${step.stepId}/approve`,
    method: "POST",
    body: { approvedBy: "demo-operator@kavachiq.com", expiresInMinutes: 60 },
  });
  writeJson(`${prefix}-approval.json`, approval);

  await runCommand("npm", [
    "run",
    "execute-approved-recovery",
    "--",
    "--tenant-id",
    tenantId,
    "--incident-id",
    incidentId,
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

  const evidencePath = `${prefix}-evidence-pack.json`;
  const evidence = await apiRequest({
    apiUrl,
    apiKey,
    path: `/tenants/${tenantId}/incidents/${incidentId}/evidence-pack`,
    method: "GET",
  });
  writeJson(evidencePath, evidence);

  const latestAction = evidence.data.actionInstances.at(-1);
  const latestValidation = evidence.data.validationRecords[0];
  if (evidence.data.rootChanges.length !== 12) {
    throw new Error(`run ${runNumber}: expected 12 root changes, got ${evidence.data.rootChanges.length}`);
  }
  if (latestAction?.status !== "completed") {
    throw new Error(`run ${runNumber}: expected completed action, got ${latestAction?.status ?? "none"}`);
  }
  if (latestValidation?.result !== "match") {
    throw new Error(`run ${runNumber}: expected validation match, got ${latestValidation?.result ?? "none"}`);
  }

  return {
    runNumber,
    startedAt,
    finishedAt: new Date().toISOString(),
    incidentId,
    planId: plan.data.planId,
    approvalId: approval.data.approval.approvalId,
    executionInstanceId: latestAction.instanceId,
    validationResult: latestValidation.result,
    rootChanges: evidence.data.rootChanges.length,
    impactedObjects: evidence.data.blastRadiusResult?.totalImpactedObjects ?? null,
    planSteps: evidence.data.recoveryPlan?.steps.length ?? null,
    postMemberCount: latestAction.postExecutionState?.state.memberCount ?? null,
    evidencePath,
  };
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
      success?: boolean;
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
): Promise<number> {
  return await new Promise<number>((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      const exitCode = code ?? 1;
      if (exitCode === 0) resolvePromise(exitCode);
      else if (opts.allowFailure) resolvePromise(exitCode);
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
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
