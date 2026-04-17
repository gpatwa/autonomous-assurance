/**
 * Dry-run context. Shared by scripts, workers, and any future job runner
 * so that "would do X" vs "did X" is expressed identically everywhere.
 *
 * Convention:
 *   - Default to read-only (apply=false).
 *   - --apply (or DRY_RUN=0 override) enables real writes.
 *   - Callers log what they *would* do when apply=false; they never
 *     silently skip a step.
 */

export interface DryRunContext {
  /** True = perform real side effects. False = read-only / log-only. */
  apply: boolean;
  /** Optional annotation for logs/audit ("override via --apply"). */
  reason?: string;
}

export interface DryRunParseOptions {
  /** Flag name that enables apply mode. Default: "--apply". */
  applyFlag?: string;
  /**
   * Env var name that forces dry-run. Default: "DRY_RUN". When set to a
   * truthy value (`1`, `true`, `yes`, `on`), the returned context is
   * read-only regardless of the CLI flag. Safety net for ops.
   */
  dryRunEnvVar?: string;
  env?: NodeJS.ProcessEnv;
}

export function parseDryRunFlag(
  argv: string[],
  opts: DryRunParseOptions = {},
): DryRunContext {
  const flag = opts.applyFlag ?? "--apply";
  const envVar = opts.dryRunEnvVar ?? "DRY_RUN";
  const env = opts.env ?? process.env;

  const cliApply = argv.includes(flag);
  const forcedDryRun = isTruthy(env[envVar]);

  if (forcedDryRun) {
    return { apply: false, reason: `${envVar} is set; ignoring ${flag}` };
  }
  return { apply: cliApply };
}

function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}
