/**
 * WI-06 helper: Microsoft Graph remove-member spike.
 *
 * Produces decision-grade evidence for the only v1 write action:
 *   DELETE /groups/{groupId}/members/{memberId}/$ref
 *
 * This is a SPIKE UTILITY. It is not the execution service and it does
 * not implement approval, planning, or audit persistence. It uses
 * SP-Execute credentials loaded at the script edge (see lib/credentials.ts).
 *
 * Modes:
 *   reliability   — attempt removals one by one; classify outcomes.
 *   idempotency   — attempt removals of already-absent members; expect 404.
 *   timing        — latency-focused run; emits p50/p95/p99.
 *   rate-limit    — controlled burst; detect 429 + Retry-After.
 *   all           — reliability → idempotency → timing. Rate-limit is opt-in only.
 *
 * Dry-run is the default. --apply enables real DELETE calls. DRY_RUN=1
 * env forces dry-run regardless of --apply (ops safety net). --dry-run
 * is accepted as an explicit flag and overrides --apply.
 *
 * Source of truth for success criteria:
 *   docs/PHASE0_SPIKE_SPECS.md §Spike 2
 *   docs/PHASE0_EXECUTION_BOARD.md §WI-06
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
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
  type ResponseHeadersSummary,
} from "./lib/transport.js";

// ─── CLI ───────────────────────────────────────────────────────────────────

type Mode = "reliability" | "idempotency" | "timing" | "rate-limit" | "all";

interface Args {
  mode: Mode;
  groupId: string;
  memberIds: string[];
  output: string | null;
  dryRun: DryRunContext;
  burstSize: number;
  burstStopOn429: boolean;
}

function parseArgs(argv: string[]): Args {
  let mode: Mode = "reliability";
  let groupId = "";
  let membersFile: string | null = null;
  const inlineMembers: string[] = [];
  let output: string | null = null;
  let burstSize = 50;
  let burstStopOn429 = true;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(usage());
      process.exit(ExitCodes.OK);
    } else if (arg === "--mode") {
      mode = parseMode(requireValue(argv, ++i, "--mode"));
    } else if (arg === "--group-id") {
      groupId = requireValue(argv, ++i, "--group-id");
    } else if (arg === "--members-file") {
      membersFile = requireValue(argv, ++i, "--members-file");
    } else if (arg === "--member-id") {
      inlineMembers.push(requireValue(argv, ++i, "--member-id"));
    } else if (arg === "--output") {
      output = requireValue(argv, ++i, "--output");
    } else if (arg === "--burst-size") {
      burstSize = Number(requireValue(argv, ++i, "--burst-size"));
      if (!Number.isInteger(burstSize) || burstSize <= 0 || burstSize > 200) {
        failUsage(`--burst-size must be an integer in [1, 200]`);
      }
    } else if (arg === "--no-stop-on-429") {
      burstStopOn429 = false;
    } else if (arg === "--apply" || arg === "--dry-run") {
      // Handled by parseDryRunFlag / post-parse override below.
      continue;
    } else {
      failUsage(`Unknown argument: ${arg}`);
    }
  }

  if (!groupId) failUsage("--group-id is required");

  const fileMembers = membersFile ? readMembersFile(membersFile) : [];
  const memberIds = [...inlineMembers, ...fileMembers];
  if (memberIds.length === 0) {
    failUsage("No members provided: pass --member-id <id> (repeatable) or --members-file <path>");
  }

  const dryRun = parseDryRunFlag(argv);
  if (argv.includes("--dry-run")) {
    // Explicit --dry-run wins over --apply. Extra safety for WI-06.
    dryRun.apply = false;
    dryRun.reason = "explicit --dry-run";
  }

  return {
    mode,
    groupId,
    memberIds,
    output,
    dryRun,
    burstSize,
    burstStopOn429,
  };
}

function parseMode(raw: string): Mode {
  const allowed: Mode[] = ["reliability", "idempotency", "timing", "rate-limit", "all"];
  if ((allowed as string[]).includes(raw)) return raw as Mode;
  failUsage(`--mode must be one of ${allowed.join(", ")}; got "${raw}"`);
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value) failUsage(`${flag} requires a value`);
  return value;
}

function readMembersFile(path: string): string[] {
  const abs = resolve(path);
  const raw = readFileSync(abs, "utf-8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function failUsage(message: string): never {
  process.stderr.write(`${message}\n\n${usage()}`);
  process.exit(ExitCodes.USAGE);
}

function usage(): string {
  return [
    "Usage: npm run test-member-removal -- \\",
    "  --mode <reliability|idempotency|timing|rate-limit|all> \\",
    "  --group-id <groupObjectId> \\",
    "  (--members-file <path> | --member-id <id> [--member-id <id> ...]) \\",
    "  [--output <path>] [--apply] [--dry-run]",
    "",
    "  --mode MODE        Scenario to run. Default: reliability.",
    "  --group-id ID      Graph object ID of the target group.",
    "  --members-file P   Newline-separated file of member object IDs. '#' comments ok.",
    "  --member-id ID     Repeatable member object ID (in addition to/instead of file).",
    "  --output PATH      Write structured spike result as JSON. Default: stdout.",
    "  --apply            Perform real DELETEs. Without this flag, runs in dry-run.",
    "  --dry-run          Force dry-run; wins over --apply.",
    "  --burst-size N     rate-limit mode only: max concurrent-ish DELETEs (default 50, cap 200).",
    "  --no-stop-on-429   rate-limit mode only: keep going past the first 429. Default: stop.",
    "",
    "Env DRY_RUN=1 forces dry-run regardless of --apply.",
    "Required env: SP_EXECUTE_TENANT_ID, SP_EXECUTE_CLIENT_ID, plus",
    "              SP_EXECUTE_CERTIFICATE_PATH (preferred) or SP_EXECUTE_CLIENT_SECRET.",
    "",
    "Evidence collected per attempt: HTTP status, Graph request-id / client-request-id,",
    "Retry-After on 429, elapsed ms, outcome classification.",
    "",
  ].join("\n");
}

// ─── Result model ──────────────────────────────────────────────────────────

type Outcome = "removed" | "already-absent" | "failed" | "unknown";
type ErrorCategory =
  | "rate-limited"
  | "forbidden"
  | "unauthorized"
  | "not-found-but-unexpected"
  | "server-error"
  | "client-error"
  | "network"
  | "other";

interface RemovalAttempt {
  memberId: string;
  startedAt: string;
  finishedAt: string;
  elapsedMs: number;
  httpStatus: number | null;
  outcome: Outcome;
  errorCategory?: ErrorCategory;
  errorMessage?: string;
  requestId?: string;
  clientRequestId?: string;
  retryAfterSec?: number;
}

interface LatencySummary {
  count: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  p50: number | null;
  p95: number | null;
  p99: number | null;
}

interface RateLimitSummary {
  observed: boolean;
  firstObservedAtAttempt: number | null;
  maxRetryAfterSec: number | null;
  count429: number;
}

interface RunMetadata {
  script: "test-member-removal";
  mode: Mode;
  runId: string;
  correlationId: string;
  tenantId: string;
  groupId: string;
  dryRun: boolean;
  dryRunReason?: string;
  startedAt: string;
  finishedAt: string;
  elapsedMs: number;
  memberCountProvided: number;
  spKind: "execute";
}

interface SampleCounts {
  attempted: number;
  removed: number;
  alreadyAbsent: number;
  failed: number;
  unknown: number;
}

interface SpikeResult {
  runMetadata: RunMetadata;
  sampleCounts: SampleCounts;
  latencySummary: LatencySummary;
  rateLimit: RateLimitSummary;
  attempts: RemovalAttempt[];
  observations: string[];
  recommendations: string[];
}

// ─── Removal + classification ──────────────────────────────────────────────

async function attemptRemoval(
  graph: GraphTransport,
  groupId: string,
  memberId: string,
  dryRun: DryRunContext,
): Promise<RemovalAttempt> {
  const startedAt = nowIso();
  const t0 = Date.now();

  if (!dryRun.apply) {
    const finishedAt = nowIso();
    return {
      memberId,
      startedAt,
      finishedAt,
      elapsedMs: Date.now() - t0,
      httpStatus: null,
      outcome: "unknown",
      errorCategory: "other",
      errorMessage: "dry-run: DELETE not sent",
    };
  }

  const path = `/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(
    memberId,
  )}/$ref`;

  try {
    const res: DeleteResult = await graph.delete(path);
    const finishedAt = nowIso();
    return {
      memberId,
      startedAt,
      finishedAt,
      elapsedMs: Date.now() - t0,
      httpStatus: res.status,
      outcome: res.status === 204 || res.status === 200 ? "removed" : "unknown",
      ...pickHeaderFields(res.headers),
    };
  } catch (err: unknown) {
    const finishedAt = nowIso();
    const base = {
      memberId,
      startedAt,
      finishedAt,
      elapsedMs: Date.now() - t0,
    };
    if (err instanceof GraphRequestError) {
      return {
        ...base,
        httpStatus: err.status,
        outcome: classifyOutcome(err.status),
        errorCategory: classifyErrorCategory(err.status),
        errorMessage: truncate(err.message, 500),
        ...pickHeaderFields(err.headers),
      };
    }
    // Non-Graph error: DNS, fetch abort, token failure, etc.
    return {
      ...base,
      httpStatus: null,
      outcome: "unknown",
      errorCategory: classifyNonGraphError(err),
      errorMessage: truncate(stringifyError(err), 500),
    };
  }
}

function classifyOutcome(status: number): Outcome {
  if (status === 204 || status === 200) return "removed";
  if (status === 404) return "already-absent";
  if (status >= 400) return "failed";
  return "unknown";
}

function classifyErrorCategory(status: number): ErrorCategory {
  if (status === 429) return "rate-limited";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not-found-but-unexpected";
  if (status >= 500) return "server-error";
  if (status >= 400) return "client-error";
  return "other";
}

function classifyNonGraphError(err: unknown): ErrorCategory {
  const msg = stringifyError(err).toLowerCase();
  if (msg.includes("timeout") || msg.includes("timed out")) return "network";
  if (msg.includes("enotfound") || msg.includes("econnrefused") || msg.includes("fetch failed")) {
    return "network";
  }
  return "other";
}

function pickHeaderFields(h: ResponseHeadersSummary): {
  requestId?: string;
  clientRequestId?: string;
  retryAfterSec?: number;
} {
  const out: { requestId?: string; clientRequestId?: string; retryAfterSec?: number } = {};
  if (h.requestId) out.requestId = h.requestId;
  if (h.clientRequestId) out.clientRequestId = h.clientRequestId;
  if (typeof h.retryAfterSec === "number") out.retryAfterSec = h.retryAfterSec;
  return out;
}

function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

// ─── Mode runners ──────────────────────────────────────────────────────────

async function runReliability(
  graph: GraphTransport,
  args: Args,
  log: Logger,
): Promise<RemovalAttempt[]> {
  log.info("reliability: start", {
    groupId: args.groupId,
    members: args.memberIds.length,
  });
  const attempts: RemovalAttempt[] = [];
  for (const memberId of args.memberIds) {
    const attempt = await attemptRemoval(graph, args.groupId, memberId, args.dryRun);
    attempts.push(attempt);
    log.info("reliability: attempt", {
      memberId,
      outcome: attempt.outcome,
      status: attempt.httpStatus,
      elapsedMs: attempt.elapsedMs,
    });
  }
  return attempts;
}

async function runIdempotency(
  graph: GraphTransport,
  args: Args,
  log: Logger,
): Promise<RemovalAttempt[]> {
  log.info("idempotency: start (expecting 404 on every attempt)", {
    groupId: args.groupId,
    members: args.memberIds.length,
  });
  const attempts: RemovalAttempt[] = [];
  for (const memberId of args.memberIds) {
    const attempt = await attemptRemoval(graph, args.groupId, memberId, args.dryRun);
    attempts.push(attempt);
    const idempotent = attempt.outcome === "already-absent";
    log.info("idempotency: attempt", {
      memberId,
      outcome: attempt.outcome,
      status: attempt.httpStatus,
      idempotent,
    });
  }
  return attempts;
}

async function runTiming(
  graph: GraphTransport,
  args: Args,
  log: Logger,
): Promise<RemovalAttempt[]> {
  log.info("timing: start", {
    groupId: args.groupId,
    members: args.memberIds.length,
  });
  return runReliability(graph, args, log);
}

async function runRateLimit(
  graph: GraphTransport,
  args: Args,
  log: Logger,
): Promise<{ attempts: RemovalAttempt[]; observations: string[] }> {
  const observations: string[] = [];
  log.warn("rate-limit: controlled burst mode; intended for already-absent members only", {
    burstSize: args.burstSize,
    stopOn429: args.burstStopOn429,
  });
  observations.push(
    `Rate-limit mode sends up to ${args.burstSize} DELETEs with 0ms inter-request delay. ` +
      "Use only against a list of already-absent member IDs so no real membership is touched.",
  );

  const pool = args.memberIds.slice(0, args.burstSize);
  if (pool.length < args.burstSize) {
    observations.push(
      `Burst size ${args.burstSize} requested but only ${pool.length} member IDs provided; using ${pool.length}.`,
    );
  }

  const attempts: RemovalAttempt[] = [];
  let first429AtAttempt: number | null = null;

  for (let i = 0; i < pool.length; i += 1) {
    const memberId = pool[i]!;
    const attempt = await attemptRemoval(graph, args.groupId, memberId, args.dryRun);
    attempts.push(attempt);
    log.info("rate-limit: attempt", {
      attemptIndex: i,
      outcome: attempt.outcome,
      status: attempt.httpStatus,
      elapsedMs: attempt.elapsedMs,
      retryAfterSec: attempt.retryAfterSec,
    });
    if (attempt.httpStatus === 429) {
      first429AtAttempt ??= i;
      if (args.burstStopOn429) {
        observations.push(
          `First 429 observed at attempt index ${i}. Stopping burst (pass --no-stop-on-429 to continue).`,
        );
        break;
      }
    }
    // A tiny yield to keep the event loop from starving; not a rate cap.
    if (i % 10 === 9) await sleep(0);
  }

  if (first429AtAttempt === null) {
    observations.push(
      `No 429 observed across ${attempts.length} rapid DELETEs. ` +
        "Either within the current Graph budget or the path is not the rate-limit hot spot.",
    );
  }
  return { attempts, observations };
}

// ─── Summarization ─────────────────────────────────────────────────────────

function summarizeSamples(attempts: RemovalAttempt[]): SampleCounts {
  const counts: SampleCounts = {
    attempted: attempts.length,
    removed: 0,
    alreadyAbsent: 0,
    failed: 0,
    unknown: 0,
  };
  for (const a of attempts) {
    if (a.outcome === "removed") counts.removed += 1;
    else if (a.outcome === "already-absent") counts.alreadyAbsent += 1;
    else if (a.outcome === "failed") counts.failed += 1;
    else counts.unknown += 1;
  }
  return counts;
}

function summarizeLatency(attempts: RemovalAttempt[]): LatencySummary {
  // Only count attempts that actually received an HTTP response. Skip
  // dry-run and network-level unknown outcomes so latency stats reflect
  // real server-side behavior.
  const samples = attempts
    .filter((a) => typeof a.httpStatus === "number")
    .map((a) => a.elapsedMs)
    .sort((a, b) => a - b);

  if (samples.length === 0) {
    return { count: 0, min: null, max: null, mean: null, p50: null, p95: null, p99: null };
  }
  const sum = samples.reduce((acc, v) => acc + v, 0);
  return {
    count: samples.length,
    min: samples[0]!,
    max: samples[samples.length - 1]!,
    mean: Math.round(sum / samples.length),
    p50: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
    p99: percentile(samples, 0.99),
  };
}

function percentile(sortedAscending: number[], p: number): number {
  // Nearest-rank; fine for spike-scale samples (tens to low hundreds).
  if (sortedAscending.length === 0) return 0;
  const rank = Math.ceil(p * sortedAscending.length);
  const idx = Math.max(0, Math.min(sortedAscending.length - 1, rank - 1));
  return sortedAscending[idx]!;
}

function summarizeRateLimit(attempts: RemovalAttempt[]): RateLimitSummary {
  let first: number | null = null;
  let maxRetry: number | null = null;
  let count429 = 0;
  for (let i = 0; i < attempts.length; i += 1) {
    const a = attempts[i]!;
    if (a.httpStatus === 429) {
      count429 += 1;
      first ??= i;
      if (typeof a.retryAfterSec === "number") {
        maxRetry = Math.max(maxRetry ?? 0, a.retryAfterSec);
      }
    }
  }
  return {
    observed: count429 > 0,
    firstObservedAtAttempt: first,
    maxRetryAfterSec: maxRetry,
    count429,
  };
}

function deriveRecommendations(result: Omit<SpikeResult, "recommendations">): string[] {
  const recs: string[] = [];
  const { runMetadata, sampleCounts, latencySummary, rateLimit } = result;

  if (runMetadata.dryRun) {
    recs.push(
      "Dry-run only: no live Graph behavior measured. Rerun with --apply in the test tenant to produce decision-grade evidence.",
    );
    return recs;
  }

  if (runMetadata.mode === "reliability" || runMetadata.mode === "all") {
    if (sampleCounts.attempted > 0 && sampleCounts.removed === sampleCounts.attempted) {
      recs.push("Reliability: 100% success rate observed across attempted removals.");
    } else if (sampleCounts.failed > 0) {
      recs.push(
        `Reliability: ${sampleCounts.failed}/${sampleCounts.attempted} failed. Inspect attempts[*].errorCategory before green-lighting v1 scope.`,
      );
    }
  }

  if (runMetadata.mode === "idempotency" || runMetadata.mode === "all") {
    if (sampleCounts.alreadyAbsent === sampleCounts.attempted && sampleCounts.attempted > 0) {
      recs.push(
        "Idempotency: every absent-member DELETE returned 404 as expected. Safe to treat 404 as success in execution logic.",
      );
    } else if (sampleCounts.removed > 0) {
      recs.push(
        "Idempotency: at least one absent-member DELETE did not return 404. Treat as ambiguous; do not ship without further investigation.",
      );
    }
  }

  if (latencySummary.p95 !== null) {
    const p95Sec = (latencySummary.p95 / 1000).toFixed(2);
    if (latencySummary.p95 < 2000) {
      recs.push(`Latency: p95 = ${p95Sec}s (meets WI-06 < 2s target).`);
    } else {
      recs.push(`Latency: p95 = ${p95Sec}s exceeds the 2s WI-06 target.`);
    }
  }

  if (runMetadata.mode === "rate-limit" || runMetadata.mode === "all") {
    if (rateLimit.observed) {
      recs.push(
        `Rate-limit: 429 observed first at attempt index ${rateLimit.firstObservedAtAttempt}; ` +
          `max Retry-After = ${rateLimit.maxRetryAfterSec ?? "n/a"}s. Implement backoff before shipping.`,
      );
    } else {
      recs.push(
        "Rate-limit: no 429 observed within the burst. Re-run with --no-stop-on-429 and larger --burst-size if tighter headroom matters.",
      );
    }
  }

  return recs;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function runScript(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  loadDotenvCascade();

  const runId = newId("run");
  const log = createLogger({
    bindings: { script: "test-member-removal", runId, mode: args.mode },
  });

  const startedAt = nowIso();
  const t0 = Date.now();

  log.info("starting", {
    mode: args.mode,
    groupId: args.groupId,
    memberCount: args.memberIds.length,
    dryRun: !args.dryRun.apply,
    dryRunReason: args.dryRun.reason,
    output: args.output ?? "stdout",
  });

  if (!args.dryRun.apply) {
    log.warn(
      "dry-run: DELETE requests will NOT be sent. Rerun with --apply in the test tenant to collect real evidence.",
    );
  }

  const creds = loadSpCredentials("execute");
  const graph = new GraphTransport({ tokenProvider: tokenProviderFor(creds) });

  const allAttempts: RemovalAttempt[] = [];
  const observations: string[] = [];

  const runModes: Mode[] = args.mode === "all"
    ? ["reliability", "idempotency", "timing"]
    : [args.mode];

  for (const mode of runModes) {
    if (mode === "reliability") {
      allAttempts.push(...(await runReliability(graph, args, log)));
    } else if (mode === "idempotency") {
      allAttempts.push(...(await runIdempotency(graph, args, log)));
    } else if (mode === "timing") {
      allAttempts.push(...(await runTiming(graph, args, log)));
    } else if (mode === "rate-limit") {
      const out = await runRateLimit(graph, args, log);
      allAttempts.push(...out.attempts);
      observations.push(...out.observations);
    }
  }

  const finishedAt = nowIso();
  const elapsedMs = Date.now() - t0;

  const runMetadata: RunMetadata = {
    script: "test-member-removal",
    mode: args.mode,
    runId,
    correlationId: currentCorrelationId() ?? runId,
    tenantId: creds.tenantId,
    groupId: args.groupId,
    dryRun: !args.dryRun.apply,
    dryRunReason: args.dryRun.reason,
    startedAt,
    finishedAt,
    elapsedMs,
    memberCountProvided: args.memberIds.length,
    spKind: "execute",
  };

  const resultSansRecs: Omit<SpikeResult, "recommendations"> = {
    runMetadata,
    sampleCounts: summarizeSamples(allAttempts),
    latencySummary: summarizeLatency(allAttempts),
    rateLimit: summarizeRateLimit(allAttempts),
    attempts: allAttempts,
    observations,
  };

  const result: SpikeResult = {
    ...resultSansRecs,
    recommendations: deriveRecommendations(resultSansRecs),
  };

  log.info("complete", {
    elapsedMs,
    sampleCounts: result.sampleCounts,
    latency: result.latencySummary,
    rateLimit: result.rateLimit,
  });

  const payload = JSON.stringify(result, null, 2);
  if (args.output) {
    const outPath = resolve(args.output);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, payload, "utf-8");
    log.info("wrote output file", { path: outPath, bytes: Buffer.byteLength(payload) });
  } else {
    // stdout stays clean: only the JSON result. Logs go to stderr.
    process.stdout.write(payload);
    process.stdout.write("\n");
  }
}

withContext({ correlationId: newCorrelationId() }, runScript).catch((err: unknown) => {
  rootLogger.error("test-member-removal failed", err);
  const code = isPlatformError(err) && err.code === "CONFIG_MISSING"
    ? ExitCodes.CONFIG
    : ExitCodes.UNEXPECTED;
  process.exit(code);
});
