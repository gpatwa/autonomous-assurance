/**
 * Deterministic ID derivation (N1).
 *
 * The architecture mandates IDs derived from immutable inputs so that
 * re-running the pipeline against the same logical input produces the
 * same IDs — and ON CONFLICT DO NOTHING (N2) makes the second insert a
 * no-op rather than a duplicate.
 *
 * Strangler Fig (D8): the core's `correlate` and `promoteBundleToIncident`
 * default to random UUIDs. The orchestrator post-processes the bundles
 * and incidents with deterministic IDs derived here. This keeps the core
 * pure and testable while the orchestrator carries the idempotency burden.
 *
 * Hash inputs:
 *   bundle_id   = sha256(tenant_id + ":" + sorted(change_ids))
 *   incident_id = sha256(tenant_id + ":" + bundle_id)
 *
 * Output is `bnd_<32 hex chars>` / `inc_<32 hex chars>`. 128 bits of
 * collision space — plenty for our ID needs (~10^19 distinct IDs before
 * birthday-paradox collision risk crosses 10^-12).
 */

import { createHash } from "node:crypto";

/**
 * Deterministic bundle ID. Same (tenant_id, sorted change_ids) → same
 * bundle_id, run after run.
 */
export function deterministicBundleId(
  tenantId: string,
  changeIds: readonly string[],
): string {
  const hash = createHash("sha256");
  hash.update(tenantId);
  hash.update(":");
  // Sort for stability — correlate's input order shouldn't affect the ID.
  for (const id of [...changeIds].sort()) {
    hash.update(id);
    hash.update(",");
  }
  return `bnd_${hash.digest("hex").slice(0, 32)}`;
}

/**
 * Deterministic incident ID. Promoting the same bundle twice → same
 * incident_id; the UNIQUE(tenant_id, bundle_id) constraint also catches
 * this at the DB layer (N1 belt-and-suspenders).
 */
export function deterministicIncidentId(
  tenantId: string,
  bundleId: string,
): string {
  const hash = createHash("sha256");
  hash.update(tenantId);
  hash.update(":");
  hash.update(bundleId);
  return `inc_${hash.digest("hex").slice(0, 32)}`;
}
