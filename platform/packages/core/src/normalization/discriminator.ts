/**
 * Event classification.
 *
 * WI-05 observation (CONNECTOR_AND_INGESTION_DESIGN.md §23.D):
 * activityDisplayName is the primary discriminator. The `category`
 * field is unreliable — M3 (`Add app role assignment…`) lives under
 * `UserManagement`, not `ApplicationManagement`. Keep this function
 * case-insensitive and substring-based.
 *
 * Phase 1 slice implements only "group-membership-add". Other classes
 * classify correctly but are unmapped; the caller skips unimplemented
 * classes explicitly rather than silently dropping events.
 */

export type CanonicalChangeClass =
  | "group-membership-add"
  | "group-membership-remove"
  | "conditional-access-change"
  | "app-role-assignment-change"
  | "sp-credential-change"
  | "unmatched";

export function classifyEvent(activityDisplayName: string | undefined | null): CanonicalChangeClass {
  if (!activityDisplayName) return "unmatched";
  const a = activityDisplayName.toLowerCase();
  if (a.includes("add member to group")) return "group-membership-add";
  if (a.includes("remove member from group")) return "group-membership-remove";
  if (a.includes("conditional access policy")) return "conditional-access-change";
  if (a.includes("app role assignment")) return "app-role-assignment-change";
  if (a.includes("certificates and secrets management")) return "sp-credential-change";
  return "unmatched";
}
