/**
 * Phase 1 correlation entrypoint.
 *
 * Pure function over NormalizedChange[]. Groups the canonical
 * memberAdded burst into CorrelatedChangeBundles and returns any
 * changes that could not be bundled under this narrow slice.
 *
 * Correlation state is in-process for this slice. No Redis, no queue,
 * no distributed store. See docs/SCALING_STRATEGY.md §8 for the Phase 1
 * backlog that adds external state later — this pass deliberately
 * defers it.
 *
 * Signals used (WI-05 §23.E):
 *   - same tenantId
 *   - same actor service-principal ID
 *   - same target group (derived from NormalizedChange.afterState.state.groupId)
 *   - same changeType (memberAdded)
 *   - observedAt within the same correlation window (default 60 s)
 *
 * Explicitly does NOT use Microsoft operationBatchId — WI-05 observed
 * distinct correlationId per member-add.
 */

import { randomUUID } from "node:crypto";
import { rootLogger, type Logger } from "@kavachiq/platform";
import type { CorrelatedChangeBundle, NormalizedChange } from "@kavachiq/schema";
import { computeMemberAddedGroupKey } from "./group-key.js";
import {
  buildMemberAddedBundle,
  type ScoringPolicy,
} from "./member-added-bundle.js";

const DEFAULT_WINDOW_MS = 60_000; // 60-second correlation window (WI-05 §23.E)

export interface CorrelateOptions {
  /** Time-bucket size in ms. Default 60_000. */
  windowMs?: number;
  /** Scoring policy (sensitivity list). */
  scoringPolicy: ScoringPolicy;
  /** BundleId factory. Tests inject deterministic values; default `bnd_<uuid>`. */
  newBundleId?: () => string;
  logger?: Logger;
}

export interface CorrelateResult {
  bundles: CorrelatedChangeBundle[];
  unbundled: Array<{ changeId: string; reason: string }>;
}

export function correlateNormalizedChanges(
  changes: NormalizedChange[],
  opts: CorrelateOptions,
): CorrelateResult {
  const log = opts.logger ?? rootLogger;
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
  const newBundleId = opts.newBundleId ?? (() => `bnd_${randomUUID()}`);

  // Group by key. A null key means this slice cannot bundle the change.
  const groups = new Map<
    string,
    { groupId: string; changes: NormalizedChange[] }
  >();
  const unbundled: Array<{ changeId: string; reason: string }> = [];

  for (const change of changes) {
    const ctx = computeMemberAddedGroupKey(change, windowMs);
    if (!ctx) {
      unbundled.push({
        changeId: change.changeId,
        reason: reasonForUngroupable(change),
      });
      continue;
    }
    const existing = groups.get(ctx.key);
    if (existing) {
      existing.changes.push(change);
    } else {
      groups.set(ctx.key, { groupId: ctx.groupId, changes: [change] });
    }
  }

  const bundles: CorrelatedChangeBundle[] = [];
  for (const { groupId, changes: grouped } of groups.values()) {
    bundles.push(
      buildMemberAddedBundle({
        changes: grouped,
        groupId,
        bundleId: newBundleId(),
        scoringPolicy: opts.scoringPolicy,
      }),
    );
  }

  log.info("correlate: complete", {
    input: changes.length,
    bundles: bundles.length,
    unbundled: unbundled.length,
    windowMs,
  });

  return { bundles, unbundled };
}

function reasonForUngroupable(change: NormalizedChange): string {
  if (change.changeType !== "memberAdded") {
    return `Phase 1 slice only handles memberAdded; got changeType=${change.changeType}`;
  }
  if (change.actor.type !== "service-principal") {
    return `Phase 1 slice only handles service-principal actors; got actor.type=${change.actor.type}`;
  }
  if (!change.actor.id) {
    return "actor.id missing — cannot group without a stable actor identity";
  }
  const state = change.afterState.state as { groupId?: unknown };
  if (typeof state.groupId !== "string") {
    return "afterState.state.groupId missing — cannot derive target group";
  }
  return "unknown reason — see group-key.ts for the grouping contract";
}
