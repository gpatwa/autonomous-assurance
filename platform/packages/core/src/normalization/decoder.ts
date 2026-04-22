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

/**
 * Parse a single-JSON-encoded full-policy object string (M2 convention).
 *
 * The M2 `ConditionalAccessPolicy` modifiedProperty stores the entire
 * policy state as a JSON-encoded object string. One `JSON.parse` call
 * returns the complete policy object. Throws if the value is absent,
 * malformed, or not a JSON object.
 *
 *   `'{"id":"…","state":"…"}'` → `{ id: "…", state: "…" }`
 *   `null`                     → throws
 *   `'123'`                    → throws (not an object)
 *
 * Per WI-05 §23.B this encoding is DISTINCT from M1/M3/M4's double-JSON
 * convention; do not pipe M2 values through `unwrapScalar`.
 */
export function parsePolicyJsonObject(
  value: string | null,
  context: { field: string; eventId?: string },
): Record<string, unknown> {
  if (value === null || value.length === 0) {
    throw new Error(
      `Expected JSON-encoded policy object for field '${context.field}'${
        context.eventId ? ` on event ${context.eventId}` : ""
      }; got ${value === null ? "null" : "empty string"}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (err) {
    throw new Error(
      `Field '${context.field}'${
        context.eventId ? ` on event ${context.eventId}` : ""
      } is not valid JSON: ${(err as Error).message}`,
    );
  }
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    throw new Error(
      `Field '${context.field}'${
        context.eventId ? ` on event ${context.eventId}` : ""
      } parsed to ${Array.isArray(parsed) ? "array" : typeof parsed}; expected object`,
    );
  }
  return parsed as Record<string, unknown>;
}
