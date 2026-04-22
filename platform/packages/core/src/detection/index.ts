/**
 * Detection module — Phase 1 slice (canonical memberAdded bundle → Incident).
 *
 * Promotes a finalized CorrelatedChangeBundle to an Incident on the
 * immediate-creation path. Non-memberAdded bundles, non-finalized
 * bundles, and sub-threshold bundles are rejected with
 * `UnsupportedBundleError`; candidate-state workflows are a later slice.
 *
 * Scoring is NOT recomputed here. The four weighted DetectionSignals
 * are re-emitted via `computeMemberAddedDetectionSignals` from
 * correlation. Invariant: sum(signals.weight) === bundle.incidentCandidateScore.
 */

export {
  promoteBundleToIncident,
  IMMEDIATE_CREATION_THRESHOLD,
  UnsupportedBundleError,
} from "./promote.js";
export type {
  DetectionPolicy,
  PromoteBundleOptions,
} from "./promote.js";
