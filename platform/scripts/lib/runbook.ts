/**
 * Human-in-the-loop script orchestration.
 *
 * Deliberately narrow scope: step planning, kind classification,
 * automatic execution of safe steps, explicit confirmation for
 * approval-required steps, and a structured result trail. This is NOT
 * a workflow engine. No persistence, no retries, no branching — if we
 * ever need those, they belong in a different layer.
 *
 * Lives in scripts/lib/ by design. Promote to @kavachiq/platform only
 * when a second non-script consumer appears.
 */

import { createInterface } from "node:readline/promises";
import {
  newId,
  nowIso,
  type Logger,
} from "@kavachiq/platform";

// ─── Types ─────────────────────────────────────────────────────────────────

export type StepKind = "automatic" | "manual" | "approval-required";
export type StepStatus =
  | "planned"
  | "skipped"
  | "confirmed"
  | "executed"
  | "failed";

export type ConfirmedBy = "tty" | "flag" | "confirm-all";

/**
 * Declarative step spec.
 *
 *   automatic        — Has `run()`. Always executes by default (safe reads,
 *                      verification). Set `requiresApply: true` for steps
 *                      that perform mutations; those are skipped in dry-run.
 *   manual           — Informational. Script prints the instruction and
 *                      records the step as skipped ("manual: operator-run
 *                      outside this script") unless explicitly confirmed
 *                      via flag. Never blocks.
 *   approval-required — Script pauses for operator confirmation before
 *                      proceeding. Declining aborts the runbook.
 */
export interface StepSpec<TResult = unknown> {
  id: string;
  label: string;
  kind: StepKind;
  /**
   * Automatic-step safety flag. True = mutating; runs only when
   * runbook.apply is true. False / undefined = safe read; always runs.
   * Ignored for manual / approval-required steps.
   */
  requiresApply?: boolean;
  /** Human-readable guidance shown for manual / approval-required steps. */
  instruction?: string;
  /** Required for `automatic`. Should return a small JSON-safe summary. */
  run?: () => Promise<TResult>;
  /** If present and truthy, the step is skipped with the returned reason. */
  skipIf?: () => boolean | string | Promise<boolean | string>;
}

export interface StepResult {
  id: string;
  label: string;
  kind: StepKind;
  status: StepStatus;
  startedAt?: string;
  finishedAt?: string;
  elapsedMs?: number;
  result?: unknown;
  error?: { code?: string; message: string };
  confirmedBy?: ConfirmedBy;
  confirmedAt?: string;
  skipReason?: string;
  instruction?: string;
}

export interface RunbookOptions {
  scriptName: string;
  /** When false, automatic steps are skipped (dry-run). */
  apply: boolean;
  /** Auto-confirm every approval-required / manual step (--confirm-all-manual). */
  autoConfirm: boolean;
  /** Step IDs explicitly confirmed via --confirm-manual-step <id>. */
  confirmedStepIds: Set<string>;
  logger: Logger;
  /** Override TTY detection (tests). */
  interactive?: boolean;
  /** Override prompt (tests). */
  prompt?: (message: string) => Promise<boolean>;
}

export interface RunbookResult {
  scriptName: string;
  runId: string;
  startedAt: string;
  finishedAt: string;
  elapsedMs: number;
  apply: boolean;
  dryRun: boolean;
  aborted: boolean;
  abortReason?: string;
  steps: StepResult[];
  summary: {
    planned: number;
    executed: number;
    confirmed: number;
    skipped: number;
    failed: number;
  };
  outputsProduced: string[];
  recommendedNextActions: string[];
}

// ─── CLI arg helpers ───────────────────────────────────────────────────────

/**
 * Pull confirmation flags out of argv. Does NOT mutate argv — callers'
 * arg parsers should still see the same tokens (they can no-op them).
 */
export function parseConfirmationFlags(argv: string[]): {
  confirmAll: boolean;
  confirmedIds: Set<string>;
} {
  let confirmAll = false;
  const confirmedIds = new Set<string>();
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--confirm-all-manual") confirmAll = true;
    else if (argv[i] === "--confirm-manual-step") {
      const value = argv[++i];
      if (value) confirmedIds.add(value);
    }
  }
  return { confirmAll, confirmedIds };
}

// ─── Runbook ───────────────────────────────────────────────────────────────

