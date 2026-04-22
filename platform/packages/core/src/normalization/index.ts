/**
 * Normalization module — Phase 1 ingestion slice.
 *
 * Transforms raw Microsoft Entra audit events (wrapped in RawEvent) into
 * NormalizedChange records conforming to @kavachiq/schema. Current slice
 * implements the group-membership-add path only; other classes are
 * classified but not yet mapped.
 *
 * See docs/CONNECTOR_AND_INGESTION_DESIGN.md §9 and §23 for design, and
 * docs/SPIKE_REPORT_AUDIT_LOG_COMPLETENESS.md for the field-shape
 * evidence that drives decoding and confidence tagging.
 */

export { normalizeRawEvents, UnsupportedChangeClassError } from "./normalize.js";
export type { NormalizeOptions } from "./normalize.js";

export { classifyEvent } from "./discriminator.js";
export type { CanonicalChangeClass } from "./discriminator.js";

export { unwrapScalar, parsePolicyJsonObject } from "./decoder.js";

export {
  createFilesystemSnapshotProvider,
  sha256,
  BaselineNotFoundError,
  BaselineTooNewError,
  BaselineMismatchError,
} from "./snapshot-provider.js";
export type {
  SnapshotProvider,
  GroupMembershipBeforeArgs,
  FilesystemSnapshotProviderOptions,
} from "./snapshot-provider.js";

export { mapMemberAddEvent } from "./member-add.js";
export type { MemberAddMapperOptions } from "./member-add.js";

export { mapCaPolicyUpdateEvent } from "./ca-policy-update.js";
export type { CaPolicyUpdateMapperOptions } from "./ca-policy-update.js";
