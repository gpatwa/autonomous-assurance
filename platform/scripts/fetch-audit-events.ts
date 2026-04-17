/**
 * WI-05 helper: fetch Entra directoryAudits events for a time window.
 *
 * Authenticates with SP-Read, calls GET /auditLogs/directoryAudits with an
 * activityDateTime filter, pages through all results, and writes raw JSON
 * to stdout or a file. The raw shape is preserved — this script does NOT
 * normalize. Normalization is Phase 1 work in @kavachiq/core.
 *
 * Usage:
 *   # last 24h to stdout (logs go to stderr so stdout stays clean)
 *   npm run fetch-audit-events
 *
 *   # explicit window to file
 *   npm run fetch-audit-events -- \
 *     --start 2026-04-14T00:00:00Z \
 *     --end   2026-04-15T00:00:00Z \
 *     --output ../fixtures/canonical/raw-events.json
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  DAY_MS,
  ExitCodes,
  createLogger,
  isPlatformError,
  isoMinus,
  loadDotenvCascade,
  newCorrelationId,
  newId,
  nowIso,
  parseIso,
  rootLogger,
  withContext,
} from "@kavachiq/platform";

import { loadSpCredentials, tokenProviderFor } from "./lib/credentials.js";
import { GraphTransport } from "./lib/transport.js";

interface Args {
  start: string;
  end: string;
  output: string | null;
  pageSize: number;
}

function parseArgs(argv: string[]): Args {
  const end = nowIso();
  const args: Args = {
    start: isoMinus(end, DAY_MS),
    end,
    output: null,
    pageSize: 500,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--start") args.start = requireValue(argv, ++i, "--start");
    else if (arg === "--end") args.end = requireValue(argv, ++i, "--end");
    else if (arg === "--output") args.output = requireValue(argv, ++i, "--output");
    else if (arg === "--page-size") args.pageSize = Number(requireValue(argv, ++i, "--page-size"));
    else if (arg === "--help" || arg === "-h") {
      process.stdout.write(usage());
      process.exit(ExitCodes.OK);
    } else {
      process.stderr.write(`Unknown argument: ${arg}\n${usage()}`);
      process.exit(ExitCodes.USAGE);
    }
  }
  validateIso(args.start, "--start");
  validateIso(args.end, "--end");
  if (parseIso(args.start) >= parseIso(args.end)) {
    process.stderr.write("--start must be earlier than --end\n");
    process.exit(ExitCodes.USAGE);
  }
  return args;
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value) {
    process.stderr.write(`${flag} requires a value\n`);
    process.exit(ExitCodes.USAGE);
  }
  return value;
}

function validateIso(value: string, flag: string): void {
  try {
    parseIso(value);
  } catch {
    process.stderr.write(`${flag} is not a valid ISO-8601 datetime: ${value}\n`);
    process.exit(ExitCodes.USAGE);
  }
}

function usage(): string {
  return [
    "Usage: npm run fetch-audit-events -- [--start ISO] [--end ISO] [--output PATH] [--page-size N]",
    "",
    "  --start ISO     Start of window (ISO-8601, default: 24h ago).",
    "  --end ISO       End of window (ISO-8601, default: now).",
    "  --output PATH   Write results as JSON array. Default: stdout.",
    "  --page-size N   Graph $top value (default 500, max 1000).",
    "",
  ].join("\n");
}

async function runScript(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  loadDotenvCascade();

  const log = createLogger({
    bindings: { script: "fetch-audit-events", runId: newId("run") },
  });

  log.info("starting", {
    start: args.start,
    end: args.end,
    pageSize: args.pageSize,
    output: args.output ?? "stdout",
  });

  const creds = loadSpCredentials("read");
  const graph = new GraphTransport({ tokenProvider: tokenProviderFor(creds) });

  const filter = `activityDateTime ge ${args.start} and activityDateTime le ${args.end}`;
  const path =
    `/auditLogs/directoryAudits` +
    `?$filter=${encodeURIComponent(filter)}` +
    `&$top=${args.pageSize}` +
    `&$orderby=activityDateTime`;

  const events: unknown[] = [];
  let pageCount = 0;
  const startedAt = Date.now();

  for await (const page of graph.getPaged<unknown>(path)) {
    pageCount += 1;
    events.push(...page.value);
    log.info("page fetched", {
      page: page.pageIndex,
      pageSize: page.value.length,
      runningTotal: events.length,
      hasMore: page.nextLink !== null,
    });
  }

  const elapsedMs = Date.now() - startedAt;
  log.info("fetch complete", { pageCount, eventCount: events.length, elapsedMs });

  const payload = JSON.stringify(events, null, 2);

  if (args.output) {
    const outPath = resolve(args.output);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, payload, "utf-8");
    log.info("wrote output file", { path: outPath, bytes: Buffer.byteLength(payload) });
  } else {
    // Raw JSON to stdout; log lines already go to stderr via the logger.
    process.stdout.write(payload);
    process.stdout.write("\n");
  }
}

withContext({ correlationId: newCorrelationId() }, runScript).catch((err: unknown) => {
  rootLogger.error("fetch-audit-events failed", err);
  const code = isPlatformError(err) && err.code === "CONFIG_MISSING"
    ? ExitCodes.CONFIG
    : ExitCodes.UNEXPECTED;
  process.exit(code);
});