export class Runbook {
  private readonly specs: StepSpec[] = [];
  private readonly outputs: string[] = [];
  private readonly recommendedNextActions: string[] = [];
  private readonly opts: RunbookOptions;
  private readonly interactive: boolean;
  private readonly prompt: (message: string) => Promise<boolean>;

  constructor(opts: RunbookOptions) {
    this.opts = opts;
    this.interactive = opts.interactive ?? process.stdin.isTTY === true;
    this.prompt = opts.prompt ?? defaultPrompt;
  }

  add(step: StepSpec): void {
    if (this.specs.find((s) => s.id === step.id)) {
      throw new Error(`runbook: duplicate step id "${step.id}"`);
    }
    if (step.kind === "automatic" && !step.run) {
      throw new Error(`runbook: step "${step.id}" is automatic but has no run()`);
    }
    if (step.kind !== "automatic" && !step.instruction) {
      throw new Error(
        `runbook: step "${step.id}" is ${step.kind} but has no instruction`,
      );
    }
    this.specs.push(step);
  }

  /** Record a file written during the run so the final result lists it. */
  recordOutput(path: string): void {
    this.outputs.push(path);
  }

  /** Append a recommended next-action line shown to the operator at the end. */
  recommend(action: string): void {
    this.recommendedNextActions.push(action);
  }

  async execute(): Promise<RunbookResult> {
    const runId = newId("run");
    const startedAt = nowIso();
    const t0 = Date.now();
    const { logger, apply } = this.opts;

    logger.info("runbook: start", {
      runId,
      scriptName: this.opts.scriptName,
      apply,
      stepCount: this.specs.length,
    });
    logger.info("runbook: plan", { steps: this.specs.map(describe) });

    const results: StepResult[] = [];
    let aborted = false;
    let abortReason: string | undefined;

    for (const spec of this.specs) {
      if (aborted) {
        results.push({
          id: spec.id,
          label: spec.label,
          kind: spec.kind,
          status: "skipped",
          skipReason: "runbook aborted",
          instruction: spec.instruction,
        });
        continue;
      }

      // skipIf predicate short-circuits independently of kind.
      if (spec.skipIf) {
        const result = await spec.skipIf();
        if (result) {
          const reason = typeof result === "string" ? result : "skipIf returned true";
          logger.info("runbook: step skipped", { id: spec.id, label: spec.label, reason });
          results.push({
            id: spec.id,
            label: spec.label,
            kind: spec.kind,
            status: "skipped",
            skipReason: reason,
            instruction: spec.instruction,
          });
          continue;
        }
      }

      const r = await this.executeStep(spec);
      results.push(r);
      if (r.status === "failed") {
        aborted = true;
        abortReason = `step "${spec.id}" failed: ${r.error?.message ?? "unknown"}`;
      } else if (spec.kind === "approval-required" && r.status === "skipped") {
        aborted = true;
        abortReason = `step "${spec.id}" declined`;
      }
    }

    const finishedAt = nowIso();
    const elapsedMs = Date.now() - t0;
    const summary = summarize(results);

    logger.info("runbook: complete", {
      runId,
      elapsedMs,
      aborted,
      abortReason,
      summary,
    });

    return {
      scriptName: this.opts.scriptName,
      runId,
      startedAt,
      finishedAt,
      elapsedMs,
      apply,
      dryRun: !apply,
      aborted,
      abortReason,
      steps: results,
      summary,
      outputsProduced: [...this.outputs],
      recommendedNextActions: [...this.recommendedNextActions],
    };
  }

  private async executeStep(spec: StepSpec): Promise<StepResult> {
    const base: StepResult = {
      id: spec.id,
      label: spec.label,
      kind: spec.kind,
      status: "planned",
      instruction: spec.instruction,
    };

    this.opts.logger.info("runbook: step start", {
      id: spec.id,
      kind: spec.kind,
      label: spec.label,
    });

    if (spec.kind === "automatic") {
      if (spec.requiresApply && !this.opts.apply) {
        return {
          ...base,
          status: "skipped",
          skipReason: "dry-run: step is marked requiresApply=true",
        };
      }
      return await this.runAutomatic(spec, base);
    }

    if (spec.kind === "manual") {
      this.opts.logger.info("runbook: manual step — operator-run outside this script", {
        id: spec.id,
        instruction: spec.instruction,
      });
      const preconfirmed = this.preconfirmed(spec);
      if (preconfirmed) {
        return {
          ...base,
          status: "confirmed",
          confirmedBy: preconfirmed,
          confirmedAt: nowIso(),
        };
      }
      return {
        ...base,
        status: "skipped",
        skipReason:
          "manual step: operator-run outside this script; pass --confirm-manual-step <id> to mark confirmed",
      };
    }

    // approval-required
    return await this.runApprovalRequired(spec, base);
  }

