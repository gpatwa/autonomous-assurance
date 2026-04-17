/**
 * WI-05 canonical mutation trigger.
 *
 * Performs the four canonical scenario mutations against the Entra test
 * tenant to produce audit events with the correct provenance signatures.
 * Emits a structured mutation-trail.json that the WI-05 analyzer can
 * later consume to correlate observed audit events to specific mutations
 * (instead of relying purely on a wall-clock window).
 *
 * Mutation plan:
 *   M1 — group membership: add 12 users to Finance-Privileged-Access via
 *        SP-Execute so events carry initiatedBy.app, matching the
 *        canonical scenario's "agent-identified" source.
 *   M2 — Conditional Access policy edit: remains operator-gated (portal).
 *        Added in commit 2.
 *   M3 — app role assignment: added in commit 3, via SP-Setup.
 *   M4 — service principal credential add/cleanup: added in commit 3,
 *        via SP-Setup.
 *
 * Dry-run default. --apply opts in to Graph writes. --dry-run wins over
 * --apply. DRY_RUN=1 env forces dry-run.
 *
 * Discovery is SP-Read only; writes for M1 are SP-Execute only; M3/M4 use
 * SP-Setup (commit 3). The trust boundary stays: no script-local
 * credential helper grants one principal's powers to another.
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
  type PostResult,
  type ResponseHeadersSummary,
} from "./lib/transport.js";
import {
  Runbook,
  parseConfirmationFlags,
  type RunbookResult,
} from "./lib/runbook.js";

// ─── Constants ─────────────────────────────────────────────────────────────

const CANONICAL = {
  privilegedGroupName: "Finance-Privileged-Access",
  userMailPrefix: "kq-test",
  caPolicyName: "Finance-MFA-Bypass",
  appDisplayPrefix: "KavachiqTest-App",
  /** Graph's "default access" role for SPs that define no custom app roles. */
  defaultAppRoleId: "00000000-0000-0000-0000-000000000000",
  /** Displayed on the test secret M4 creates; deleted before the step returns. */
  m4SecretDisplayName: "kavachiq-wi05-spike",
};

type MutationId = "M1" | "M2" | "M3" | "M4";

// ─── CLI ───────────────────────────────────────────────────────────────────

interface Args {
  dryRun: DryRunContext;
  output: string;
  memberCount: number;
  memberStartSeq: number;
  modes: Set<MutationId>;
  caPolicyName: string;
  targetAppSeq: number;
  m3AssigneeUserSeq: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    dryRun: parseDryRunFlag(argv),
    output: "./wi05/mutation-trail.json",
    memberCount: 12,
    memberStartSeq: 5,
    modes: new Set<MutationId>(["M1", "M2", "M3", "M4"]), // full canonical scenario
    caPolicyName: CANONICAL.caPolicyName,
    targetAppSeq: 1,
    m3AssigneeUserSeq: 17,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(usage());
      process.exit(ExitCodes.OK);
    } else if (arg === "--output") {
      args.output = requireValue(argv, ++i, "--output");
    } else if (arg === "--member-count") {
      args.memberCount = parsePositiveInt(argv[++i], "--member-count");
    } else if (arg === "--member-start-seq") {
      args.memberStartSeq = parsePositiveInt(argv[++i], "--member-start-seq");
    } else if (arg === "--ca-policy-name") {
      args.caPolicyName = requireValue(argv, ++i, "--ca-policy-name");
    } else if (arg === "--target-app-seq") {
      args.targetAppSeq = parsePositiveInt(argv[++i], "--target-app-seq");
    } else if (arg === "--m3-assignee-user-seq") {
      args.m3AssigneeUserSeq = parsePositiveInt(argv[++i], "--m3-assignee-user-seq");
    } else if (arg === "--mode") {
      const raw = requireValue(argv, ++i, "--mode");
      const tokens = raw.split(",").map((t) => t.trim().toUpperCase());
      args.modes = new Set();
      for (const t of tokens) {
        if (t === "ALL") {
          args.modes = new Set(["M1", "M2", "M3", "M4"]);
        } else if (t === "M1" || t === "M2" || t === "M3" || t === "M4") {
          args.modes.add(t);
        } else {
          failUsage(`--mode value must be one of M1|M2|M3|M4|all[,...]; got "${t}"`);
        }
      }
    } else if (arg === "--apply" || arg === "--dry-run") {
      continue; // handled by parseDryRunFlag / override below
    } else if (arg === "--confirm-all-manual") {
      continue; // handled by parseConfirmationFlags
    } else if (arg === "--confirm-manual-step") {
      i += 1; // consume value
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

function parsePositiveInt(raw: string | undefined, flag: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) failUsage(`${flag} must be a positive integer`);
  return n;
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
    "Usage: npm run trigger-canonical-mutations -- [--apply] [options]",
    "",
    "  --apply                       Perform real Graph writes. Default is dry-run.",
    "  --dry-run                     Force dry-run; wins over --apply.",
    "  --output PATH                 Write mutation-trail.json. Default: ./wi05/mutation-trail.json.",
    "  --mode <M1|M2|M3|M4|all,...>  Which mutations to run (default: all four).",
    "  --member-count N              M1: members to add (default: 12).",
    "  --member-start-seq N          M1: starting UPN seq (default: 5).",
    "  --ca-policy-name NAME         M2: CA policy to edit (default: Finance-MFA-Bypass).",
    "  --target-app-seq N            M3 + M4: which KavachiqTest-App-NN to use (default: 1).",
    "  --m3-assignee-user-seq N      M3: user seq to assign the app role to (default: 17).",
    "",
    "Manual-step confirmation (CA policy in commit 2; portal steps):",
    "  --confirm-manual-step <id>    Pre-confirm the named step (repeatable).",
    "  --confirm-all-manual          Pre-confirm every manual / approval-required step.",
    "",
    "Env DRY_RUN=1 forces dry-run regardless of --apply.",
    "",
    "Required env:",
    "  SP_READ_*    — discovery for all mutations",
    "  SP_EXECUTE_* — M1 add-member writes (so events carry initiatedBy.app)",
    "  SP_SETUP_*   — M3 (app role assignment) and M4 (SP credential add+remove)",
    "  M2 is a portal action by the operator; no extra env required.",
    "",
  ].join("\n");
}

