/**
 * Decoder for Entra audit event value encodings.
 *
 * WI-05 observed two distinct encoding conventions on
 * `modifiedProperties[*].{oldValue, newValue}` (see
 * `docs/CONNECTOR_AND_INGESTION_DESIGN.md §23.B`):
 *
 *   1. Double-JSON-encoded scalar / array strings (M1 / M3 / M4):
 *        `"\"45a4b187-…\""` → outer layer is JSON encoding; strip once.
 *        `"[]"` → empty array; semantically "empty set", not missing.
 *        `"[\"<entry>\"]"` → array with one entry.
 *   2. Single JSON-encoded full object (M2 Conditional Access policy):
 *        A complete policy JSON string. Parse with `JSON.parse` once.
 *
 * This slice (group-member-add) only needs scalar unwrapping. The
 * policy-object path will be added when the CA normalizer is built.
 */

/**
 * Unwrap the outer JSON-encoding layer from a scalar string value.
 *
 *   `"\"abc\""` → `"abc"`
 *   `"\"\""`    → `""`    (empty string, not null)
 *   `null`      → `null`  (truly absent)
 *   `"xyz"`     → `"xyz"` (fallback: return as-is if not a JSON string)
 *
 * Does NOT attempt to parse array-shaped strings like `"[]"` — that is
 * `unwrapArrayString` below.
 */
export function unwrapScalar(value: string | null): string | null {
  if (value === null) return null;
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return typeof parsed === "string" ? parsed : value;
    } catch {
      return value;
    }
  }
  return value;
}