  private async runAutomatic(spec: StepSpec, base: StepResult): Promise<StepResult> {
    const startedAt = nowIso();
    const t0 = Date.now();
    try {
      const result = await spec.run!();
      const finishedAt = nowIso();
      const out: StepResult = {
        ...base,
        status: "executed",
        startedAt,
        finishedAt,
        elapsedMs: Date.now() - t0,
      };
      if (result !== undefined) out.result = result;
      this.opts.logger.info("runbook: step executed", {
        id: spec.id,
        elapsedMs: out.elapsedMs,
      });
      return out;
    } catch (err: unknown) {
      const finishedAt = nowIso();
      const message = err instanceof Error ? err.message : String(err);
      const code = (err as { code?: string }).code;
      this.opts.logger.error("runbook: step failed", err, { id: spec.id });
      return {
        ...base,
        status: "failed",
        startedAt,
        finishedAt,
        elapsedMs: Date.now() - t0,
        error: { code, message },
      };
    }
  }

  private async runApprovalRequired(
    spec: StepSpec,
    base: StepResult,
  ): Promise<StepResult> {
    // Pre-confirmed via flag?
    const preconfirmed = this.preconfirmed(spec);
    if (preconfirmed) {
      this.opts.logger.info("runbook: approval step auto-confirmed", {
        id: spec.id,
        by: preconfirmed,
      });
      return {
        ...base,
        status: "confirmed",
        confirmedBy: preconfirmed,
        confirmedAt: nowIso(),
      };
    }

    // Need interactive confirmation.
    if (!this.interactive) {
      return {
        ...base,
        status: "failed",
        error: {
          code: "APPROVAL_REQUIRED_NO_TTY",
          message:
            `Approval-required step "${spec.id}" cannot be confirmed: stdin is not a TTY. ` +
            `Pass --confirm-manual-step ${spec.id} or --confirm-all-manual, or run in a terminal.`,
        },
      };
    }

    // Show the instruction prominently before prompting.
    process.stderr.write(
      `\n─── Approval-required step: ${spec.id} ───\n${spec.label}\n${spec.instruction ?? ""}\n\n`,
    );
    const ok = await this.prompt(`Confirm step "${spec.id}" completed? [y/N] `);
    if (ok) {
      this.opts.logger.info("runbook: approval step confirmed via tty", { id: spec.id });
      return {
        ...base,
        status: "confirmed",
        confirmedBy: "tty",
        confirmedAt: nowIso(),
      };
    }
    this.opts.logger.warn("runbook: approval step declined; aborting remaining steps", {
      id: spec.id,
    });
    return {
      ...base,
      status: "skipped",
      skipReason: "operator declined approval",
    };
  }

  private preconfirmed(spec: StepSpec): ConfirmedBy | null {
    if (this.opts.autoConfirm) return "confirm-all";
    if (this.opts.confirmedStepIds.has(spec.id)) return "flag";
    return null;
  }
}

// ─── helpers ───────────────────────────────────────────────────────────────

function describe(s: StepSpec): {
  id: string;
  label: string;
  kind: StepKind;
  hasRun: boolean;
} {
  return { id: s.id, label: s.label, kind: s.kind, hasRun: !!s.run };
}

function summarize(results: StepResult[]): RunbookResult["summary"] {
  const summary = { planned: 0, executed: 0, confirmed: 0, skipped: 0, failed: 0 };
  for (const r of results) {
    if (r.status === "executed") summary.executed += 1;
    else if (r.status === "confirmed") summary.confirmed += 1;
    else if (r.status === "skipped") summary.skipped += 1;
    else if (r.status === "failed") summary.failed += 1;
    else summary.planned += 1;
  }
  return summary;
}

async function defaultPrompt(message: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await rl.question(message);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}