// ─── Mutation-trail model ──────────────────────────────────────────────────

type MutationKind =
  | "add-member"
  | "ca-policy-edit"
  | "app-role-assignment"
  | "sp-credential-add"
  | "sp-credential-remove";

type MutationOutcome =
  | "success"
  | "failed"
  | "skipped"
  | "manual-confirmed"
  | "manual-declined";

interface MutationAttempt {
  mutationId: MutationId;
  kind: MutationKind | "portal-instruction";
  attemptIndex: number;
  requestPath?: string;
  startedAt: string;
  finishedAt: string;
  elapsedMs: number;
  httpStatus: number | null;
  outcome: MutationOutcome;
  errorCategory?: string;
  errorMessage?: string;
  requestId?: string;
  clientRequestId?: string;
  payloadSummary: Record<string, unknown>;
}

interface MutationSummary {
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

interface RunMetadata {
  script: "trigger-canonical-mutations";
  runId: string;
  correlationId: string;
  tenantId: string;
  privilegedGroupId: string | null;
  startedAt: string;
  finishedAt: string;
  elapsedMs: number;
  dryRun: boolean;
  dryRunReason?: string;
  modes: MutationId[];
}

interface MutationTrail {
  runMetadata: RunMetadata;
  attempts: MutationAttempt[];
  summary: Record<MutationId, MutationSummary>;
  runbook: RunbookResult;
}

function emptySummary(): MutationSummary {
  return { attempted: 0, succeeded: 0, failed: 0, skipped: 0 };
}

function buildSummary(attempts: MutationAttempt[]): Record<MutationId, MutationSummary> {
  const out: Record<MutationId, MutationSummary> = {
    M1: emptySummary(),
    M2: emptySummary(),
    M3: emptySummary(),
    M4: emptySummary(),
  };
  for (const a of attempts) {
    const s = out[a.mutationId];
    s.attempted += 1;
    if (a.outcome === "success" || a.outcome === "manual-confirmed") s.succeeded += 1;
    else if (a.outcome === "failed") s.failed += 1;
    else s.skipped += 1;
  }
  return out;
}

function pickHeaders(h: ResponseHeadersSummary): {
  requestId?: string;
  clientRequestId?: string;
} {
  const out: { requestId?: string; clientRequestId?: string } = {};
  if (h.requestId) out.requestId = h.requestId;
  if (h.clientRequestId) out.clientRequestId = h.clientRequestId;
  return out;
}

function classifyGraphError(err: GraphRequestError): {
  outcome: MutationOutcome;
  errorCategory: string;
  reason: string;
} {
  const body = (err.details as { body?: string } | undefined)?.body ?? "";
  // Entra returns 400 or 409 with various "already exists" messages.
  if (
    (err.status === 400 || err.status === 409) &&
    /already exist|alreadyExists/i.test(body)
  ) {
    return { outcome: "skipped", errorCategory: "already-exists", reason: "already-member" };
  }
  if (err.status === 429) return { outcome: "failed", errorCategory: "rate-limited", reason: "429" };
  if (err.status === 401) return { outcome: "failed", errorCategory: "unauthorized", reason: "401" };
  if (err.status === 403) return { outcome: "failed", errorCategory: "forbidden", reason: "403" };
  if (err.status >= 500) return { outcome: "failed", errorCategory: "server-error", reason: `${err.status}` };
  if (err.status >= 400) return { outcome: "failed", errorCategory: "client-error", reason: `${err.status}` };
  return { outcome: "failed", errorCategory: "other", reason: `${err.status}` };
}

// ─── Discovery helpers ─────────────────────────────────────────────────────

interface CandidateUser {
  id: string;
  upn: string;
  seq: number;
}

async function findPrivilegedGroup(
  graph: GraphTransport,
): Promise<string | null> {
  const filter = encodeURIComponent(
    `displayName eq '${CANONICAL.privilegedGroupName}'`,
  );
  const res = await graph.get<{ value: Array<{ id: string }> }>(
    `/groups?$filter=${filter}&$select=id&$top=1`,
  );
  return res.value[0]?.id ?? null;
}

interface CaPolicyRef {
  id: string;
  displayName: string;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function buildM2Instruction(caPolicyName: string): string {
  return [
    "Open the Entra admin portal and edit the Conditional Access policy to produce",
    "ONE directoryAudits event of type 'Update conditional access policy'.",
    "",
    "Portal path:",
    "  https://entra.microsoft.com/",
    "  → Identity → Protection → Conditional Access → Policies",
    `  → click '${caPolicyName}'`,
    "",
    "Safe edit (no enforcement impact):",
    "  1. Edit the policy's Description (add or remove a single space).",
    "  2. Click 'Save'. A success toast confirms the write.",
    "  3. Optionally revert the description in a second save (produces a 2nd event;",
    "     still counts for WI-05 because we match on activityDisplayName).",
    "",
    "Do NOT toggle the enablement state or change Grant controls. Keep 'Enable policy'",
    "at its current value (report-only is strongly preferred — see ENGINEERING_BOOTSTRAP",
    "_DECISIONS.md §7).",
    "",
    "After saving, return here and confirm the prompt. The script records the step's",
    "startedAt/confirmedAt as the M2 mutation window for WI-05 correlation.",
  ].join("\n");
}

async function findCaPolicy(
  graph: GraphTransport,
  displayName: string,
): Promise<CaPolicyRef | null> {
  // /identity/conditionalAccess/policies supports $filter on displayName.
  const filter = encodeURIComponent(`displayName eq '${displayName.replace(/'/g, "''")}'`);
  const res = await graph.get<{ value: Array<{ id: string; displayName: string }> }>(
    `/identity/conditionalAccess/policies?$filter=${filter}&$select=id,displayName&$top=1`,
  );
  const p = res.value[0];
  return p ? { id: p.id, displayName: p.displayName } : null;
}

async function findCanonicalUsers(
  graph: GraphTransport,
): Promise<CandidateUser[]> {
  const filter = encodeURIComponent(
    `startswith(userPrincipalName, '${CANONICAL.userMailPrefix}-')`,
  );
  const all: Array<{ id: string; userPrincipalName: string }> = [];
  for await (const page of graph.getPaged<{ id: string; userPrincipalName: string }>(
    `/users?$filter=${filter}&$select=id,userPrincipalName&$top=100`,
  )) {
    all.push(...page.value);
  }
  return all
    .map((u) => {
      const prefix = `${CANONICAL.userMailPrefix}-`;
      const before = u.userPrincipalName.split("@")[0] ?? "";
      const seqStr = before.startsWith(prefix) ? before.slice(prefix.length) : "";
      const seq = Number(seqStr);
      return { id: u.id, upn: u.userPrincipalName, seq };
    })
    .filter((c) => Number.isFinite(c.seq))
    .sort((a, b) => a.seq - b.seq);
}

interface AppRef {
  id: string;        // application object ID
  appId: string;     // application client ID (GUID used to link to SP)
  displayName: string;
}

async function findAppByDisplayName(
  graph: GraphTransport,
  displayName: string,
): Promise<AppRef | null> {
  const filter = encodeURIComponent(`displayName eq '${displayName.replace(/'/g, "''")}'`);
  const res = await graph.get<{ value: Array<AppRef> }>(
    `/applications?$filter=${filter}&$select=id,appId,displayName&$top=1`,
  );
  return res.value[0] ?? null;
}

async function findServicePrincipalByAppId(
  graph: GraphTransport,
  appId: string,
): Promise<{ id: string; displayName: string } | null> {
  const filter = encodeURIComponent(`appId eq '${appId}'`);
  const res = await graph.get<{ value: Array<{ id: string; displayName: string }> }>(
    `/servicePrincipals?$filter=${filter}&$select=id,displayName&$top=1`,
  );
  return res.value[0] ?? null;
}

// ─── Main ──────────────────────────────────────────────────────────────────

interface ScriptState {
  privilegedGroupId: string | null;
  m1Candidates: CandidateUser[];
  caPolicy: CaPolicyRef | null;
  m3Target: {
    app: AppRef;
    sp: { id: string; displayName: string } | null;
    assignee: CandidateUser;
  } | null;
  m4Target: { app: AppRef } | null;
  attempts: MutationAttempt[];
}

async function runScript(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  loadDotenvCascade();

  const runId = newId("run");
  const log = createLogger({
    bindings: { script: "trigger-canonical-mutations", runId },
  });

  const startedAt = nowIso();
  const t0 = Date.now();
  log.info("starting", {
    modes: Array.from(args.modes),
    dryRun: !args.dryRun.apply,
    dryRunReason: args.dryRun.reason,
    memberCount: args.memberCount,
    memberStartSeq: args.memberStartSeq,
    output: args.output,
  });

  const state: ScriptState = {
    privilegedGroupId: null,
    m1Candidates: [],
    caPolicy: null,
    m3Target: null,
    m4Target: null,
    attempts: [],
  };

  const { confirmAll, confirmedIds } = parseConfirmationFlags(process.argv.slice(2));
  const runbook = new Runbook({
    scriptName: "trigger-canonical-mutations",
    apply: args.dryRun.apply,
    autoConfirm: confirmAll,
    confirmedStepIds: confirmedIds,
    logger: log,
  });

  // SP-Read is always needed for discovery.
  const readCreds = loadSpCredentials("read");
  const readGraph = new GraphTransport({ tokenProvider: tokenProviderFor(readCreds) });

  // ── Discovery (automatic; always runs, read-only) ──────────────────────
  runbook.add({
    id: "discover-privileged-group",
    label: `Find '${CANONICAL.privilegedGroupName}' group ID via SP-Read`,
    kind: "automatic",
    async run() {
      const id = await findPrivilegedGroup(readGraph);
      if (!id) {
        throw new Error(
          `Privileged group '${CANONICAL.privilegedGroupName}' not found. ` +
            `Run \`npm run setup-test-tenant -- --mode setup --apply --confirm-all-manual\` first.`,
        );
      }
      state.privilegedGroupId = id;
      log.info("discovery: privileged group", { id });
      return { id };
    },
  });

  runbook.add({
    id: "discover-ca-policy",
    label: `Find CA policy '${args.caPolicyName}' ID via SP-Read`,
    kind: "automatic",
    skipIf: () => (args.modes.has("M2") ? false : "M2 not requested"),
    async run() {
      const policy = await findCaPolicy(readGraph, args.caPolicyName);
      if (!policy) {
        throw new Error(
          `Conditional Access policy '${args.caPolicyName}' not found. ` +
            `Create it manually in the Entra admin portal (report-only mode is safe), ` +
            `or pass a different --ca-policy-name to target an existing policy.`,
        );
      }
      state.caPolicy = policy;
      log.info("discovery: ca policy", { id: policy.id, displayName: policy.displayName });
      return { id: policy.id, displayName: policy.displayName };
    },
  });

  runbook.add({
    id: "discover-m1-candidates",
    label: `Find ${args.memberCount} M1 candidate users (seq ${args.memberStartSeq}..${args.memberStartSeq + args.memberCount - 1})`,
    kind: "automatic",
    skipIf: () => (args.modes.has("M1") ? false : "M1 not requested"),
    async run() {
      const all = await findCanonicalUsers(readGraph);
      const pool = all.filter(
        (c) =>
          c.seq >= args.memberStartSeq &&
          c.seq < args.memberStartSeq + args.memberCount,
      );
      if (pool.length < args.memberCount) {
        throw new Error(
          `Only found ${pool.length} / ${args.memberCount} candidate users in seq ` +
            `${args.memberStartSeq}..${args.memberStartSeq + args.memberCount - 1}. ` +
            `Either lower --member-count, shift --member-start-seq, or re-run ` +
            `\`npm run setup-test-tenant -- --mode setup --apply\` to create more users.`,
        );
      }
      state.m1Candidates = pool;
      log.info("discovery: m1 candidates", {
        count: pool.length,
        seqRange: [pool[0]!.seq, pool[pool.length - 1]!.seq],
      });
      return { count: pool.length, first: pool[0]!.upn, last: pool[pool.length - 1]!.upn };
    },
  });

  // ── M1: add members via SP-Execute (requiresApply) ─────────────────────
  runbook.add({
    id: "m1-add-group-members",
    label: `M1: add ${args.memberCount} members to '${CANONICAL.privilegedGroupName}' via SP-Execute`,
    kind: "automatic",
    requiresApply: true,
    skipIf: () => (args.modes.has("M1") ? false : "M1 not requested"),
    async run() {
      if (!state.privilegedGroupId) throw new Error("privileged group ID missing");
      if (state.m1Candidates.length === 0) throw new Error("no M1 candidates resolved");

      // SP-Execute creds — loaded here, not in the shared discovery path.
      const executeCreds = loadSpCredentials("execute");
      const executeGraph = new GraphTransport({
        tokenProvider: tokenProviderFor(executeCreds),
      });

      const path = `/groups/${state.privilegedGroupId}/members/$ref`;
      let succeeded = 0;
      let failed = 0;
      let skipped = 0;

      for (let i = 0; i < state.m1Candidates.length; i += 1) {
        const { id: userId, upn } = state.m1Candidates[i]!;
        const attemptStart = nowIso();
        const attemptT0 = Date.now();
        try {
          const res: PostResult = await executeGraph.post(path, {
            "@odata.id": `https://graph.microsoft.com/v1.0/users/${userId}`,
          });
          const attempt: MutationAttempt = {
            mutationId: "M1",
            kind: "add-member",
            attemptIndex: i,
            requestPath: path,
            startedAt: attemptStart,
            finishedAt: nowIso(),
            elapsedMs: Date.now() - attemptT0,
            httpStatus: res.status,
            outcome: "success",
            ...pickHeaders(res.headers),
            payloadSummary: { userId, upn, groupId: state.privilegedGroupId },
          };
          state.attempts.push(attempt);
          succeeded += 1;
          log.info("m1: add-member", {
            index: i,
            upn,
            status: res.status,
            requestId: attempt.requestId,
          });
        } catch (err) {
          const attemptBase = {
            mutationId: "M1" as const,
            kind: "add-member" as const,
            attemptIndex: i,
            requestPath: path,
            startedAt: attemptStart,
            finishedAt: nowIso(),
            elapsedMs: Date.now() - attemptT0,
            payloadSummary: { userId, upn, groupId: state.privilegedGroupId },
          };
          if (err instanceof GraphRequestError) {
            const cls = classifyGraphError(err);
            state.attempts.push({
              ...attemptBase,
              httpStatus: err.status,
              outcome: cls.outcome,
              errorCategory: cls.errorCategory,
              errorMessage: err.message,
              ...pickHeaders(err.headers),
            });
            if (cls.outcome === "skipped") {
              skipped += 1;
              log.info("m1: member already present", { index: i, upn });
            } else {
              failed += 1;
              log.error("m1: add-member failed", err, {
                index: i,
                upn,
                status: err.status,
              });
            }
          } else {
            failed += 1;
            const msg = err instanceof Error ? err.message : String(err);
            state.attempts.push({
              ...attemptBase,
              httpStatus: null,
              outcome: "failed",
              errorCategory: "network",
              errorMessage: msg,
            });
            log.error("m1: network error", err, { index: i, upn });
          }
        }
      }

      // Fail the step if zero succeeded AND we had candidates — otherwise keep
      // the runbook non-aborted so the trail still gets written. Partial
      // failures (some 429s, some successes) do not abort the runbook; the
      // trail records per-attempt outcomes.
      if (succeeded === 0 && state.m1Candidates.length > 0) {
        throw new Error(
          `M1: 0 / ${state.m1Candidates.length} member-adds succeeded. ` +
            `Inspect mutation-trail.json attempts[*] for classification.`,
        );
      }

      return {
        attempted: state.m1Candidates.length,
        succeeded,
        failed,
        skipped,
      };
    },
  });

  // ── M2: approval-required portal edit (never automated — policy lockout risk) ──
  //
  // Pre-filled instruction captures the exact policy + click path so the
  // operator does not have to search. The CA policy edit stays manual by
  // design; see ENGINEERING_BOOTSTRAP_DECISIONS.md §7.
  runbook.add({
    id: "m2-ca-policy-edit",
    label: `M2: edit the Conditional Access policy '${args.caPolicyName}'`,
    kind: "approval-required",
    skipIf: () => (args.modes.has("M2") ? false : "M2 not requested"),
    instruction: buildM2Instruction(args.caPolicyName),
  });

  // ── M3: discovery + ensure-SP + app role assignment ───────────────────
  const appDisplayName = `${CANONICAL.appDisplayPrefix}-${pad2(args.targetAppSeq)}`;
  const needsM3OrM4 = () => args.modes.has("M3") || args.modes.has("M4");

  runbook.add({
    id: "discover-m3-m4-app",
    label: `Find '${appDisplayName}' via SP-Read`,
    kind: "automatic",
    skipIf: () => (needsM3OrM4() ? false : "M3/M4 not requested"),
    async run() {
      const app = await findAppByDisplayName(readGraph, appDisplayName);
      if (!app) {
        throw new Error(
          `Application '${appDisplayName}' not found. Run setup-test-tenant --apply ` +
            `first, or pass a different --target-app-seq.`,
        );
      }
      if (args.modes.has("M3")) {
        const sp = await findServicePrincipalByAppId(readGraph, app.appId);
        state.m3Target = {
          app,
          sp,
          // assignee filled below
          assignee: { id: "", upn: "", seq: args.m3AssigneeUserSeq },
        };
      }
      if (args.modes.has("M4")) state.m4Target = { app };
      log.info("discovery: m3/m4 app", {
        id: app.id,
        appId: app.appId,
        displayName: app.displayName,
        spPresent: state.m3Target?.sp !== null && state.m3Target?.sp !== undefined,
      });
      return { appId: app.appId, spPresent: state.m3Target?.sp !== null };
    },
  });

  runbook.add({
    id: "discover-m3-assignee",
    label: `Find M3 assignee user (seq ${args.m3AssigneeUserSeq})`,
    kind: "automatic",
    skipIf: () => (args.modes.has("M3") ? false : "M3 not requested"),
    async run() {
      const all = await findCanonicalUsers(readGraph);
      const u = all.find((c) => c.seq === args.m3AssigneeUserSeq);
      if (!u) {
        throw new Error(
          `M3 assignee kq-test-${pad2(args.m3AssigneeUserSeq)} not found. ` +
            `Either re-run setup-test-tenant --apply to create more users, or pass ` +
            `--m3-assignee-user-seq <existing-seq>.`,
        );
      }
      if (state.m3Target) state.m3Target.assignee = u;
      log.info("discovery: m3 assignee", { upn: u.upn, userId: u.id });
      return { upn: u.upn };
    },
  });

  // M3 sometimes requires a service principal to exist for our app. In the
  // vast majority of test tenants (apps created via POST /applications and
  // not yet "enterprised"), it does not. This step creates it via SP-Setup
  // when absent. This produces an incidental "Add service principal" event
  // but that does NOT match any WI-05 change class; we only record the
  // following role-assignment as the M3 MutationAttempt.
  runbook.add({
    id: "m3-ensure-app-sp",
    label: "M3: ensure a service principal exists for the target app (SP-Setup)",
    kind: "automatic",
    requiresApply: true,
    skipIf: () => (args.modes.has("M3") ? false : "M3 not requested"),
    async run() {
      if (!state.m3Target) throw new Error("m3 target missing");
      if (state.m3Target.sp) {
        log.info("m3: app SP already exists", { spId: state.m3Target.sp.id });
        return { created: false, spId: state.m3Target.sp.id };
      }
      const setupCreds = loadSpCredentials("setup");
      const setupGraph = new GraphTransport({
        tokenProvider: tokenProviderFor(setupCreds),
      });
      const res: PostResult<{ id: string; displayName: string }> = await setupGraph.post(
        "/servicePrincipals",
        { appId: state.m3Target.app.appId },
      );
      if (!res.body) throw new Error("/servicePrincipals returned no body");
      state.m3Target.sp = { id: res.body.id, displayName: res.body.displayName };
      log.info("m3: app SP created", { spId: res.body.id });
      return { created: true, spId: res.body.id };
    },
  });

  runbook.add({
    id: "m3-app-role-assignment",
    label: "M3: add app role assignment (user → app SP) via SP-Setup",
    kind: "automatic",
    requiresApply: true,
    skipIf: () => (args.modes.has("M3") ? false : "M3 not requested"),
    async run() {
      if (!state.m3Target || !state.m3Target.sp) throw new Error("m3 target/sp missing");
      const { sp, assignee, app } = state.m3Target;
      const setupCreds = loadSpCredentials("setup");
      const setupGraph = new GraphTransport({
        tokenProvider: tokenProviderFor(setupCreds),
      });
      const path = `/servicePrincipals/${sp.id}/appRoleAssignedTo`;
      const attemptStart = nowIso();
      const attemptT0 = Date.now();
      try {
        const res: PostResult<{ id: string }> = await setupGraph.post(path, {
          principalId: assignee.id,
          resourceId: sp.id,
          appRoleId: CANONICAL.defaultAppRoleId,
        });
        state.attempts.push({
          mutationId: "M3",
          kind: "app-role-assignment",
          attemptIndex: 0,
          requestPath: path,
          startedAt: attemptStart,
          finishedAt: nowIso(),
          elapsedMs: Date.now() - attemptT0,
          httpStatus: res.status,
          outcome: "success",
          ...pickHeaders(res.headers),
          payloadSummary: {
            assigneeUserId: assignee.id,
            assigneeUpn: assignee.upn,
            resourceSpId: sp.id,
            appDisplayName: app.displayName,
            appRoleId: CANONICAL.defaultAppRoleId,
            assignmentId: res.body?.id ?? null,
          },
        });
        log.info("m3: role assigned", { assignmentId: res.body?.id ?? null });
        return { assignmentId: res.body?.id ?? null };
      } catch (err) {
        if (err instanceof GraphRequestError) {
          const cls = classifyGraphError(err);
          state.attempts.push({
            mutationId: "M3",
            kind: "app-role-assignment",
            attemptIndex: 0,
            requestPath: path,
            startedAt: attemptStart,
            finishedAt: nowIso(),
            elapsedMs: Date.now() - attemptT0,
            httpStatus: err.status,
            outcome: cls.outcome,
            errorCategory: cls.errorCategory,
            errorMessage: err.message,
            ...pickHeaders(err.headers),
            payloadSummary: {
              assigneeUserId: assignee.id,
              resourceSpId: sp.id,
              appRoleId: CANONICAL.defaultAppRoleId,
              reason: cls.reason,
            },
          });
          if (cls.outcome === "skipped") {
            log.info("m3: role already assigned", { status: err.status });
            return { alreadyAssigned: true };
          }
        }
        throw err;
      }
    },
  });

  // ── M4: credential add + immediate cleanup (auto-rollback) ────────────
  //
  // One runbook step; internally runs add, THEN always attempts remove,
  // regardless of add's outcome. This prevents test secrets from leaking
  // into the tenant if any later step of THIS step fails mid-way. The
  // audit trail records both add and remove as separate MutationAttempts
  // so the WI-05 analyzer sees both events produced by the class.
  runbook.add({
    id: "m4-credential-cycle",
    label: "M4: add then immediately remove an SP credential (SP-Setup)",
    kind: "automatic",
    requiresApply: true,
    skipIf: () => (args.modes.has("M4") ? false : "M4 not requested"),
    async run() {
      if (!state.m4Target) throw new Error("m4 target missing");
      const setupCreds = loadSpCredentials("setup");
      const setupGraph = new GraphTransport({
        tokenProvider: tokenProviderFor(setupCreds),
      });
      const { app } = state.m4Target;
      const addPath = `/applications/${app.id}/addPassword`;
      const removePath = `/applications/${app.id}/removePassword`;

      // add
      const addStart = nowIso();
      const addT0 = Date.now();
      let createdKeyId: string | null = null;
      try {
        const res: PostResult<{ keyId: string; secretText?: string }> =
          await setupGraph.post(addPath, {
            passwordCredential: { displayName: CANONICAL.m4SecretDisplayName },
          });
        createdKeyId = res.body?.keyId ?? null;
        state.attempts.push({
          mutationId: "M4",
          kind: "sp-credential-add",
          attemptIndex: 0,
          requestPath: addPath,
          startedAt: addStart,
          finishedAt: nowIso(),
          elapsedMs: Date.now() - addT0,
          httpStatus: res.status,
          outcome: "success",
          ...pickHeaders(res.headers),
          payloadSummary: {
            appId: app.id,
            appDisplayName: app.displayName,
            createdKeyId,
            secretDisplayName: CANONICAL.m4SecretDisplayName,
            // NOTE: secretText deliberately NOT persisted in the trail.
          },
        });
        log.info("m4: credential added", { keyId: createdKeyId });
      } catch (err) {
        const outcome =
          err instanceof GraphRequestError ? classifyGraphError(err) : undefined;
        state.attempts.push({
          mutationId: "M4",
          kind: "sp-credential-add",
          attemptIndex: 0,
          requestPath: addPath,
          startedAt: addStart,
          finishedAt: nowIso(),
          elapsedMs: Date.now() - addT0,
          httpStatus: err instanceof GraphRequestError ? err.status : null,
          outcome: outcome?.outcome ?? "failed",
          errorCategory: outcome?.errorCategory ?? "network",
          errorMessage: err instanceof Error ? err.message : String(err),
          ...(err instanceof GraphRequestError ? pickHeaders(err.headers) : {}),
          payloadSummary: { appId: app.id, appDisplayName: app.displayName },
        });
        log.error("m4: credential add failed", err);
        // No remove attempt — no keyId to remove. Rethrow to abort if desired,
        // but this IS the M4 mutation; failure means we still recorded it and
        // the runbook shouldn't abort M3 or M1 results.
        return { added: false, removed: false };
      }

      // remove (always runs if add succeeded)
      if (!createdKeyId) return { added: true, removed: false, skippedRemove: "no keyId" };
      const rmStart = nowIso();
      const rmT0 = Date.now();
      try {
        const res: PostResult = await setupGraph.post(removePath, { keyId: createdKeyId });
        state.attempts.push({
          mutationId: "M4",
          kind: "sp-credential-remove",
          attemptIndex: 1,
          requestPath: removePath,
          startedAt: rmStart,
          finishedAt: nowIso(),
          elapsedMs: Date.now() - rmT0,
          httpStatus: res.status,
          outcome: "success",
          ...pickHeaders(res.headers),
          payloadSummary: {
            appId: app.id,
            removedKeyId: createdKeyId,
          },
        });
        log.info("m4: credential removed", { keyId: createdKeyId });
        return { added: true, removed: true };
      } catch (err) {
        const outcome =
          err instanceof GraphRequestError ? classifyGraphError(err) : undefined;
        state.attempts.push({
          mutationId: "M4",
          kind: "sp-credential-remove",
          attemptIndex: 1,
          requestPath: removePath,
          startedAt: rmStart,
          finishedAt: nowIso(),
          elapsedMs: Date.now() - rmT0,
          httpStatus: err instanceof GraphRequestError ? err.status : null,
          outcome: outcome?.outcome ?? "failed",
          errorCategory: outcome?.errorCategory ?? "network",
          errorMessage: err instanceof Error ? err.message : String(err),
          ...(err instanceof GraphRequestError ? pickHeaders(err.headers) : {}),
          payloadSummary: {
            appId: app.id,
            orphanedKeyId: createdKeyId,
            severity:
              "WARNING: added secret could not be removed. Delete it manually in the portal.",
          },
        });
        log.warn("m4: credential remove failed — orphan secret", {
          keyId: createdKeyId,
          appId: app.id,
        });
        return { added: true, removed: false, orphanedKeyId: createdKeyId };
      }
    },
  });

  const runbookResult = await runbook.execute();

  // ── Synthesize the M2 MutationAttempt from the runbook step result ─────
  //
  // Approval-required steps do not produce their own MutationAttempt
  // because no HTTP request fires. We record one here from the step's
  // status so the WI-05 analyzer has a window + outcome for correlation.
  if (args.modes.has("M2")) {
    const m2Step = runbookResult.steps.find((s) => s.id === "m2-ca-policy-edit");
    if (m2Step && m2Step.status !== "skipped") {
      const outcome: MutationOutcome =
        m2Step.status === "confirmed"
          ? "manual-confirmed"
          : m2Step.status === "failed"
            ? "failed"
            : "manual-declined";
      const finishedAtStamp =
        m2Step.confirmedAt ?? m2Step.finishedAt ?? nowIso();
      state.attempts.push({
        mutationId: "M2",
        kind: "ca-policy-edit",
        attemptIndex: 0,
        requestPath: state.caPolicy
          ? `/identity/conditionalAccess/policies/${state.caPolicy.id}`
          : undefined,
        startedAt,
        finishedAt: finishedAtStamp,
        elapsedMs: Math.max(0, new Date(finishedAtStamp).getTime() - t0),
        httpStatus: null,
        outcome,
        errorMessage: m2Step.error?.message,
        payloadSummary: {
          caPolicyId: state.caPolicy?.id ?? null,
          caPolicyName: state.caPolicy?.displayName ?? args.caPolicyName,
          confirmedBy: m2Step.confirmedBy ?? null,
          mechanism: "portal-edit-by-operator",
        },
      });
    } else if (m2Step && m2Step.status === "skipped") {
      // skipIf kept M2 out of this run, or runbook aborted earlier.
      state.attempts.push({
        mutationId: "M2",
        kind: "ca-policy-edit",
        attemptIndex: 0,
        startedAt,
        finishedAt: nowIso(),
        elapsedMs: Date.now() - t0,
        httpStatus: null,
        outcome: "skipped",
        errorMessage: m2Step.skipReason,
        payloadSummary: {
          caPolicyName: state.caPolicy?.displayName ?? args.caPolicyName,
          mechanism: "portal-edit-by-operator",
        },
      });
    }
  }

  const finishedAt = nowIso();
  const elapsedMs = Date.now() - t0;

  const trail: MutationTrail = {
    runMetadata: {
      script: "trigger-canonical-mutations",
      runId,
      correlationId: currentCorrelationId() ?? runId,
      tenantId: readCreds.tenantId,
      privilegedGroupId: state.privilegedGroupId,
      startedAt,
      finishedAt,
      elapsedMs,
      dryRun: !args.dryRun.apply,
      dryRunReason: args.dryRun.reason,
      modes: Array.from(args.modes),
    },
    attempts: state.attempts,
    summary: buildSummary(state.attempts),
    runbook: runbookResult,
  };

  const outPath = resolve(args.output);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(trail, null, 2), "utf-8");
  log.info("wrote mutation trail", { path: outPath, bytes: JSON.stringify(trail).length });

  log.info("complete", {
    elapsedMs,
    aborted: runbookResult.aborted,
    abortReason: runbookResult.abortReason,
    summary: trail.summary,
  });
}

withContext({ correlationId: newCorrelationId() }, runScript).catch((err: unknown) => {
  rootLogger.error("trigger-canonical-mutations failed", err);
  const code = isPlatformError(err) && err.code === "CONFIG_MISSING"
    ? ExitCodes.CONFIG
    : ExitCodes.UNEXPECTED;
  process.exit(code);
});
