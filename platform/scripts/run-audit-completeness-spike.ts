/**
 * WI-05 orchestrator: Entra audit-log completeness spike.
 *
 * Orchestrates the full evidence-gathering flow:
 *   1. (optional) print the canonical mutation checklist
 *   2. wait for operator confirmation that mutations were executed
 *   3. wait --wait-minutes for audit propagation (default 15)
 *   4. fetch /auditLogs/directoryAudits for the resulting window
 *   5. analyze events across 4 change classes
 *   6. write raw-events.json, audit-completeness-matrix.json, and
 *      audit-completeness-summary.md into the output directory
 *
 * The script does NOT execute the canonical mutations itself. Triggering
 * them with the agent-identified SP (to reproduce the agent-change
 * signature) is manual by design — the spike is about evidence, not
 * automation of risky writes.
 *
 * Alternative flows:
 *   --start / --end        skip checklist + wait; fetch window directly
 *   --skip-fetch           skip fetch; re-analyze an existing raw-events.json
 *   --skip-analysis        fetch only
 *   --mutation-checklist   print the checklist to stdout and exit
 *   --confirm-mutations    skip the interactive "have you done the mutations?" prompt
 *
 * Source of truth: docs/PHASE0_SPIKE_SPECS.md §Spike 1,
 *                  docs/PHASE0_EXECUTION_BOARD.md §WI-05.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  ExitCodes,
  HOUR_MS,
  MINUTE_MS,
  createLogger,
  currentCorrelationId,
  isPlatformError,
  isoMinus,
  isoPlus,
  loadDotenvCascade,
  newCorrelationId,
  newId,
  nowIso,
  parseIso,
  rootLogger,
  withContext,
  type Logger,
} from "@kavachiq/platform";

import { loadSpCredentials, tokenProviderFor } from "./lib/credentials.js";
import { GraphTransport } from "./lib/transport.js";
import {
  Runbook,
  parseConfirmationFlags,
  type RunbookResult,
} from "./lib/runbook.js";

// ─── CLI ───────────────────────────────────────────────────────────────────

interface Args {
  start: string | null;
  end: string | null;
  waitMinutes: number;
  outputDir: string | null;
  dryRun: boolean;
  skipFetch: boolean;
  skipAnalysis: boolean;
  mutationChecklist: boolean;
  confirmMutations: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    start: null,
    end: null,
    waitMinutes: 15,
    outputDir: null,
    dryRun: false,
    skipFetch: false,
    skipAnalysis: false,
    mutationChecklist: false,
    confirmMutations: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(usage());
      process.exit(ExitCodes.OK);
    } else if (arg === "--start") args.start = requireValue(argv, ++i, "--start");
    else if (arg === "--end") args.end = requireValue(argv, ++i, "--end");
    else if (arg === "--wait-minutes") {
      args.waitMinutes = Number(requireValue(argv, ++i, "--wait-minutes"));
      if (!Number.isFinite(args.waitMinutes) || args.waitMinutes < 0) {
        failUsage("--wait-minutes must be a non-negative number");
      }
    } else if (arg === "--output-dir") {
      args.outputDir = requireValue(argv, ++i, "--output-dir");
    } else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--skip-fetch") args.skipFetch = true;
    else if (arg === "--skip-analysis") args.skipAnalysis = true;
    else if (arg === "--mutation-checklist") args.mutationChecklist = true;
    else if (arg === "--confirm-mutations") args.confirmMutations = true;
    else if (arg === "--confirm-all-manual") continue; // handled by parseConfirmationFlags
    else if (arg === "--confirm-manual-step") {
      i += 1; // consume value
      continue;
    } else failUsage(`Unknown argument: ${arg}`);
  }
  if (args.start) validateIso(args.start, "--start");
  if (args.end) validateIso(args.end, "--end");
  if (args.start && args.end && parseIso(args.start) >= parseIso(args.end)) {
    failUsage("--start must be earlier than --end");
  }
  return args;
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value) failUsage(`${flag} requires a value`);
  return value;
}

function validateIso(value: string, flag: string): void {
  try {
    parseIso(value);
  } catch {
    failUsage(`${flag} is not a valid ISO-8601 datetime: ${value}`);
  }
}

function failUsage(message: string): never {
  process.stderr.write(`${message}\n\n${usage()}`);
  process.exit(ExitCodes.USAGE);
}

function usage(): string {
  return [
    "Usage: npm run audit-completeness-spike -- [options]",
    "",
    "  --output-dir PATH      Directory for raw-events.json, audit-completeness-matrix.json, audit-completeness-summary.md.",
    "  --start ISO            Skip the checklist + wait; fetch events from this time.",
    "  --end ISO              End of window; paired with --start.",
    "  --wait-minutes N       Propagation wait (default 15) when running the full flow.",
    "  --mutation-checklist   Print the canonical mutation checklist to stdout and exit.",
    "  --confirm-mutations    Skip the interactive 'have you done the mutations?' prompt.",
    "  --skip-fetch           Use an existing raw-events.json in --output-dir; skip the Graph call.",
    "  --skip-analysis        Fetch only; do not produce the matrix or summary.",
    "  --dry-run              Print the plan and exit without fetching or waiting.",
    "",
    "Manual-step confirmation (CA policies, Teams, SharePoint, admin consent):",
    "  --confirm-manual-step <id>   Mark the named approval-required step as operator-confirmed.",
    "                               Repeatable. Step IDs: confirm-M1-group-membership,",
    "                               confirm-M2-conditional-access, confirm-M3-app-role-assignment,",
    "                               confirm-M4-sp-credential.",
    "  --confirm-all-manual         Mark every approval-required step as operator-confirmed.",
    "                               Equivalent to --confirm-mutations for backward compatibility.",
    "",
    "Required env: SP_READ_TENANT_ID, SP_READ_CLIENT_ID, plus",
    "              SP_READ_CERTIFICATE_PATH (preferred) or SP_READ_CLIENT_SECRET.",
    "",
  ].join("\n");
}

// ─── Canonical mutation checklist ──────────────────────────────────────────

const MUTATION_CHECKLIST = [
  {
    id: "M1-group-membership",
    title: "Group membership change (x12)",
    description:
      "Using the agent-identified SP, add 12 users to Finance-Privileged-Access. " +
      "Use SP-Execute credentials (or a dedicated test agent SP) so the resulting " +
      "events carry initiatedBy.app, not initiatedBy.user. Record the 12 member IDs.",
    changeClass: "group-membership",
  },
  {
    id: "M2-conditional-access",
    title: "Conditional Access policy change (x1)",
    description:
      "In the Entra admin portal, edit one of the existing test CA policies " +
      "(e.g. Finance-MFA-Bypass): toggle the display name, or add a benign " +
      "condition and revert it. The goal is a single policy-modified audit event.",
    changeClass: "conditional-access",
  },
  {
    id: "M3-app-role-assignment",
    title: "App role assignment change (x1)",
    description:
      "Assign an app role to one of the test users/groups/SPs. Admin portal path: " +
      "Enterprise Applications → pick a test app → Users and groups → Add. Record " +
      "the resulting appRoleAssignment id.",
    changeClass: "app-role-assignment",
  },
  {
    id: "M4-sp-credential",
    title: "Service principal credential change (x1)",
    description:
      "Add a new client secret (or certificate) to one of the test app registrations. " +
      "Admin portal path: App registrations → pick KavachiqTest-App-01 → Certificates & secrets → New client secret. " +
      "Delete the secret immediately after the event is captured.",
    changeClass: "sp-credential",
  },
] as const;

function printChecklistToStream(stream: NodeJS.WriteStream): void {
  stream.write("─── WI-05 canonical mutation checklist ───\n\n");
  for (const item of MUTATION_CHECKLIST) {
    stream.write(`[${item.id}] ${item.title}\n`);
    for (const line of wrap(item.description, 78)) {
      stream.write(`  ${line}\n`);
    }
    stream.write("\n");
  }
}

function wrap(text: string, cols: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    if ((current + " " + w).trim().length > cols) {
      lines.push(current);
      current = w;
    } else {
      current = (current ? current + " " : "") + w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ─── Analyzer ──────────────────────────────────────────────────────────────

type ChangeClassKey =
  | "group-membership"
  | "conditional-access"
  | "app-role-assignment"
  | "sp-credential";

interface ChangeClassMatcher {
  key: ChangeClassKey;
  label: string;
  matchers: Array<(ev: AuditEvent) => boolean>;
}

interface ModifiedProperty {
  displayName?: string;
  oldValue?: string | null;
  newValue?: string | null;
}

interface TargetResource {
  id?: string;
  displayName?: string;
  type?: string;
  modifiedProperties?: ModifiedProperty[];
}

interface AuditEvent {
  id?: string;
  category?: string;
  activityDisplayName?: string;
  activityDateTime?: string;
  operationType?: string;
  result?: string;
  initiatedBy?: { user?: unknown; app?: unknown };
  targetResources?: TargetResource[];
}

function activityMatches(fragments: string[]): (ev: AuditEvent) => boolean {
  const lower = fragments.map((f) => f.toLowerCase());
  return (ev) => {
    const a = (ev.activityDisplayName ?? "").toLowerCase();
    return lower.some((f) => a.includes(f));
  };
}

const CHANGE_CLASSES: ChangeClassMatcher[] = [
  {
    key: "group-membership",
    label: "Group membership change",
    matchers: [activityMatches(["add member to group", "remove member from group"])],
  },
  {
    key: "conditional-access",
    label: "Conditional Access policy change",
    matchers: [
      activityMatches([
        "conditional access policy",
      ]),
      (ev) => (ev.category ?? "").toLowerCase() === "policy" &&
        (ev.activityDisplayName ?? "").toLowerCase().includes("conditional access"),
    ],
  },
  {
    key: "app-role-assignment",
    label: "App role assignment change",
    matchers: [
      activityMatches([
        "app role assignment",
      ]),
    ],
  },
  {
    key: "sp-credential",
    label: "Service principal credential change",
    matchers: [
      activityMatches([
        "certificates and secrets management",
        "update service principal",
        "update application – certificates and secrets management",
        "update application - certificates and secrets management",
      ]),
    ],
  },
];

interface ClassFinding {
  key: ChangeClassKey;
  label: string;
  matchCount: number;
  withModifiedProperties: number;
  withOldValue: number;
  withNewValue: number;
  withBothOldAndNew: number;
  beforeStateAssessment: "authoritative" | "partial" | "absent" | "unknown";
  anomalies: string[];
  sampleEventIds: string[];
}

interface CompletenessMatrix {
  runMetadata: {
    script: "run-audit-completeness-spike";
    runId: string;
    correlationId: string;
    tenantId: string;
    startedAt: string;
    finishedAt: string;
    elapsedMs: number;
    window: { start: string; end: string };
  };
  totalEvents: number;
  unmatchedEventCount: number;
  findings: ClassFinding[];
  overallBeforeStateRecommendation: string;
}

function classifyMatch(ev: AuditEvent): ChangeClassKey | null {
  for (const cls of CHANGE_CLASSES) {
    if (cls.matchers.some((m) => m(ev))) return cls.key;
  }
  return null;
}

function isUsable(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed === "[]" || trimmed === '""' || trimmed === "null") return false;
  return true;
}

function analyzeFinding(
  cls: ChangeClassMatcher,
  matched: AuditEvent[],
): ClassFinding {
  const anomalies = new Set<string>();
  let withModifiedProperties = 0;
  let withOldValue = 0;
  let withNewValue = 0;
  let withBothOldAndNew = 0;

  for (const ev of matched) {
    let evHasModified = false;
    let evHasOld = false;
    let evHasNew = false;
    for (const tr of ev.targetResources ?? []) {
      if (Array.isArray(tr.modifiedProperties) && tr.modifiedProperties.length > 0) {
        evHasModified = true;
        for (const mp of tr.modifiedProperties) {
          if (isUsable(mp.oldValue)) evHasOld = true;
          if (isUsable(mp.newValue)) evHasNew = true;
          // Entra sometimes JSON-encodes values twice; flag once.
          if (
            typeof mp.oldValue === "string" &&
            mp.oldValue.startsWith('"\\"') &&
            mp.oldValue.endsWith('\\""')
          ) {
            anomalies.add(
              "modifiedProperties.oldValue appears double-JSON-encoded on at least one event",
            );
          }
          if (
            typeof mp.newValue === "string" &&
            mp.newValue.startsWith('"\\"') &&
            mp.newValue.endsWith('\\""')
          ) {
            anomalies.add(
              "modifiedProperties.newValue appears double-JSON-encoded on at least one event",
            );
          }
        }
      }
    }
    if (evHasModified) withModifiedProperties += 1;
    if (evHasOld) withOldValue += 1;
    if (evHasNew) withNewValue += 1;
    if (evHasOld && evHasNew) withBothOldAndNew += 1;
  }

  const matchCount = matched.length;
  let beforeStateAssessment: ClassFinding["beforeStateAssessment"] = "unknown";
  if (matchCount === 0) {
    beforeStateAssessment = "unknown";
    anomalies.add("No events matched for this class during the window.");
  } else if (withOldValue === matchCount && withNewValue === matchCount) {
    beforeStateAssessment = "authoritative";
  } else if (withNewValue > 0 && withOldValue === 0) {
    beforeStateAssessment = "absent";
    anomalies.add(
      "newValue present but oldValue absent: before-state must be reconstructed from prior snapshot.",
    );
  } else if (withOldValue > 0 && withOldValue < matchCount) {
    beforeStateAssessment = "partial";
    anomalies.add(
      `oldValue present on ${withOldValue}/${matchCount} events — partial reconstructability.`,
    );
  } else {
    beforeStateAssessment = "partial";
  }

  return {
    key: cls.key,
    label: cls.label,
    matchCount,
    withModifiedProperties,
    withOldValue,
    withNewValue,
    withBothOldAndNew,
    beforeStateAssessment,
    anomalies: Array.from(anomalies),
    sampleEventIds: matched.slice(0, 5).map((e) => e.id ?? ""),
  };
}

function recommendOverallStrategy(findings: ClassFinding[]): string {
  const byKey = new Map<ChangeClassKey, ClassFinding>();
  for (const f of findings) byKey.set(f.key, f);
  const assessments = findings
    .filter((f) => f.matchCount > 0)
    .map((f) => f.beforeStateAssessment);
  if (assessments.length === 0) {
    return (
      "No matched events in the window. Re-run WI-05 mutations and widen --wait-minutes " +
      "before drawing conclusions."
    );
  }
  if (assessments.every((a) => a === "authoritative")) {
    return (
      "Every observed change class exposes both oldValue and newValue. Normalization can " +
      "rely on modifiedProperties for before-state; snapshot fallback is advisory only."
    );
  }
  if (assessments.every((a) => a === "absent")) {
    return (
      "No observed change class exposes oldValue. Before-state MUST come from the trusted " +
      "snapshot / baseline pipeline for all v1 change types. Plan ingestion around " +
      "snapshot-diff reconstruction."
    );
  }
  // Mixed
  const authoritative = findings
    .filter((f) => f.matchCount > 0 && f.beforeStateAssessment === "authoritative")
    .map((f) => f.label);
  const partial = findings
    .filter((f) => f.matchCount > 0 && f.beforeStateAssessment === "partial")
    .map((f) => f.label);
  const absent = findings
    .filter((f) => f.matchCount > 0 && f.beforeStateAssessment === "absent")
    .map((f) => f.label);
  const lines: string[] = [];
  if (authoritative.length) {
    lines.push(
      `Use modifiedProperties directly for: ${authoritative.join(", ")}.`,
    );
  }
  if (partial.length) {
    lines.push(
      `Partial audit coverage — combine modifiedProperties with snapshot fallback for: ${partial.join(
        ", ",
      )}.`,
    );
  }
  if (absent.length) {
    lines.push(
      `No audit before-state — rely on snapshot-diff for: ${absent.join(", ")}.`,
    );
  }
  return lines.join(" ");
}

function analyze(events: AuditEvent[]): Pick<CompletenessMatrix, "findings" | "unmatchedEventCount" | "overallBeforeStateRecommendation"> {
  const matchedByKey = new Map<ChangeClassKey, AuditEvent[]>();
  let unmatched = 0;
  for (const ev of events) {
    const key = classifyMatch(ev);
    if (!key) {
      unmatched += 1;
      continue;
    }
    const bucket = matchedByKey.get(key) ?? [];
    bucket.push(ev);
    matchedByKey.set(key, bucket);
  }
  const findings = CHANGE_CLASSES.map((cls) =>
    analyzeFinding(cls, matchedByKey.get(cls.key) ?? []),
  );
  return {
    findings,
    unmatchedEventCount: unmatched,
    overallBeforeStateRecommendation: recommendOverallStrategy(findings),
  };
}

// ─── Markdown summary ──────────────────────────────────────────────────────

function renderMarkdownSummary(matrix: CompletenessMatrix): string {
  const lines: string[] = [];
  lines.push(`# WI-05 Audit Completeness — ${matrix.runMetadata.startedAt.slice(0, 10)}`);
  lines.push("");
  lines.push(`- **Tenant:** \`${matrix.runMetadata.tenantId}\``);
  lines.push(`- **Window:** \`${matrix.runMetadata.window.start}\` → \`${matrix.runMetadata.window.end}\``);
  lines.push(`- **Total events fetched:** ${matrix.totalEvents}`);
  lines.push(`- **Unmatched events:** ${matrix.unmatchedEventCount}`);
  lines.push(`- **Correlation ID:** \`${matrix.runMetadata.correlationId}\``);
  lines.push("");
  lines.push("## Findings by change class");
  lines.push("");
  for (const f of matrix.findings) {
    lines.push(`### ${f.label} (${f.matchCount} events)`);
    lines.push("");
    lines.push(`- modifiedProperties present: ${f.withModifiedProperties} / ${f.matchCount}`);
    lines.push(`- oldValue present: ${f.withOldValue} / ${f.matchCount}`);
    lines.push(`- newValue present: ${f.withNewValue} / ${f.matchCount}`);
    lines.push(`- both old+new: ${f.withBothOldAndNew} / ${f.matchCount}`);
    lines.push(`- before-state assessment: **${f.beforeStateAssessment.toUpperCase()}**`);
    if (f.anomalies.length > 0) {
      lines.push("- anomalies:");
      for (const a of f.anomalies) lines.push(`  - ${a}`);
    }
    if (f.sampleEventIds.length > 0) {
      lines.push("- sample event IDs:");
      for (const id of f.sampleEventIds) lines.push(`  - \`${id}\``);
    }
    lines.push("");
  }
  lines.push("## Overall before-state strategy");
  lines.push("");
  lines.push(matrix.overallBeforeStateRecommendation);
  lines.push("");
  lines.push("## Canonical mutation checklist used");
  lines.push("");
  for (const m of MUTATION_CHECKLIST) {
    lines.push(`- **${m.id}** — ${m.title}`);
  }
  lines.push("");
  return lines.join("\n");
}

// ─── Fetch helper ──────────────────────────────────────────────────────────

async function fetchAuditWindow(
  graph: GraphTransport,
  start: string,
  end: string,
  log: Logger,
): Promise<AuditEvent[]> {
  const filter = `activityDateTime ge ${start} and activityDateTime le ${end}`;
  const path =
    `/auditLogs/directoryAudits` +
    `?$filter=${encodeURIComponent(filter)}` +
    `&$top=500` +
    `&$orderby=activityDateTime`;

  const events: AuditEvent[] = [];
  for await (const page of graph.getPaged<AuditEvent>(path)) {
    events.push(...page.value);
    log.info("fetched page", {
      page: page.pageIndex,
      pageSize: page.value.length,
      runningTotal: events.length,
      hasMore: page.nextLink !== null,
    });
  }
  return events;
}

// ─── Propagation wait with countdown logging ───────────────────────────────

async function waitPropagation(minutes: number, log: Logger): Promise<void> {
  if (minutes <= 0) return;
  const totalMs = minutes * MINUTE_MS;
  log.info("propagation wait start", { minutes });
  // Log every minute so an operator knows the script is still alive.
  let remaining = totalMs;
  while (remaining > 0) {
    const chunk = Math.min(remaining, MINUTE_MS);
    await sleep(chunk);
    remaining -= chunk;
    if (remaining > 0) {
      log.info("propagation wait", {
        remainingMinutes: Math.ceil(remaining / MINUTE_MS),
      });
    }
  }
  log.info("propagation wait complete");
}

// ─── Main ──────────────────────────────────────────────────────────────────

interface SpikeRunState {
  windowStart: string | null;
  windowEnd: string | null;
  rawEvents: AuditEvent[] | null;
  matrix: CompletenessMatrix | null;
}

async function runScript(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  loadDotenvCascade();

  if (args.mutationChecklist) {
    printChecklistToStream(process.stdout);
    return;
  }

  const runId = newId("run");
  const log = createLogger({
    bindings: { script: "run-audit-completeness-spike", runId },
  });

  const startedAt = nowIso();
  const t0 = Date.now();
  log.info("starting", {
    start: args.start,
    end: args.end,
    waitMinutes: args.waitMinutes,
    outputDir: args.outputDir,
    dryRun: args.dryRun,
    skipFetch: args.skipFetch,
    skipAnalysis: args.skipAnalysis,
  });

  if (!args.outputDir && !args.dryRun) {
    failUsage("--output-dir is required (or use --dry-run / --mutation-checklist).");
  }

  const isExplicitWindow = args.start !== null && args.end !== null;
  const needsConfirmAndWait = !isExplicitWindow && !args.skipFetch;

  if (args.dryRun) {
    log.info("dry-run: printing plan and exiting", {
      plan: [
        needsConfirmAndWait ? "confirm 4 canonical mutations (approval-required)" : null,
        needsConfirmAndWait ? `wait ${args.waitMinutes} minutes for audit propagation` : null,
        args.skipFetch
          ? "load raw-events.json from --output-dir"
          : `fetch /auditLogs/directoryAudits from ${args.start ?? "[captured after wait]"} to ${args.end ?? "[captured after wait]"}`,
        args.skipAnalysis ? null : "analyze events across 4 change classes",
        args.skipAnalysis ? null : `write audit-completeness-matrix.json + audit-completeness-summary.md to ${args.outputDir ?? "[required]"}`,
      ].filter(Boolean),
    });
    return;
  }

  const outDir = resolve(args.outputDir!);
  mkdirSync(outDir, { recursive: true });

  const creds = loadSpCredentials("read");
  const graph = new GraphTransport({ tokenProvider: tokenProviderFor(creds) });

  // Confirmation flags: --confirm-mutations retained for backward compatibility
  // as a shorthand for --confirm-all-manual.
  const { confirmAll, confirmedIds } = parseConfirmationFlags(process.argv.slice(2));
  const autoConfirm = confirmAll || args.confirmMutations;

  // Shared state across runbook steps (closures read/write via the container).
  const state: SpikeRunState = {
    windowStart: args.start,
    windowEnd: args.end,
    rawEvents: null,
    matrix: null,
  };

  // Echo the checklist to stderr up front so operators see it before the
  // approval prompts. The markdown summary also embeds it.
  if (needsConfirmAndWait) {
    printChecklistToStream(process.stderr);
  }

  const runbook = new Runbook({
    scriptName: "run-audit-completeness-spike",
    apply: true, // read-only by nature; we only skip via skipIf/requiresApply
    autoConfirm,
    confirmedStepIds: confirmedIds,
    logger: log,
  });

  // ── Four approval-required mutation confirmations ─────────────────────
  for (const m of MUTATION_CHECKLIST) {
    runbook.add({
      id: `confirm-${m.id}`,
      label: m.title,
      kind: "approval-required",
      instruction: m.description,
      skipIf: () =>
        needsConfirmAndWait
          ? false
          : "explicit --start/--end or --skip-fetch: confirmation not needed",
    });
  }

  // ── Capture window and wait for audit propagation ─────────────────────
  runbook.add({
    id: "capture-window-and-wait",
    label: `Capture window start, wait ${args.waitMinutes}m for propagation, capture window end`,
    kind: "automatic",
    skipIf: () =>
      needsConfirmAndWait
        ? false
        : "explicit --start/--end or --skip-fetch: wait not needed",
    async run() {
      state.windowStart = nowIso();
      log.info("window start captured", { windowStart: state.windowStart });
      await waitPropagation(args.waitMinutes, log);
      state.windowEnd = nowIso();
      // Widen by one minute on each side to catch events whose activityDateTime
      // landed just outside our sampled boundary.
      state.windowStart = isoMinus(state.windowStart, MINUTE_MS);
      state.windowEnd = isoPlus(state.windowEnd, MINUTE_MS);
      return {
        windowStart: state.windowStart,
        windowEnd: state.windowEnd,
      };
    },
  });

  // ── Fetch vs load ──────────────────────────────────────────────────────
  runbook.add({
    id: "fetch-audit-events",
    label: "Fetch directoryAudits events via SP-Read",
    kind: "automatic",
    skipIf: () => (args.skipFetch ? "--skip-fetch" : false),
    async run() {
      if (!state.windowEnd) {
        // Full-orchestration sets this; explicit-window sets this at parse.
        // Defensive fallback: last 2h.
        state.windowEnd = state.windowEnd ?? nowIso();
        state.windowStart = state.windowStart ?? isoMinus(state.windowEnd, 2 * HOUR_MS);
      }
      state.rawEvents = await fetchAuditWindow(
        graph,
        state.windowStart!,
        state.windowEnd,
        log,
      );
      const rawPath = resolve(outDir, "raw-events.json");
      writeFileSync(rawPath, JSON.stringify(state.rawEvents, null, 2), "utf-8");
      runbook.recordOutput(rawPath);
      return { eventCount: state.rawEvents.length, path: rawPath };
    },
  });

  runbook.add({
    id: "load-cached-events",
    label: "Load cached raw-events.json from --output-dir",
    kind: "automatic",
    skipIf: () => (!args.skipFetch ? "not in --skip-fetch mode" : false),
    async run() {
      const rawPath = resolve(outDir, "raw-events.json");
      if (!existsSync(rawPath)) {
        throw new Error(`--skip-fetch requires ${rawPath} to already exist.`);
      }
      state.rawEvents = JSON.parse(readFileSync(rawPath, "utf-8")) as AuditEvent[];
      if (!state.windowStart || !state.windowEnd) {
        const dates = state.rawEvents
          .map((e) => e.activityDateTime)
          .filter((t): t is string => typeof t === "string")
          .sort();
        state.windowStart = state.windowStart ?? dates[0] ?? nowIso();
        state.windowEnd = state.windowEnd ?? dates[dates.length - 1] ?? nowIso();
      }
      return { eventCount: state.rawEvents.length, path: rawPath };
    },
  });

  // ── Analysis ───────────────────────────────────────────────────────────
  runbook.add({
    id: "analyze-completeness",
    label: "Analyze events across 4 change classes",
    kind: "automatic",
    skipIf: () => (args.skipAnalysis ? "--skip-analysis" : false),
    async run() {
      if (!state.rawEvents) throw new Error("no raw events available to analyze");
      const analysis = analyze(state.rawEvents);
      const finishedAt = nowIso();
      state.matrix = {
        runMetadata: {
          script: "run-audit-completeness-spike",
          runId,
          correlationId: currentCorrelationId() ?? runId,
          tenantId: creds.tenantId,
          startedAt,
          finishedAt,
          elapsedMs: Date.now() - t0,
          window: { start: state.windowStart!, end: state.windowEnd! },
        },
        totalEvents: state.rawEvents.length,
        ...analysis,
      };
      return {
        totalEvents: state.matrix.totalEvents,
        unmatchedEventCount: state.matrix.unmatchedEventCount,
        findings: state.matrix.findings.map((f) => ({
          key: f.key,
          matchCount: f.matchCount,
          assessment: f.beforeStateAssessment,
        })),
      };
    },
  });

  runbook.add({
    id: "write-artifacts",
    label: "Write audit-completeness-matrix.json + audit-completeness-summary.md",
    kind: "automatic",
    skipIf: () => (args.skipAnalysis ? "--skip-analysis" : false),
    async run() {
      if (!state.matrix) throw new Error("no matrix to write");
      const matrixPath = resolve(outDir, "audit-completeness-matrix.json");
      writeFileSync(matrixPath, JSON.stringify(state.matrix, null, 2), "utf-8");
      runbook.recordOutput(matrixPath);
      const md = renderMarkdownSummary(state.matrix);
      const mdPath = resolve(outDir, "audit-completeness-summary.md");
      writeFileSync(mdPath, md, "utf-8");
      runbook.recordOutput(mdPath);
      return { matrix: matrixPath, summary: mdPath };
    },
  });

  const runbookResult = await runbook.execute();

  // Write the combined run result so CI / reporters have a single artifact.
  const runResultPath = resolve(outDir, "run-result.json");
  const finalResult = {
    runMetadata: {
      script: "run-audit-completeness-spike" as const,
      runId,
      correlationId: currentCorrelationId() ?? runId,
      tenantId: creds.tenantId,
      startedAt,
      finishedAt: nowIso(),
      elapsedMs: Date.now() - t0,
      window: {
        start: state.windowStart,
        end: state.windowEnd,
      },
    },
    runbook: runbookResult,
    totalEvents: state.rawEvents?.length ?? 0,
    completenessAvailable: state.matrix !== null,
  };
  writeFileSync(runResultPath, JSON.stringify(finalResult, null, 2), "utf-8");
  log.info("wrote run result", { path: runResultPath });

  log.info("complete", {
    elapsedMs: Date.now() - t0,
    aborted: runbookResult.aborted,
    abortReason: runbookResult.abortReason,
    summary: runbookResult.summary,
    outputs: runbookResult.outputsProduced,
  });
}

withContext({ correlationId: newCorrelationId() }, runScript).catch((err: unknown) => {
  rootLogger.error("run-audit-completeness-spike failed", err);
  const code = isPlatformError(err) && err.code === "CONFIG_MISSING"
    ? ExitCodes.CONFIG
    : ExitCodes.UNEXPECTED;
  process.exit(code);
});
