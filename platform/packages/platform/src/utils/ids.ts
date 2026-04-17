import { randomUUID } from "node:crypto";

/**
 * Generate an opaque ID. An optional prefix makes logs grep-friendly and
 * lets a reader tell at a glance what kind of entity an ID refers to.
 * IDs are opaque to clients — never parsed, never pattern-matched for
 * logic.
 *
 * Convention: prefix uses the lowercase three-letter shortcode agreed in
 * the data model doc (inc_, pln_, stp_, act_, bnd_, chg_, raw_, aud_).
 */
export function newId(prefix?: string): string {
  const uuid = randomUUID();
  return prefix ? `${prefix}_${uuid}` : uuid;
}
