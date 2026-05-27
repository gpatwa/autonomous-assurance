/**
 * Blast radius module.
 *
 * Computes the impact scope of a detected incident by analyzing affected
 * users, groups, applications, and downstream permissions. The current
 * MVP slice supports CANONICAL-001 only.
 */

export {
  computeCanonicalBlastRadius,
  UnsupportedBlastRadiusInputError,
} from "./canonical.js";
export type { ComputeCanonicalBlastRadiusOptions } from "./canonical.js";
