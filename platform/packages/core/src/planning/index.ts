/**
 * Planning module.
 *
 * Generates remediation plans for detected incidents. Produces a sequence
 * of proposed actions that can be reviewed and approved before execution.
 * Plans never execute directly -- they are handed off to the execution
 * service via approval tokens.
 */

export {
  generateCanonicalRecoveryPlan,
  UnsupportedPlanningInputError,
} from "./canonical.js";
export type { GenerateCanonicalRecoveryPlanOptions } from "./canonical.js";
