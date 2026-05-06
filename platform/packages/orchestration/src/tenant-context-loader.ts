/**
 * Load per-tenant policy context from Postgres.
 *
 * Reads `sensitivity_lists` for the current tenant (via RLS — caller must
 * be inside `withTenantContext`) and produces the policy types the core
 * pipeline expects.
 */

import type { PoolClient } from "pg";
import type { correlation, detection } from "@kavachiq/core";

export interface TenantPolicyContext {
  scoringPolicy: correlation.ScoringPolicy;
  detectionPolicy: detection.DetectionPolicy;
  agentIdentifiedActorIds: ReadonlySet<string>;
}

/**
 * Load tenant policy from `sensitivity_lists`. Returns empty sets when no
 * rows exist — the policy still works (lower scores), no errors.
 *
 * Caller MUST be inside `withTenantContext` so RLS scopes the read.
 */
export async function loadTenantPolicy(
  client: PoolClient,
): Promise<TenantPolicyContext> {
  const result = await client.query<{ list_type: string; object_id: string; display_name: string | null }>(
    `SELECT list_type, object_id, display_name FROM sensitivity_lists`,
  );

  const highSensitivityGroupIds = new Set<string>();
  const agentIdentifiedActorIds = new Set<string>();
  const actorClassifications = new Map<string, string>();

  for (const row of result.rows) {
    if (row.list_type === "high-sensitivity-group") {
      highSensitivityGroupIds.add(row.object_id);
    } else if (row.list_type === "agent-identified-sp") {
      agentIdentifiedActorIds.add(row.object_id);
      // Default classification label until we add a per-actor label column.
      actorClassifications.set(row.object_id, row.display_name ?? "agent");
    }
  }

  return {
    scoringPolicy: { highSensitivityGroupIds },
    detectionPolicy: {
      highSensitivityGroupIds,
      actorClassifications,
    },
    agentIdentifiedActorIds,
  };
}
