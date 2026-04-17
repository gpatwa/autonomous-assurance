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
};

type MutationId = "M1" | "M2" | "M3" | "M4";

// ─── CLI ───────────────────────────────────────────────────────────────────

interface Args {
  dryRun: DryRunContext;
  output: string;
  memberCount: number;
  memberStartSeq: number;
  modes: Set<MutationId>;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    dryRun: parseDryRunFlag(argv),
    output: "./wi05/mutation-trail.json",
    memberCount: 12,
    memberStartSeq: 5,
    modes: new Set<MutationId>(["M1"]), // commit 1: M1 only; commits 2+3 extend
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
    "  --mode <M1|M2|M3|M4|all,...>  Which mutations to run (default: M1 — commits 2 and 3 add the rest).",
    "  --member-count N              M1: members to add (default: 12).",
    "  --member-start-seq N          M1: starting UPN seq (default: 5).",
    "",
    "Manual-step confirmation (CA policy in commit 2; portal steps):",
    "  --confirm-manual-step <id>    Pre-confirm the named step (repeatable).",
    "  --confirm-all-manual          Pre-confirm every manual / approval-required step.",
    "",
    "Env DRY_RUN=1 forces dry-run regardless of --apply.",
    "",
    "Required env (commit 1):",
    "  SP_READ_*   — discovery of privileged group + candidate users",
    "  SP_EXECUTE_* — M1 add-member writes (so events carry initiatedBy.app)",
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

// ─── Main ──────────────────────────────────────────────────────────────────

interface ScriptState {
  privilegedGroupId: string | null;
  m1Candidates: CandidateUser[];
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

  const runbookResult = await runbook.execute();

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
