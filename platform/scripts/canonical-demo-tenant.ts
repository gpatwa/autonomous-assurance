/**
 * Live recovery MVP demo-tenant harness.
 *
 * Provides the repeatable CANONICAL-001 operator flow:
 *   verify baseline -> reset to baseline -> trigger 12-member incident.
 *
 * Trust boundary:
 *   - SP-Read discovers current state.
 *   - SP-Setup resets fixture state before a demo.
 *   - SP-Execute triggers the incident so Entra audit events carry the
 *     agent/service-principal provenance expected by the product pipeline.
 *
 * Dry-run is the default for mutating modes. Pass --apply to write.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  ExitCodes,
  createLogger,
  currentCorrelationId,
  isPlatformError,
  loadDotenvCascade,
  newCorrelationId,
  newId,
  nowIso,
  parseDryRunFlag,
  rootLogger,
  withContext,
  type DryRunContext,
  type Logger,
} from "@kavachiq/platform";

import { loadSpCredentials, tokenProviderFor } from "./lib/credentials.js";
import {
  GraphRequestError,
  GraphTransport,
  type DeleteResult,
  type PostResult,
  type ResponseHeadersSummary,
} from "./lib/transport.js";

type Mode = "verify" | "reset" | "trigger" | "cycle";

interface Args {
  mode: Mode;
  dryRun: DryRunContext;
  output: string | null;
}

const CANONICAL = {
  privilegedGroupName: "Finance-Privileged-Access",
  userMailPrefix: "kq-test",
  baselineSeqs: [1, 2, 3, 4],
  incidentSeqs: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
} as const;

type OperationKind = "add-baseline-member" | "remove-incident-member" | "trigger-add-member";
type OperationStatus =
  | "planned"
  | "success"
  | "already-present"
  | "already-absent"
  | "skipped-dry-run"
  | "failed";

interface CanonicalUser {
  id: string;
  upn: string;
  displayName: string | null;
  seq: number;
}

interface GroupMember {
  id: string;
  upn: string | null;
  displayName: string | null;
  seq: number | null;
}

interface DemoTenantState {
  privilegedGroup: { present: boolean; id: string | null; displayName: string };
  canonicalUsers: {
    found: number;
    missingBaselineSeqs: number[];
    missingIncidentSeqs: number[];
  };
  groupMembership: {
    totalUsers: number;
    baselinePresentSeqs: number[];
    baselineMissingSeqs: number[];
    incidentPresentSeqs: number[];
    incidentAbsentSeqs: number[];
    unexpectedMembers: Array<{ id: string; upn: string | null; displayName: string | null }>;
  };
  readiness: {
    baselineReady: boolean;
    triggeredReady: boolean;
  };
}

interface DemoOperation {
  kind: OperationKind;
  memberId: string;
  memberUPN: string;
  memberSeq: number;
  startedAt: string;
  finishedAt: string;
  elapsedMs: number;
  status: OperationStatus;
  httpStatus: number | null;
  requestId?: string;
  clientRequestId?: string;
  errorCategory?: string;
  errorMessage?: string;
}

interface CanonicalDemoTenantResult {
  runMetadata: {
    script: "canonical-demo-tenant";
    mode: Mode;
    runId: string;
    correlationId: string;
    tenantId: string;
    dryRun: boolean;
    dryRunReason?: string;
    startedAt: string;
    finishedAt: string;
    elapsedMs: number;
  };
  before: DemoTenantState;
  operations: DemoOperation[];
  after: DemoTenantState;
  success: boolean;
  failureReasons: string[];
  nextRecommendedActions: string[];
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    mode: "verify",
    dryRun: parseDryRunFlag(argv),
    output: null,
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
    } else if (arg === "--apply" || arg === "--dry-run") {
      continue;
    } else {
      failUsage(`Unknown argument: ${arg}`);
    }
  }

  if (argv.includes("--dry-run")) {
    args.dryRun.apply = false;
    args.dryRun.reason = "explicit --dry-run";
  }

  return args;
}

function parseMode(raw: string): Mode {
  if (raw === "verify" || raw === "reset" || raw === "trigger" || raw === "cycle") {
    return raw;
  }
  failUsage(`--mode must be one of verify, reset, trigger, cycle; got "${raw}"`);
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

function usage(): string {
  return [
    "Usage: npm run canonical-demo-tenant -- --mode <verify|reset|trigger|cycle> [--apply] [--output PATH]",
    "",
    "Modes:",
    "  verify   Read-only: confirm Finance-Privileged-Access is at the 4-member baseline.",
    "  reset    Use SP-Setup to remove canonical incident members and restore baseline members.",
    "  trigger  Use SP-Execute to add the 12 incident members and create agent audit events.",
    "  cycle    Reset first, then trigger. Useful for local rehearsal; for live demos, run reset",
    "           before the call and trigger during the walkthrough.",
    "",
    "Dry-run is the default for reset/trigger/cycle. Pass --apply for real Graph writes.",
    "Env DRY_RUN=1 forces dry-run even when --apply is present.",
    "",
    "Required env:",
    "  SP_READ_*    for every mode.",
    "  SP_SETUP_*   for reset/cycle --apply.",
    "  SP_EXECUTE_* for trigger/cycle --apply.",
    "",
  ].join("\n");
}

async function runScript(args: Args, log: Logger): Promise<CanonicalDemoTenantResult> {
  const runId = newId("run");
  const startedAt = nowIso();
  const t0 = Date.now();

  const readCreds = loadSpCredentials("read");
  const readGraph = new GraphTransport({ tokenProvider: tokenProviderFor(readCreds) });

  log.info("starting", {
    mode: args.mode,
    dryRun: !args.dryRun.apply,
    dryRunReason: args.dryRun.reason,
  });

  const operations: DemoOperation[] = [];
  const before = await discoverState(readGraph);
  let after = before;

  if (args.mode === "reset" || args.mode === "cycle") {
    if (args.dryRun.apply) {
      const setupCreds = loadSpCredentials("setup");
      const setupGraph = new GraphTransport({ tokenProvider: tokenProviderFor(setupCreds) });
      operations.push(...(await resetToBaseline(setupGraph, before, log)));
      after = await discoverState(readGraph);
    } else {
      operations.push(...planResetOperations(before));
    }
  }

  if (args.mode === "trigger" || args.mode === "cycle") {
    const triggerBase = args.mode === "cycle" && args.dryRun.apply
      ? after
      : await discoverState(readGraph);
    if (!triggerBase.readiness.baselineReady && args.dryRun.apply) {
      throw new Error(
        "Cannot trigger CANONICAL-001 because the demo tenant is not at baseline. " +
          "Run `npm run canonical-demo-tenant -- --mode reset --apply` first.",
      );
    }

    if (args.dryRun.apply) {
      const executeCreds = loadSpCredentials("execute");
      const executeGraph = new GraphTransport({ tokenProvider: tokenProviderFor(executeCreds) });
      operations.push(...(await triggerIncident(readGraph, executeGraph, triggerBase, log)));
      after = await discoverState(readGraph);
    } else {
      operations.push(...planTriggerOperations(triggerBase));
      after = triggerBase;
    }
  }

  if (args.mode === "verify") {
    after = before;
  }

  const success = evaluateSuccess(args.mode, args.dryRun.apply, after);
  const failureReasons = buildFailureReasons(args.mode, args.dryRun.apply, after);
  const result: CanonicalDemoTenantResult = {
    runMetadata: {
      script: "canonical-demo-tenant",
      mode: args.mode,
      runId,
      correlationId: currentCorrelationId() ?? "unknown",
      tenantId: readCreds.tenantId,
      dryRun: !args.dryRun.apply,
      ...(args.dryRun.reason ? { dryRunReason: args.dryRun.reason } : {}),
      startedAt,
      finishedAt: nowIso(),
      elapsedMs: Date.now() - t0,
    },
    before,
    operations,
    after,
    success,
    failureReasons,
    nextRecommendedActions: buildNextActions(args.mode, args.dryRun.apply, success),
  };

  log.info("finished", {
    mode: args.mode,
    success,
    operations: operations.length,
    baselineReady: after.readiness.baselineReady,
    triggeredReady: after.readiness.triggeredReady,
  });

  return result;
}

async function discoverState(readGraph: GraphTransport): Promise<DemoTenantState> {
  const [group, users] = await Promise.all([
    findPrivilegedGroup(readGraph),
    findCanonicalUsers(readGraph),
  ]);

  const bySeq = new Map(users.map((user) => [user.seq, user]));
  const members = group ? await listGroupUserMembers(readGraph, group.id) : [];
  const baselineIds = new Set(
    CANONICAL.baselineSeqs.map((seq) => bySeq.get(seq)?.id).filter(isString),
  );
  const incidentIds = new Set(
    CANONICAL.incidentSeqs.map((seq) => bySeq.get(seq)?.id).filter(isString),
  );
  const memberIds = new Set(members.map((member) => member.id));

  const baselinePresentSeqs = CANONICAL.baselineSeqs.filter((seq) => {
    const id = bySeq.get(seq)?.id;
    return id ? memberIds.has(id) : false;
  });
  const incidentPresentSeqs = CANONICAL.incidentSeqs.filter((seq) => {
    const id = bySeq.get(seq)?.id;
    return id ? memberIds.has(id) : false;
  });

  const expectedTriggeredIds = new Set([...baselineIds, ...incidentIds]);
  const unexpectedMembers = members
    .filter((member) => !expectedTriggeredIds.has(member.id))
    .map((member) => ({
      id: member.id,
      upn: member.upn,
      displayName: member.displayName,
    }));

  const missingBaselineSeqs = CANONICAL.baselineSeqs.filter((seq) => !bySeq.has(seq));
  const missingIncidentSeqs = CANONICAL.incidentSeqs.filter((seq) => !bySeq.has(seq));
  const baselineMissingSeqs = CANONICAL.baselineSeqs.filter(
    (seq) => !baselinePresentSeqs.includes(seq),
  );
  const incidentAbsentSeqs = CANONICAL.incidentSeqs.filter(
    (seq) => !incidentPresentSeqs.includes(seq),
  );

  const baselineReady =
    !!group &&
    missingBaselineSeqs.length === 0 &&
    missingIncidentSeqs.length === 0 &&
    baselineMissingSeqs.length === 0 &&
    incidentPresentSeqs.length === 0 &&
    unexpectedMembers.length === 0;

  const triggeredReady =
    !!group &&
    missingBaselineSeqs.length === 0 &&
    missingIncidentSeqs.length === 0 &&
    baselineMissingSeqs.length === 0 &&
    incidentAbsentSeqs.length === 0 &&
    unexpectedMembers.length === 0;

  return {
    privilegedGroup: {
      present: group !== null,
      id: group?.id ?? null,
      displayName: CANONICAL.privilegedGroupName,
    },
    canonicalUsers: {
      found: users.length,
      missingBaselineSeqs,
      missingIncidentSeqs,
    },
    groupMembership: {
      totalUsers: members.length,
      baselinePresentSeqs,
      baselineMissingSeqs,
      incidentPresentSeqs,
      incidentAbsentSeqs,
      unexpectedMembers,
    },
    readiness: {
      baselineReady,
      triggeredReady,
    },
  };
}

async function findPrivilegedGroup(
  graph: GraphTransport,
): Promise<{ id: string; displayName: string } | null> {
  const filter = encodeURIComponent(
    `displayName eq '${CANONICAL.privilegedGroupName.replace(/'/g, "''")}'`,
  );
  const res = await graph.get<{ value: Array<{ id: string; displayName: string }> }>(
    `/groups?$filter=${filter}&$select=id,displayName&$top=1`,
  );
  return res.value[0] ?? null;
}

async function findCanonicalUsers(graph: GraphTransport): Promise<CanonicalUser[]> {
  const filter = encodeURIComponent(
    `startswith(userPrincipalName, '${CANONICAL.userMailPrefix}-')`,
  );
  const users: CanonicalUser[] = [];
  for await (const page of graph.getPaged<{
    id: string;
    displayName?: string;
    userPrincipalName: string;
  }>(`/users?$filter=${filter}&$select=id,displayName,userPrincipalName&$top=100`)) {
    for (const user of page.value) {
      const seq = parseCanonicalSeq(user.userPrincipalName);
      if (seq === null) continue;
      users.push({
        id: user.id,
        upn: user.userPrincipalName,
        displayName: user.displayName ?? null,
        seq,
      });
    }
  }
  return users.sort((a, b) => a.seq - b.seq);
}

async function listGroupUserMembers(
  graph: GraphTransport,
  groupId: string,
): Promise<GroupMember[]> {
  const members: GroupMember[] = [];
  const path =
    `/groups/${encodeURIComponent(groupId)}/members/microsoft.graph.user` +
    "?$select=id,displayName,userPrincipalName&$top=999";

  for await (const page of graph.getPaged<{
    id: string;
    displayName?: string;
    userPrincipalName?: string;
  }>(path)) {
    for (const member of page.value) {
      members.push({
        id: member.id,
        displayName: member.displayName ?? null,
        upn: member.userPrincipalName ?? null,
        seq: member.userPrincipalName ? parseCanonicalSeq(member.userPrincipalName) : null,
      });
    }
  }
  return members;
}

function planResetOperations(state: DemoTenantState): DemoOperation[] {
  const startedAt = nowIso();
  return [
    ...state.groupMembership.incidentPresentSeqs.map((seq) =>
      plannedOperation("remove-incident-member", seq, startedAt),
    ),
    ...state.groupMembership.baselineMissingSeqs.map((seq) =>
      plannedOperation("add-baseline-member", seq, startedAt),
    ),
  ];
}

function planTriggerOperations(state: DemoTenantState): DemoOperation[] {
  const startedAt = nowIso();
  if (!state.readiness.baselineReady) {
    return [];
  }
  return state.groupMembership.incidentAbsentSeqs.map((seq) =>
    plannedOperation("trigger-add-member", seq, startedAt),
  );
}

function plannedOperation(kind: OperationKind, seq: number, timestamp: string): DemoOperation {
  return {
    kind,
    memberId: "dry-run",
    memberUPN: `${CANONICAL.userMailPrefix}-${pad2(seq)}@<tenant-domain>`,
    memberSeq: seq,
    startedAt: timestamp,
    finishedAt: timestamp,
    elapsedMs: 0,
    status: "skipped-dry-run",
    httpStatus: null,
  };
}

async function resetToBaseline(
  setupGraph: GraphTransport,
  before: DemoTenantState,
  log: Logger,
): Promise<DemoOperation[]> {
  const groupId = requireGroupId(before);
  const users = await findCanonicalUsers(setupGraph);
  const bySeq = new Map(users.map((user) => [user.seq, user]));
  const operations: DemoOperation[] = [];

  for (const seq of before.groupMembership.incidentPresentSeqs) {
    const user = requireUser(bySeq, seq);
    operations.push(
      await removeMember(setupGraph, groupId, user, "remove-incident-member", log),
    );
  }

  for (const seq of before.groupMembership.baselineMissingSeqs) {
    const user = requireUser(bySeq, seq);
    operations.push(
      await addMember(setupGraph, groupId, user, "add-baseline-member", log),
    );
  }

  return operations;
}

async function triggerIncident(
  readGraph: GraphTransport,
  executeGraph: GraphTransport,
  before: DemoTenantState,
  log: Logger,
): Promise<DemoOperation[]> {
  const groupId = requireGroupId(before);
  const users = await findCanonicalUsers(readGraph);
  const bySeq = new Map(users.map((user) => [user.seq, user]));
  const operations: DemoOperation[] = [];

  for (const seq of CANONICAL.incidentSeqs) {
    const user = requireUser(bySeq, seq);
    operations.push(await addMember(executeGraph, groupId, user, "trigger-add-member", log));
  }

  return operations;
}

async function addMember(
  graph: GraphTransport,
  groupId: string,
  user: CanonicalUser,
  kind: OperationKind,
  log: Logger,
): Promise<DemoOperation> {
  const startedAt = nowIso();
  const t0 = Date.now();
  try {
    const res: PostResult = await graph.post(
      `/groups/${encodeURIComponent(groupId)}/members/$ref`,
      { "@odata.id": `https://graph.microsoft.com/v1.0/users/${user.id}` },
    );
    log.info("member add complete", { kind, userSeq: user.seq, userId: user.id });
    return operationFromSuccess(kind, user, startedAt, t0, res.status, res.headers, "success");
  } catch (err) {
    if (err instanceof GraphRequestError && isAlreadyMember(err)) {
      log.info("member already present", { kind, userSeq: user.seq, userId: user.id });
      return operationFromSuccess(
        kind,
        user,
        startedAt,
        t0,
        err.status,
        err.headers,
        "already-present",
      );
    }
    log.error("member add failed", err, { kind, userSeq: user.seq, userId: user.id });
    return operationFromError(kind, user, startedAt, t0, err);
  }
}

async function removeMember(
  graph: GraphTransport,
  groupId: string,
  user: CanonicalUser,
  kind: OperationKind,
  log: Logger,
): Promise<DemoOperation> {
  const startedAt = nowIso();
  const t0 = Date.now();
  try {
    const res: DeleteResult = await graph.delete(
      `/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(user.id)}/$ref`,
    );
    log.info("member remove complete", { kind, userSeq: user.seq, userId: user.id });
    return operationFromSuccess(kind, user, startedAt, t0, res.status, res.headers, "success");
  } catch (err) {
    if (err instanceof GraphRequestError && err.status === 404) {
      log.info("member already absent", { kind, userSeq: user.seq, userId: user.id });
      return operationFromSuccess(
        kind,
        user,
        startedAt,
        t0,
        err.status,
        err.headers,
        "already-absent",
      );
    }
    log.error("member remove failed", err, { kind, userSeq: user.seq, userId: user.id });
    return operationFromError(kind, user, startedAt, t0, err);
  }
}

function operationFromSuccess(
  kind: OperationKind,
  user: CanonicalUser,
  startedAt: string,
  t0: number,
  httpStatus: number,
  headers: ResponseHeadersSummary,
  status: OperationStatus,
): DemoOperation {
  const finishedAt = nowIso();
  return {
    kind,
    memberId: user.id,
    memberUPN: user.upn,
    memberSeq: user.seq,
    startedAt,
    finishedAt,
    elapsedMs: Date.now() - t0,
    status,
    httpStatus,
    ...pickHeaders(headers),
  };
}

function operationFromError(
  kind: OperationKind,
  user: CanonicalUser,
  startedAt: string,
  t0: number,
  err: unknown,
): DemoOperation {
  const finishedAt = nowIso();
  const graph = err instanceof GraphRequestError ? classifyGraphError(err) : null;
  return {
    kind,
    memberId: user.id,
    memberUPN: user.upn,
    memberSeq: user.seq,
    startedAt,
    finishedAt,
    elapsedMs: Date.now() - t0,
    status: "failed",
    httpStatus: err instanceof GraphRequestError ? err.status : null,
    ...(err instanceof GraphRequestError ? pickHeaders(err.headers) : {}),
    errorCategory: graph?.category ?? "unknown",
    errorMessage: err instanceof Error ? err.message : String(err),
  };
}

function pickHeaders(headers: ResponseHeadersSummary): {
  requestId?: string;
  clientRequestId?: string;
} {
  const out: { requestId?: string; clientRequestId?: string } = {};
  if (headers.requestId) out.requestId = headers.requestId;
  if (headers.clientRequestId) out.clientRequestId = headers.clientRequestId;
  return out;
}

function classifyGraphError(err: GraphRequestError): { category: string } {
  if (err.status === 429) return { category: "rate-limited" };
  if (err.status === 401) return { category: "unauthorized" };
  if (err.status === 403) return { category: "forbidden" };
  if (err.status === 404) return { category: "not-found" };
  if (err.status >= 500) return { category: "server-error" };
  if (err.status >= 400) return { category: "client-error" };
  return { category: "other" };
}

function isAlreadyMember(err: GraphRequestError): boolean {
  if (err.status !== 400 && err.status !== 409) return false;
  const body = (err.details as { body?: string } | undefined)?.body ?? "";
  return /already exist|alreadyExists|added object references already exist/i.test(body);
}

function evaluateSuccess(mode: Mode, apply: boolean, after: DemoTenantState): boolean {
  if (!apply && mode !== "verify") return true;
  if (mode === "trigger" || mode === "cycle") return after.readiness.triggeredReady;
  return after.readiness.baselineReady;
}

function buildFailureReasons(mode: Mode, apply: boolean, state: DemoTenantState): string[] {
  if (!apply && mode !== "verify") return [];
  const target = mode === "trigger" || mode === "cycle" ? "triggered" : "baseline";
  if ((target === "baseline" && state.readiness.baselineReady) ||
      (target === "triggered" && state.readiness.triggeredReady)) {
    return [];
  }

  const reasons: string[] = [];
  if (!state.privilegedGroup.present) {
    reasons.push(`Missing group '${CANONICAL.privilegedGroupName}'.`);
  }
  if (state.canonicalUsers.missingBaselineSeqs.length > 0) {
    reasons.push(`Missing baseline users: ${formatSeqs(state.canonicalUsers.missingBaselineSeqs)}.`);
  }
  if (state.canonicalUsers.missingIncidentSeqs.length > 0) {
    reasons.push(`Missing incident users: ${formatSeqs(state.canonicalUsers.missingIncidentSeqs)}.`);
  }
  if (state.groupMembership.baselineMissingSeqs.length > 0) {
    reasons.push(`Baseline members absent from group: ${formatSeqs(state.groupMembership.baselineMissingSeqs)}.`);
  }
  if (target === "baseline" && state.groupMembership.incidentPresentSeqs.length > 0) {
    reasons.push(`Incident members still present: ${formatSeqs(state.groupMembership.incidentPresentSeqs)}.`);
  }
  if (target === "triggered" && state.groupMembership.incidentAbsentSeqs.length > 0) {
    reasons.push(`Incident members not present after trigger: ${formatSeqs(state.groupMembership.incidentAbsentSeqs)}.`);
  }
  if (state.groupMembership.unexpectedMembers.length > 0) {
    reasons.push(
      `Unexpected group members present: ${state.groupMembership.unexpectedMembers
        .map((member) => member.upn ?? member.displayName ?? member.id)
        .join(", ")}.`,
    );
  }
  return reasons;
}

function buildNextActions(mode: Mode, apply: boolean, success: boolean): string[] {
  if (!apply && mode !== "verify") {
    return [
      "Dry-run only. Re-run with --apply for real Graph writes.",
      `npm run canonical-demo-tenant -- --mode ${mode} --apply --output ./wi-live/${mode}.json`,
    ];
  }
  if (!success) {
    return [
      "Bring the tenant back to baseline before triggering the prospect demo.",
      "npm run setup-test-tenant -- --mode setup --apply --confirm-all-manual --output ./wi-live/setup.json",
      "npm run canonical-demo-tenant -- --mode reset --apply --output ./wi-live/reset.json",
    ];
  }
  if (mode === "verify" || mode === "reset") {
    return [
      "Baseline is ready. Trigger CANONICAL-001 when you are ready to create the live incident.",
      "npm run canonical-demo-tenant -- --mode trigger --apply --output ./wi-live/trigger.json",
    ];
  }
  return [
    "Triggered state is ready. Wait for Entra audit propagation, then poll/process the incident path.",
    "npm run audit-completeness-spike -- --output-dir ./wi-live --confirm-mutations",
  ];
}

function requireGroupId(state: DemoTenantState): string {
  if (!state.privilegedGroup.id) {
    throw new Error(
      `Missing group '${CANONICAL.privilegedGroupName}'. Run setup-test-tenant first.`,
    );
  }
  return state.privilegedGroup.id;
}

function requireUser(usersBySeq: Map<number, CanonicalUser>, seq: number): CanonicalUser {
  const user = usersBySeq.get(seq);
  if (!user) {
    throw new Error(
      `Missing canonical user ${CANONICAL.userMailPrefix}-${pad2(seq)}. ` +
        "Run setup-test-tenant first.",
    );
  }
  return user;
}

function parseCanonicalSeq(upn: string): number | null {
  const match = new RegExp(`^${CANONICAL.userMailPrefix}-(\\d+)@`, "i").exec(upn);
  if (!match) return null;
  const seq = Number(match[1]);
  return Number.isInteger(seq) ? seq : null;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function formatSeqs(seqs: readonly number[]): string {
  return seqs.map((seq) => `${CANONICAL.userMailPrefix}-${pad2(seq)}`).join(", ");
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function writeResult(result: CanonicalDemoTenantResult, output: string | null): void {
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
  await withContext({ correlationId }, async () => {
    const log = createLogger({
      bindings: { script: "canonical-demo-tenant" },
    });
    const result = await runScript(args, log);
    writeResult(result, args.output);
    if (!result.success) process.exitCode = ExitCodes.UNEXPECTED;
  });
}

main().catch((err: unknown) => {
  const log = rootLogger.child({ script: "canonical-demo-tenant" });
  log.error("fatal", err);
  if (isPlatformError(err) && err.code === "CONFIG_MISSING") {
    process.exitCode = ExitCodes.CONFIG;
  } else {
    process.exitCode = ExitCodes.UNEXPECTED;
  }
});
