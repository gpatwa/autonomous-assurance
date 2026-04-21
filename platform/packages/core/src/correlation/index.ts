/**
 * Correlation module — Phase 1 slice (canonical memberAdded burst).
 *
 * Groups NormalizedChange[] into CorrelatedChangeBundles using tenant +
 * actor + target group + change type + 60-second time bucket. Pure
 * function; in-process state only. External correlation store is
 * deferred (see docs/SCALING_STRATEGY.md §8).
 *
 * See docs/CONNECTOR_AND_INGESTION_DESIGN.md §12 and §23.E for design,
 * and docs/SPIKE_REPORT_AUDIT_LOG_COMPLETENESS.md for the WI-05 evidence
 * that rules out Microsoft batch correlation for member-adds.
 */

export { correlateNormalizedChanges } from "./correlate.js";
export type { CorrelateOptions, CorrelateResult } from "./correlate.js";

export { computeMemberAddedGroupKey } from "./group-key.js";
export type { GroupKeyContext } from "./group-key.js";

export { buildMemberAddedBundle } from "./member-added-bundle.js";
export type {
  ScoringPolicy,
  BuildMemberAddedBundleArgs,
} from "./member-added-bundle.js";
