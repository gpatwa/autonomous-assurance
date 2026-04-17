/**
 * WI-01 / WI-02 / WI-03 helper: Entra test-tenant bootstrap + SP verification.
 *
 * Modes:
 *   summary  — read-only snapshot of what the tenant looks like today.
 *              SP-Read is used; SP-Execute and SP-Setup are probed for
 *              credential presence and token acquisition. No writes.
 *   setup    — idempotent creation of the canonical scenario object set
 *              (users, groups, privileged group, base members, apps).
 *              Dry-run default; --apply actually hits Graph.
 *
 * Dry-run is the default. --apply opts in to real writes. --dry-run is
 * accepted explicitly and wins over --apply. DRY_RUN=1 env forces dry-run
 * regardless of CLI flags.
 *
 * Principals:
 *   SP-Read   — existence checks + /organization probe
 *   SP-Execute — probe only; no writes from this script (WI-06 owns that)
 *   SP-Setup  — tenant-population writes (User/Group/Application
 *               ReadWrite.All). Required only when --apply is set.
 *
 * Deliberately still manual (high risk, kept for operator):
 *   • Conditional Access policy creation
 *   • Teams team + SharePoint site provisioning
 *   • Admin consent for app registrations
 *
 * Source of truth: docs/CANONICAL_SCENARIO_FIXTURE.md,
 *                  docs/PHASE0_EXECUTION_BOARD.md §WI-01.
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
  optionalEnv,
  parseDryRunFlag,
  requireEnv,
  rootLogger,
  withContext,
  type DryRunContext,
  type Logger,
} from "@kavachiq/platform";

import {
  hasSpCredentialsConfigured,
  loadSpCredentials,
  tokenProviderFor,
  type SpKind,
} from "./lib/credentials.js";
import {
  GraphRequestError,
  GraphTransport,
  type PostResult,
} from "./lib/transport.js";
import {
  Runbook,
  parseConfirmationFlags,
  type RunbookResult,
} from "./lib/runbook.js";

// ─── CLI ───────────────────────────────────────────────────────────────────

type Mode = "summary" | "setup";

interface Args {
  mode: Mode;
  dryRun: DryRunContext;
  users: number;
  groups: number;
  apps: number;
  baseMembers: number;
  output: string | null;
}

const CANONICAL = {
  privilegedGroupName: "Finance-Privileged-Access",
  userDisplayPrefix: "KavachiQ Test",
  userMailPrefix: "kq-test",
  groupDisplayPrefix: "KavachiqTest-Group",
  appDisplayPrefix: "KavachiqTest-App",
  caPolicyNames: ["Finance-MFA-Bypass", "Finance-Data-Restriction"],
  teamName: "Finance-Team",
  sharepointSites: 3,
  addedMemberCount: 12, // Informational only; WI-05 runs this trigger.
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    mode: "summary",
    dryRun: parseDryRunFlag(argv),
    users: 50,
    groups: 20,
    apps: 10,
    baseMembers: 4,
    output: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(usage());
      process.exit(ExitCodes.OK);
    } else if (arg === "--mode") {
      const raw = requireValue(argv, ++i, "--mode");
      if (raw !== "summary" && raw !== "setup") {
        failUsage(`--mode must be 'summary' or 'setup'; got "${raw}"`);
      }
      args.mode = raw;
    } else if (arg === "--users") {
      args.users = parsePositiveInt(argv[++i], "--users");
    } else if (arg === "--groups") {
      args.groups = parsePositiveInt(argv[++i], "--groups");
    } else if (arg === "--apps") {
      args.apps = parsePositiveInt(argv[++i], "--apps");
    } else if (arg === "--base-members") {
      args.baseMembers = parsePositiveInt(argv[++i], "--base-members");
    } else if (arg === "--output") {
      args.output = requireValue(argv, ++i, "--output");
    } else if (arg === "--apply" || arg === "--dry-run") {
      // handled by parseDryRunFlag / override below
      continue;
    } else if (arg === "--confirm-all-manual") {
      // handled by parseConfirmationFlags
      continue;
    } else if (arg === "--confirm-manual-step") {
      // handled by parseConfirmationFlags; consume the value so it is not
      // treated as an unknown argument.
      i += 1;
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
    "Usage: npm run setup-test-tenant -- [--mode summary|setup] [--apply] [...]",
    "",
    "  --mode MODE        'summary' (default) or 'setup'. Summary is read-only.",
    "  --apply            In setup mode, perform real Graph writes. Default is dry-run.",
    "  --dry-run          Force dry-run; wins over --apply.",
    "  --users N          Target user count (default 50).",
    "  --groups N         Target group count, incl. privileged (default 20).",
    "  --apps N           Target app registration count (default 10).",
    "  --base-members N   Members to add to the privileged group (default 4).",
    "  --output PATH      Write the structured result as JSON. Default: stdout.",
    "",
    "Manual-step confirmation (CA policies, Teams, SharePoint, admin consent):",
    "  --confirm-manual-step <id>   Mark the named manual step as operator-confirmed.",
    "                               Repeatable. See result.steps[].id for IDs.",
    "  --confirm-all-manual         Mark every manual step as operator-confirmed.",
    "",
    "Env DRY_RUN=1 forces dry-run regardless of --apply.",
    "",
    "Required env (read + verification):",
    "  SP_READ_TENANT_ID, SP_READ_CLIENT_ID, plus",
    "  SP_READ_CERTIFICATE_PATH (preferred) or SP_READ_CLIENT_SECRET.",
    "",
    "Required env for setup --apply (tenant-population writes):",
    "  SP_SETUP_TENANT_ID, SP_SETUP_CLIENT_ID, plus",
    "  SP_SETUP_CERTIFICATE_PATH (preferred) or SP_SETUP_CLIENT_SECRET.",
    "  SP-Setup needs User.ReadWrite.All, Group.ReadWrite.All,",
    "  Application.ReadWrite.All, GroupMember.ReadWrite.All.",
    "  TENANT_DOMAIN (e.g. contoso.onmicrosoft.com) for UPN construction.",
    "  TENANT_SETUP_INITIAL_PASSWORD — password set on created users with",
    "  forceChangePasswordNextSignIn=true.",
    "",
    "SP-Execute env is optional here; the script probes its presence",
    "and verifies token acquisition but never uses it for writes.",
    "",
  ].join("\n");
}

// ─── Result model ──────────────────────────────────────────────────────────

interface SpVerification {
  kind: SpKind;
  configured: boolean;
  tokenAcquired: boolean;
  tenantId?: string;
  clientId?: string;
  probe?: { endpoint: string; ok: boolean; detail: string };
  error?: string;
}

interface CanonicalSnapshot {
  users: { existing: number; created: number; target: number };
  groups: { existing: number; created: number; target: number };
  privilegedGroup: { present: boolean; id: string | null; created: boolean };
  baseMembers: { current: number; added: number; target: number };
  apps: { existing: number; created: number; target: number };
}

interface DiscoveredIds {
  privilegedGroupId: string | null;
  createdUserIds: string[];
  createdGroupIds: string[];
  createdAppIds: string[];
  baseMemberUserIds: string[];
}

interface TenantSetupResult {
  runMetadata: {
    script: "setup-test-tenant";
    mode: Mode;
    runId: string;
    correlationId: string;
    tenantId?: string;
    dryRun: boolean;
    dryRunReason?: string;
    startedAt: string;
    finishedAt: string;
    elapsedMs: number;
  };
  spVerification: Record<SpKind, SpVerification>;
  canonicalObjects: CanonicalSnapshot;
  discoveredObjectIds: DiscoveredIds;
  runbook: RunbookResult;
  recommendedNextCommands: string[];
}

// ─── SP verification ───────────────────────────────────────────────────────

async function verifySp(
  kind: SpKind,
  log: Logger,
  opts: { probe: boolean; probeEndpoint?: string } = { probe: kind !== "execute" },
): Promise<SpVerification> {
  const result: SpVerification = {
    kind,
    configured: hasSpCredentialsConfigured(kind),
    tokenAcquired: false,
  };
  if (!result.configured) {
    log.warn(`sp-verify: SP-${kind.toUpperCase()} not configured`);
    return result;
  }
  try {
    const creds = loadSpCredentials(kind);
    result.tenantId = creds.tenantId;
    result.clientId = creds.clientId;
    const token = await tokenProviderFor(creds).getToken();
    if (!token) throw new Error("empty token");
    result.tokenAcquired = true;
    log.info(`sp-verify: token acquired`, {
      spKind: kind,
      tenantId: creds.tenantId,
      clientId: creds.clientId,
    });

    if (opts.probe) {
      const endpoint = opts.probeEndpoint ?? defaultProbeEndpoint(kind);
      const transport = new GraphTransport({ tokenProvider: tokenProviderFor(creds) });
      try {
        await transport.get(endpoint);
        result.probe = { endpoint, ok: true, detail: "200 OK" };
        log.info(`sp-verify: probe ok`, { spKind: kind, endpoint });
      } catch (err) {
        const detail =
          err instanceof GraphRequestError
            ? `status ${err.status}`
            : stringifyError(err);
        result.probe = { endpoint, ok: false, detail };
        log.warn(`sp-verify: probe failed`, { spKind: kind, endpoint, detail });
      }
    }
  } catch (err: unknown) {
    result.error = stringifyError(err);
    log.error(`sp-verify: failed`, err, { spKind: kind });
  }
  return result;
}

function defaultProbeEndpoint(kind: SpKind): string {
  // Each probe uses the narrowest read that the principal's permissions
  // should allow. SP-Execute has no safe probe (GroupMember.ReadWrite.All
  // only) so it is skipped; token acquisition is its verification bar.
  if (kind === "read") return "/organization";
  if (kind === "setup") return "/users?$top=1&$select=id";
  // Fallback (should not be reached; SP-Execute skips probe by default).
  return "/organization";
}

// ─── Pre-fetch canonical objects ───────────────────────────────────────────

interface CanonicalPrefetch {
  existingUserUpns: Set<string>;
  existingGroupNames: Set<string>;
  existingAppNames: Set<string>;
  privilegedGroupId: string | null;
  baseMemberUserIds: string[];
}

async function prefetchCanonical(
  readGraph: GraphTransport,
  log: Logger,
): Promise<CanonicalPrefetch> {
  const existingUserUpns = new Set<string>();
  const existingGroupNames = new Set<string>();
  const existingAppNames = new Set<string>();

  const userFilter = encodeURIComponent(
    `startswith(userPrincipalName, '${CANONICAL.userMailPrefix}-')`,
  );
  for await (const page of readGraph.getPaged<{ userPrincipalName: string }>(
    `/users?$filter=${userFilter}&$select=id,userPrincipalName&$top=999`,
  )) {
    for (const u of page.value) existingUserUpns.add(u.userPrincipalName.toLowerCase());
  }

  const groupFilter = encodeURIComponent(
    `startswith(displayName, '${CANONICAL.groupDisplayPrefix}-') or displayName eq '${CANONICAL.privilegedGroupName}'`,
  );
  let privilegedGroupId: string | null = null;
  for await (const page of readGraph.getPaged<{ id: string; displayName: string }>(
    `/groups?$filter=${groupFilter}&$select=id,displayName&$top=999`,
  )) {
    for (const g of page.value) {
      existingGroupNames.add(g.displayName);
      if (g.displayName === CANONICAL.privilegedGroupName) privilegedGroupId = g.id;
    }
  }

  const appFilter = encodeURIComponent(
    `startswith(displayName, '${CANONICAL.appDisplayPrefix}-')`,
  );
  for await (const page of readGraph.getPaged<{ displayName: string }>(
    `/applications?$filter=${appFilter}&$select=id,displayName&$top=999`,
  )) {
    for (const a of page.value) existingAppNames.add(a.displayName);
  }

  const baseMemberUserIds: string[] = [];
  if (privilegedGroupId) {
    for await (const page of readGraph.getPaged<{ id: string }>(
      `/groups/${privilegedGroupId}/members?$select=id&$top=999`,
    )) {
      for (const m of page.value) baseMemberUserIds.push(m.id);
    }
  }

  log.info("prefetch: snapshot", {
    users: existingUserUpns.size,
    groups: existingGroupNames.size,
    apps: existingAppNames.size,
    privilegedGroupPresent: privilegedGroupId !== null,
    baseMembersCurrent: baseMemberUserIds.length,
  });

  return {
    existingUserUpns,
    existingGroupNames,
    existingAppNames,
    privilegedGroupId,
    baseMemberUserIds,
  };
}

// ─── Setup-mode operations ─────────────────────────────────────────────────

interface SetupContext {
  setupGraph: GraphTransport;
  domain: string;
  initialPassword: string;
  log: Logger;
}

function requireSetupEnv(): { domain: string; initialPassword: string } {
  const domain = requireEnv("TENANT_DOMAIN");
  const initialPassword = requireEnv("TENANT_SETUP_INITIAL_PASSWORD");
  if (initialPassword.length < 12) {
    throw new Error("TENANT_SETUP_INITIAL_PASSWORD must be at least 12 characters");
  }
  return { domain, initialPassword };
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function userUpn(seq: number, domain: string): string {
  return `${CANONICAL.userMailPrefix}-${pad2(seq)}@${domain}`;
}

function userDisplayName(seq: number): string {
  return `${CANONICAL.userDisplayPrefix} ${pad2(seq)}`;
}

function userMailNickname(seq: number): string {
  return `${CANONICAL.userMailPrefix}-${pad2(seq)}`;
}

function groupDisplayName(seq: number): string {
  return `${CANONICAL.groupDisplayPrefix}-${pad2(seq)}`;
}

function appDisplayName(seq: number): string {
  return `${CANONICAL.appDisplayPrefix}-${pad2(seq)}`;
}

async function ensureUsers(
  target: number,
  prefetch: CanonicalPrefetch,
  ctx: SetupContext,
): Promise<{ createdIds: string[] }> {
  const createdIds: string[] = [];
  for (let seq = 1; seq <= target; seq += 1) {
    const upn = userUpn(seq, ctx.domain);
    if (prefetch.existingUserUpns.has(upn.toLowerCase())) continue;
    try {
      const res: PostResult<{ id: string }> = await ctx.setupGraph.post("/users", {
        accountEnabled: true,
        displayName: userDisplayName(seq),
        mailNickname: userMailNickname(seq),
        userPrincipalName: upn,
        passwordProfile: {
          forceChangePasswordNextSignIn: true,
          password: ctx.initialPassword,
        },
      });
      const id = res.body?.id;
      if (id) createdIds.push(id);
      ctx.log.info("user created", { seq, upn, id });
      prefetch.existingUserUpns.add(upn.toLowerCase());
    } catch (err) {
      if (isAlreadyExists(err)) {
        ctx.log.info("user already exists (race)", { seq, upn });
        prefetch.existingUserUpns.add(upn.toLowerCase());
      } else {
        ctx.log.error("user creation failed", err, { seq, upn });
        throw err;
      }
    }
  }
  return { createdIds };
}

async function ensureGroups(
  target: number,
  prefetch: CanonicalPrefetch,
  ctx: SetupContext,
): Promise<{ createdIds: string[] }> {
  const createdIds: string[] = [];
  // One slot is the privileged group; create target-1 generic groups.
  const genericTarget = Math.max(0, target - 1);
  for (let seq = 1; seq <= genericTarget; seq += 1) {
    const name = groupDisplayName(seq);
    if (prefetch.existingGroupNames.has(name)) continue;
    try {
      const res: PostResult<{ id: string }> = await ctx.setupGraph.post("/groups", {
        displayName: name,
        description: "KavachiQ Phase 0 test fixture",
        mailEnabled: false,
        mailNickname: `kq-group-${pad2(seq)}`,
        securityEnabled: true,
      });
      const id = res.body?.id;
      if (id) createdIds.push(id);
      ctx.log.info("group created", { seq, name, id });
      prefetch.existingGroupNames.add(name);
    } catch (err) {
      if (isAlreadyExists(err)) {
        ctx.log.info("group already exists (race)", { seq, name });
        prefetch.existingGroupNames.add(name);
      } else {
        ctx.log.error("group creation failed", err, { seq, name });
        throw err;
      }
    }
  }
  return { createdIds };
}

async function ensurePrivilegedGroup(
  prefetch: CanonicalPrefetch,
  ctx: SetupContext,
): Promise<{ id: string | null; created: boolean }> {
  if (prefetch.privilegedGroupId) {
    return { id: prefetch.privilegedGroupId, created: false };
  }
  try {
    const res: PostResult<{ id: string }> = await ctx.setupGraph.post("/groups", {
      displayName: CANONICAL.privilegedGroupName,
      description: "KavachiQ Phase 0 canonical-scenario privileged group",
      mailEnabled: false,
      mailNickname: "finance-privileged-access",
      securityEnabled: true,
    });
    const id = res.body?.id ?? null;
    ctx.log.info("privileged group created", { name: CANONICAL.privilegedGroupName, id });
    if (id) {
      prefetch.privilegedGroupId = id;
      prefetch.existingGroupNames.add(CANONICAL.privilegedGroupName);
    }
    return { id, created: true };
  } catch (err) {
    ctx.log.error("privileged group creation failed", err);
    throw err;
  }
}

async function ensureBaseMembers(
  target: number,
  prefetch: CanonicalPrefetch,
  ctx: SetupContext,
): Promise<{ addedUserIds: string[] }> {
  if (!prefetch.privilegedGroupId) return { addedUserIds: [] };
  if (prefetch.baseMemberUserIds.length >= target) return { addedUserIds: [] };

  // Resolve base-member users: kq-test-01 .. kq-test-{target} by UPN.
  const added: string[] = [];
  const needed = target - prefetch.baseMemberUserIds.length;
  let addedCount = 0;
  for (let seq = 1; seq <= target && addedCount < needed; seq += 1) {
    const upn = userUpn(seq, ctx.domain);
    // Resolve user id via /users/{upn}
    let userId: string;
    try {
      const u = await ctx.setupGraph.get<{ id: string }>(
        `/users/${encodeURIComponent(upn)}?$select=id`,
      );
      userId = u.id;
    } catch (err) {
      ctx.log.warn("base member: user not found, skipping", { upn });
      continue;
    }
    if (prefetch.baseMemberUserIds.includes(userId)) continue;
    try {
      await ctx.setupGraph.post(
        `/groups/${prefetch.privilegedGroupId}/members/$ref`,
        { "@odata.id": `https://graph.microsoft.com/v1.0/users/${userId}` },
      );
      added.push(userId);
      prefetch.baseMemberUserIds.push(userId);
      addedCount += 1;
      ctx.log.info("base member added", { upn, userId });
    } catch (err) {
      if (isAlreadyExists(err)) {
        ctx.log.info("base member already present", { upn, userId });
        prefetch.baseMemberUserIds.push(userId);
      } else {
        ctx.log.error("base member add failed", err, { upn, userId });
        throw err;
      }
    }
  }
  return { addedUserIds: added };
}

async function ensureApps(
  target: number,
  prefetch: CanonicalPrefetch,
  ctx: SetupContext,
): Promise<{ createdIds: string[] }> {
  const createdIds: string[] = [];
  for (let seq = 1; seq <= target; seq += 1) {
    const name = appDisplayName(seq);
    if (prefetch.existingAppNames.has(name)) continue;
    try {
      const res: PostResult<{ id: string; appId: string }> = await ctx.setupGraph.post(
        "/applications",
        {
          displayName: name,
          signInAudience: "AzureADMyOrg",
        },
      );
      const id = res.body?.id;
      if (id) createdIds.push(id);
      ctx.log.info("app created", { seq, name, id });
      prefetch.existingAppNames.add(name);
    } catch (err) {
      if (isAlreadyExists(err)) {
        ctx.log.info("app already exists (race)", { seq, name });
        prefetch.existingAppNames.add(name);
      } else {
        ctx.log.error("app creation failed", err, { seq, name });
        throw err;
      }
    }
  }
  return { createdIds };
}

function isAlreadyExists(err: unknown): boolean {
  if (!(err instanceof GraphRequestError)) return false;
  if (err.status === 409) return true;
  // Entra returns 400 with a Graph error code like Request_MultipleObjectsWithSameKeyValue
  // or Request_ResourceAlreadyExists depending on the endpoint.
  const details = err.details as { body?: string } | undefined;
  const body = details?.body ?? "";
  return (
    err.status === 400 &&
    /ResourceAlreadyExists|MultipleObjectsWithSameKeyValue|One or more added object references already exist/i.test(
      body,
    )
  );
}

function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

// ─── Main ──────────────────────────────────────────────────────────────────

function buildRecommendedCommands(
  mode: Mode,
  dryRun: boolean,
  sp: Record<SpKind, SpVerification>,
  runbookAborted: boolean,
): string[] {
  const recs: string[] = [];
  if (runbookAborted) {
    recs.push(
      "Runbook aborted mid-flow. Inspect result.runbook.abortReason and runbook.steps[*].error, then re-run.",
    );
  }
  if (mode === "summary" && dryRun) {
    recs.push(
      "Summary complete. To populate missing objects, re-run with --mode setup --apply (requires SP_SETUP_* env).",
    );
  } else if (mode === "setup" && dryRun) {
    recs.push(
      "Setup dry-run complete. Re-run with --apply to create missing users/groups/apps and add base members.",
    );
  } else if (mode === "setup" && !dryRun) {
    recs.push(
      "Setup applied. Re-run with --mode summary to verify final counts against canonical targets.",
    );
  }
  if (!sp.execute.configured) {
    recs.push(
      "SP-Execute not configured. Fill SP_EXECUTE_* env before running test-member-removal (WI-06).",
    );
  }
  if (sp.read.configured && sp.read.tokenAcquired) {
    recs.push(
      "SP-Read token acquired. run-audit-completeness-spike (WI-05) is ready to execute.",
    );
  }
  return recs;
}

async function runScript(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  loadDotenvCascade();

  const runId = newId("run");
  const log = createLogger({
    bindings: { script: "setup-test-tenant", runId, mode: args.mode },
  });

  const startedAt = nowIso();
  const t0 = Date.now();
  log.info("starting", {
    mode: args.mode,
    dryRun: !args.dryRun.apply,
    dryRunReason: args.dryRun.reason,
    targets: {
      users: args.users,
      groups: args.groups,
      apps: args.apps,
      baseMembers: args.baseMembers,
    },
  });

  // SP-Read is required for every run (summary reads + existence checks).
  const readCreds = loadSpCredentials("read");
  const readGraph = new GraphTransport({ tokenProvider: tokenProviderFor(readCreds) });

  // Shared state captured by runbook steps via closures.
  const spVerification: Record<SpKind, SpVerification> = {
    read: emptyVerification("read"),
    execute: emptyVerification("execute"),
    setup: emptyVerification("setup"),
  };
  // State shared across runbook steps. Wrapped in a container so TS keeps
  // the union types (closures inside step.run() cannot narrow a plain `let`).
  interface StepState {
    prefetch: CanonicalPrefetch | null;
    snapshotBefore: {
      users: number;
      groups: number;
      apps: number;
      baseMembers: number;
    } | null;
    setupGraph: GraphTransport | null;
    setupCtx: SetupContext | null;
  }
  const state: StepState = {
    prefetch: null,
    snapshotBefore: null,
    setupGraph: null,
    setupCtx: null,
  };
  const discovered: DiscoveredIds = {
    privilegedGroupId: null,
    createdUserIds: [],
    createdGroupIds: [],
    createdAppIds: [],
    baseMemberUserIds: [],
  };
  let privilegedCreated = false;

  const { confirmAll, confirmedIds } = parseConfirmationFlags(process.argv.slice(2));
  const runbook = new Runbook({
    scriptName: "setup-test-tenant",
    apply: args.dryRun.apply,
    autoConfirm: confirmAll,
    confirmedStepIds: confirmedIds,
    logger: log,
  });

  // ── Verification steps (automatic; safe reads) ─────────────────────────
  for (const kind of ["read", "execute", "setup"] as SpKind[]) {
    runbook.add({
      id: `verify-sp-${kind}`,
      label: `Verify SP-${kind.toUpperCase()} (token acquisition${
        kind === "execute" ? "" : " + read probe"
      })`,
      kind: "automatic",
      async run() {
        const v = await verifySp(kind, log);
        spVerification[kind] = v;
        return {
          configured: v.configured,
          tokenAcquired: v.tokenAcquired,
          probeOk: v.probe?.ok ?? null,
        };
      },
    });
  }

  // ── Pre-fetch canonical snapshot (automatic; SP-Read) ──────────────────
  runbook.add({
    id: "prefetch-canonical",
    label: "Pre-fetch canonical users/groups/apps/privileged group via SP-Read",
    kind: "automatic",
    async run() {
      const prefetched = await prefetchCanonical(readGraph, log);
      state.prefetch = prefetched;
      discovered.privilegedGroupId = prefetched.privilegedGroupId;
      discovered.baseMemberUserIds = [...prefetched.baseMemberUserIds];
      state.snapshotBefore = {
        users: prefetched.existingUserUpns.size,
        groups: prefetched.existingGroupNames.size,
        apps: prefetched.existingAppNames.size,
        baseMembers: prefetched.baseMemberUserIds.length,
      };
      return state.snapshotBefore;
    },
  });

  // ── Setup-mode automatic steps (only added if mode === "setup") ────────
  if (args.mode === "setup") {
    // Preflight step: confirms SP-Setup is ready AND loads env for writes.
    // Fails (and aborts) if --apply is set but env is missing.
    runbook.add({
      id: "setup-preflight",
      label: "Verify SP-Setup is usable and TENANT_DOMAIN / TENANT_SETUP_INITIAL_PASSWORD are set",
      kind: "automatic",
      requiresApply: true,
      async run() {
        if (!spVerification.setup.configured) {
          throw new Error(
            "SP-Setup not configured. --apply requires SP_SETUP_TENANT_ID, SP_SETUP_CLIENT_ID, " +
              "and either SP_SETUP_CERTIFICATE_PATH or SP_SETUP_CLIENT_SECRET.",
          );
        }
        if (!spVerification.setup.tokenAcquired) {
          throw new Error(
            "SP-Setup token acquisition failed. Check cert/secret and tenant/client IDs before retrying.",
          );
        }
        const { domain, initialPassword } = requireSetupEnv();
        const setupCreds = loadSpCredentials("setup");
        const g = new GraphTransport({
          tokenProvider: tokenProviderFor(setupCreds),
        });
        state.setupGraph = g;
        state.setupCtx = { setupGraph: g, domain, initialPassword, log };
        return { domain, passwordLength: initialPassword.length };
      },
    });

    runbook.add({
      id: "ensure-groups",
      label: "Create missing canonical security groups",
      kind: "automatic",
      requiresApply: true,
      async run() {
        if (!state.prefetch || !state.setupCtx) throw new Error("prefetch/setupCtx missing");
        const r = await ensureGroups(args.groups, state.prefetch, state.setupCtx);
        discovered.createdGroupIds.push(...r.createdIds);
        return { createdCount: r.createdIds.length };
      },
    });

    runbook.add({
      id: "ensure-privileged-group",
      label: `Ensure the canonical privileged group "${CANONICAL.privilegedGroupName}"`,
      kind: "automatic",
      requiresApply: true,
      async run() {
        if (!state.prefetch || !state.setupCtx) throw new Error("prefetch/setupCtx missing");
        const r = await ensurePrivilegedGroup(state.prefetch, state.setupCtx);
        discovered.privilegedGroupId = r.id ?? discovered.privilegedGroupId;
        privilegedCreated = r.created;
        return { id: r.id, created: r.created };
      },
    });

    runbook.add({
      id: "ensure-users",
      label: "Create missing canonical users",
      kind: "automatic",
      requiresApply: true,
      async run() {
        if (!state.prefetch || !state.setupCtx) throw new Error("prefetch/setupCtx missing");
        const r = await ensureUsers(args.users, state.prefetch, state.setupCtx);
        discovered.createdUserIds.push(...r.createdIds);
        return { createdCount: r.createdIds.length };
      },
    });

    runbook.add({
      id: "ensure-base-members",
      label: `Add ${args.baseMembers} base members to the privileged group`,
      kind: "automatic",
      requiresApply: true,
      async run() {
        if (!state.prefetch || !state.setupCtx) throw new Error("prefetch/setupCtx missing");
        const r = await ensureBaseMembers(args.baseMembers, state.prefetch, state.setupCtx);
        discovered.baseMemberUserIds = [...state.prefetch.baseMemberUserIds];
        return { addedCount: r.addedUserIds.length };
      },
    });

    runbook.add({
      id: "ensure-apps",
      label: "Create missing canonical app registrations",
      kind: "automatic",
      requiresApply: true,
      async run() {
        if (!state.prefetch || !state.setupCtx) throw new Error("prefetch/setupCtx missing");
        const r = await ensureApps(args.apps, state.prefetch, state.setupCtx);
        discovered.createdAppIds.push(...r.createdIds);
        return { createdCount: r.createdIds.length };
      },
    });
  }

  // ── Manual steps (always present; operator-run outside this script) ────
  runbook.add({
    id: "ca-policies",
    label: `Create Conditional Access policies: ${CANONICAL.caPolicyNames.join(", ")}`,
    kind: "manual",
    instruction:
      "Create these policies in the Entra admin portal. Policy misconfiguration " +
      "can lock the tenant — automation is deliberately deferred. Pass " +
      "--confirm-manual-step ca-policies once the policies exist.",
  });
  runbook.add({
    id: "teams-setup",
    label: `Create the Teams team "${CANONICAL.teamName}" and link it to the privileged group`,
    kind: "manual",
    instruction:
      "Provision in Teams admin center; link to Finance-Privileged-Access. " +
      "Pass --confirm-manual-step teams-setup once linked.",
  });
  runbook.add({
    id: "sharepoint-setup",
    label: `Configure ${CANONICAL.sharepointSites} SharePoint site collections with group-based permissions`,
    kind: "manual",
    instruction:
      "Create in SharePoint admin center and assign permissions to Finance-Privileged-Access. " +
      "Pass --confirm-manual-step sharepoint-setup once configured.",
  });
  runbook.add({
    id: "admin-consent",
    label: "Admin-consent any app registrations that need application permissions",
    kind: "manual",
    instruction:
      "In Entra admin portal → Enterprise Applications → each created app → grant admin consent. " +
      "Pass --confirm-manual-step admin-consent once consent is granted.",
  });
  runbook.add({
    id: "scenario-trigger",
    label: `Scenario trigger: ${CANONICAL.addedMemberCount} member-add events are produced by WI-05, not this script`,
    kind: "manual",
    instruction:
      "No action required here; this step exists to remind operators that the " +
      "12-member-add audit events are produced by run-audit-completeness-spike (WI-05), " +
      "not by setup. Pass --confirm-manual-step scenario-trigger to acknowledge.",
  });

  const runbookResult = await runbook.execute();

  const finishedAt = nowIso();
  const elapsedMs = Date.now() - t0;

  const snapshot = state.snapshotBefore;
  const baseMembersBefore = snapshot?.baseMembers ?? 0;
  const baseMembersAdded = Math.max(
    0,
    discovered.baseMemberUserIds.length - baseMembersBefore,
  );

  const canonicalObjects: CanonicalSnapshot = {
    users: {
      existing: snapshot?.users ?? 0,
      created: discovered.createdUserIds.length,
      target: args.users,
    },
    groups: {
      existing: snapshot?.groups ?? 0,
      created: discovered.createdGroupIds.length,
      target: args.groups,
    },
    privilegedGroup: {
      present: discovered.privilegedGroupId !== null,
      id: discovered.privilegedGroupId,
      created: privilegedCreated,
    },
    baseMembers: {
      current: baseMembersBefore + baseMembersAdded,
      added: baseMembersAdded,
      target: args.baseMembers,
    },
    apps: {
      existing: snapshot?.apps ?? 0,
      created: discovered.createdAppIds.length,
      target: args.apps,
    },
  };

  const result: TenantSetupResult = {
    runMetadata: {
      script: "setup-test-tenant",
      mode: args.mode,
      runId,
      correlationId: currentCorrelationId() ?? runId,
      tenantId: readCreds.tenantId,
      dryRun: !args.dryRun.apply,
      dryRunReason: args.dryRun.reason,
      startedAt,
      finishedAt,
      elapsedMs,
    },
    spVerification,
    canonicalObjects,
    discoveredObjectIds: discovered,
    runbook: runbookResult,
    recommendedNextCommands: buildRecommendedCommands(
      args.mode,
      !args.dryRun.apply,
      spVerification,
      runbookResult.aborted,
    ),
  };

  log.info("complete", {
    elapsedMs,
    canonicalObjects,
    runbookSummary: runbookResult.summary,
    aborted: runbookResult.aborted,
  });

  const payload = JSON.stringify(result, null, 2);
  if (args.output) {
    const outPath = resolve(args.output);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, payload, "utf-8");
    log.info("wrote output file", { path: outPath, bytes: Buffer.byteLength(payload) });
  } else {
    process.stdout.write(payload);
    process.stdout.write("\n");
  }
}

function emptyVerification(kind: SpKind): SpVerification {
  return { kind, configured: false, tokenAcquired: false };
}

withContext({ correlationId: newCorrelationId() }, runScript).catch((err: unknown) => {
  rootLogger.error("setup-test-tenant failed", err);
  const code = isPlatformError(err) && err.code === "CONFIG_MISSING"
    ? ExitCodes.CONFIG
    : ExitCodes.UNEXPECTED;
  process.exit(code);
});
