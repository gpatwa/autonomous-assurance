/**
 * WI-01 helper: bootstrap the Entra test tenant toward the canonical scenario.
 *
 * Dry-run by default. Pass --apply to actually hit Graph. Even with --apply,
 * several steps remain manual (Conditional Access, Teams, SharePoint) and
 * are logged as TODO rather than silently skipped.
 *
 * Source of truth for the object population target:
 *   docs/CANONICAL_SCENARIO_FIXTURE.md
 *   docs/PHASE0_EXECUTION_BOARD.md §WI-01
 *
 * Usage:
 *   npm run setup-test-tenant              # dry-run, prints plan
 *   npm run setup-test-tenant -- --apply   # real Graph writes
 *   npm run setup-test-tenant -- --apply --users 50 --groups 20
 *
 * This script uses SP-Read credentials for existence checks. Writes in
 * --apply mode require a separately-credentialed tenant-setup principal
 * (User.ReadWrite.All, Group.ReadWrite.All, Application.ReadWrite.All) —
 * do NOT reuse SP-Execute, which has only GroupMember.ReadWrite.All.
 */

import {
  ExitCodes,
  createLogger,
  isPlatformError,
  loadDotenvCascade,
  newCorrelationId,
  newId,
  parseDryRunFlag,
  rootLogger,
  withContext,
  type DryRunContext,
  type Logger,
} from "@kavachiq/platform";

import { loadSpCredentials, tokenProviderFor } from "./lib/credentials.js";
import { GraphTransport } from "./lib/transport.js";

interface Args {
  dryRun: DryRunContext;
  users: number;
  groups: number;
  apps: number;
}

const CANONICAL = {
  privilegedGroupName: "Finance-Privileged-Access",
  baseMemberCount: 4,
  addedMemberCount: 12,
  caPolicyNames: ["Finance-MFA-Bypass", "Finance-Data-Restriction"],
  teamName: "Finance-Team",
  sharepointSites: 3,
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    dryRun: parseDryRunFlag(argv),
    users: 50,
    groups: 20,
    apps: 10,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") continue; // handled by parseDryRunFlag
    if (arg === "--users") args.users = Number(argv[++i]);
    else if (arg === "--groups") args.groups = Number(argv[++i]);
    else if (arg === "--apps") args.apps = Number(argv[++i]);
    else if (arg === "--help" || arg === "-h") {
      process.stdout.write(usage());
      process.exit(ExitCodes.OK);
    } else {
      process.stderr.write(`Unknown argument: ${arg}\n${usage()}`);
      process.exit(ExitCodes.USAGE);
    }
  }
  return args;
}

function usage(): string {
  return [
    "Usage: npm run setup-test-tenant -- [--apply] [--users N] [--groups N] [--apps N]",
    "",
    "  --apply         Perform Graph writes. Without this flag, runs in dry-run mode.",
    "  --users N       Target user count (default 50).",
    "  --groups N      Target group count (default 20).",
    "  --apps N        Target application count (default 10).",
    "",
    "Env DRY_RUN=1 forces dry-run regardless of --apply (ops safety net).",
    "",
  ].join("\n");
}

// ─── Step helpers ──────────────────────────────────────────────────────────
//
// Each helper is narrow on purpose: it states what it would do, checks
// existence where cheap, and returns. Real write operations live inside
// `if (apply)` branches. Every not-yet-automated piece logs a TODO.

async function ensureUsers(graph: GraphTransport, args: Args, log: Logger): Promise<void> {
  const existing = await countAll(graph, "/users?$select=id&$top=999");
  log.info("ensureUsers", { target: args.users, existing });
  if (existing >= args.users) {
    log.info("ensureUsers: already at target");
    return;
  }
  const toCreate = args.users - existing;
  log.info("ensureUsers: would create", { count: toCreate });
  if (!args.dryRun.apply) return;
  // TODO(WI-01): implement batched user creation via POST /users.
  // Needs: domain suffix for UPNs, initial password policy, whether to
  // mark users as kavachiq-canonical via an extension attribute.
  log.warn("ensureUsers: not yet automated, create manually in Entra admin");
}

async function ensureGroups(graph: GraphTransport, args: Args, log: Logger): Promise<void> {
  const existing = await countAll(graph, "/groups?$select=id&$top=999");
  log.info("ensureGroups", { target: args.groups, existing });
  if (existing >= args.groups) {
    log.info("ensureGroups: already at target");
    return;
  }
  const toCreate = args.groups - existing;
  log.info("ensureGroups: would create", { count: toCreate });
  if (!args.dryRun.apply) return;
  // TODO(WI-01): implement batched security-group creation via POST /groups.
  log.warn("ensureGroups: not yet automated, create manually in Entra admin");
}

async function ensurePrivilegedGroup(
  graph: GraphTransport,
  args: Args,
  log: Logger,
): Promise<string | null> {
  const found = await findGroupByDisplayName(graph, CANONICAL.privilegedGroupName);
  if (found) {
    log.info("ensurePrivilegedGroup: exists", {
      name: CANONICAL.privilegedGroupName,
      id: found.id,
    });
    return found.id;
  }
  log.info("ensurePrivilegedGroup: would create", { name: CANONICAL.privilegedGroupName });
  if (!args.dryRun.apply) return null;
  // TODO(WI-01): implement POST /groups with security-enabled + mailEnabled=false.
  // Needs: owner assignment, sensitivity-label tagging, description matching
  // the scenario fixture.
  log.warn("ensurePrivilegedGroup: not yet automated");
  return null;
}

async function ensureBaseMembers(
  graph: GraphTransport,
  privilegedGroupId: string | null,
  args: Args,
  log: Logger,
): Promise<void> {
  if (!privilegedGroupId) {
    log.info("ensureBaseMembers: privileged group not present, skipping");
    return;
  }
  const current = await countAll(
    graph,
    `/groups/${privilegedGroupId}/members?$select=id&$top=999`,
  );
  log.info("ensureBaseMembers", {
    groupId: privilegedGroupId,
    target: CANONICAL.baseMemberCount,
    current,
  });
  if (current >= CANONICAL.baseMemberCount) {
    log.info("ensureBaseMembers: already at or above base count");
    return;
  }
  log.info("ensureBaseMembers: would add", {
    count: CANONICAL.baseMemberCount - current,
  });
  if (!args.dryRun.apply) return;
  // TODO(WI-01): implement POST /groups/{id}/members/$ref for 4 selected users.
  // The specific users should be deterministic so the scenario can be replayed.
  log.warn("ensureBaseMembers: not yet automated");
}

async function ensureAddedMembers(log: Logger): Promise<void> {
  // This is the scenario trigger: 12 members added over a short window by an
  // agent service principal. It is intentionally NOT run here — the audit-log
  // completeness spike (WI-05) executes this separately against the live
  // tenant. This step only confirms capacity.
  log.info("ensureAddedMembers: scenario trigger, executed separately in WI-05", {
    count: CANONICAL.addedMemberCount,
  });
}

async function ensureApps(graph: GraphTransport, args: Args, log: Logger): Promise<void> {
  const existing = await countAll(graph, "/applications?$select=id&$top=999");
  log.info("ensureApps", { target: args.apps, existing });
  if (existing >= args.apps) {
    log.info("ensureApps: already at target");
    return;
  }
  log.info("ensureApps: would create", { count: args.apps - existing });
  if (!args.dryRun.apply) return;
  // TODO(WI-01): implement POST /applications + app-role assignments.
  log.warn("ensureApps: not yet automated");
}

function ensureCAPolicies(args: Args, log: Logger): void {
  // Conditional Access policy creation via Graph requires elevated roles and
  // has footgun potential (locking the tenant out). Keep manual through
  // Phase 0. List the canonical policy names so the operator can verify.
  log.info("ensureCAPolicies: manual step", {
    policies: CANONICAL.caPolicyNames,
    action: args.dryRun.apply
      ? "create these policies manually in Entra admin portal"
      : "would be verified manually in Entra admin portal",
  });
  // TODO(WI-01): consider automating non-enforcing "report-only" policies
  // once the scenario fixture is stable.
}

function ensureTeamsAndSharePoint(log: Logger): void {
  // Teams and SharePoint provisioning is out of scope for the first pass.
  // Document what is expected so the operator can do it manually.
  log.info("ensureTeamsAndSharePoint: manual step", {
    team: CANONICAL.teamName,
    sharepointSites: CANONICAL.sharepointSites,
    action: "create manually; link Team to the privileged group",
  });
}

// ─── Low-level Graph helpers ───────────────────────────────────────────────

async function countAll(graph: GraphTransport, path: string): Promise<number> {
  let total = 0;
  for await (const page of graph.getPaged<{ id: string }>(path)) {
    total += page.value.length;
  }
  return total;
}

async function findGroupByDisplayName(
  graph: GraphTransport,
  name: string,
): Promise<{ id: string } | null> {
  const encoded = encodeURIComponent(`displayName eq '${name.replace(/'/g, "''")}'`);
  const res = await graph.get<{ value: Array<{ id: string }> }>(
    `/groups?$filter=${encoded}&$select=id&$top=1`,
  );
  return res.value[0] ?? null;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function runScript(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  loadDotenvCascade();

  const log = createLogger({
    bindings: { script: "setup-test-tenant", runId: newId("run") },
  });

  log.info("starting", {
    mode: args.dryRun.apply ? "APPLY (real Graph writes)" : "dry-run (read-only)",
    dryRunReason: args.dryRun.reason,
    targets: { users: args.users, groups: args.groups, apps: args.apps },
  });

  // SP-Read is enough for all existence checks in dry-run. Writes in --apply
  // mode would require a separately-credentialed tenant-setup principal
  // (not yet automated in this pass).
  const creds = loadSpCredentials("read");
  const graph = new GraphTransport({ tokenProvider: tokenProviderFor(creds) });

  await ensureUsers(graph, args, log);
  await ensureGroups(graph, args, log);
  const privilegedGroupId = await ensurePrivilegedGroup(graph, args, log);
  await ensureBaseMembers(graph, privilegedGroupId, args, log);
  await ensureAddedMembers(log);
  await ensureApps(graph, args, log);
  ensureCAPolicies(args, log);
  ensureTeamsAndSharePoint(log);

  log.info("complete", {
    mode: args.dryRun.apply ? "applied" : "dry-run only",
    nextSteps: [
      "Finish manual CA policy / Teams / SharePoint setup per logged warnings",
      "Run WI-05 (fetch-audit-events) to capture real event shapes",
      "Generate canonical fixtures (WI-11) from captured events",
    ],
  });
}

withContext({ correlationId: newCorrelationId() }, runScript).catch((err: unknown) => {
  rootLogger.error("setup-test-tenant failed", err);
  const code = isPlatformError(err) && err.code === "CONFIG_MISSING"
    ? ExitCodes.CONFIG
    : ExitCodes.UNEXPECTED;
  process.exit(code);
});
