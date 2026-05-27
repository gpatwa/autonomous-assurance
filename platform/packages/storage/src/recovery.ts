/**
 * Recovery execution persistence.
 *
 * This module is the storage footing for the live recovery MVP. It follows
 * the same conventions as the ingestion path: callers run inside
 * withTenantContext, every row carries tenant_id, and idempotent create
 * operations use INSERT ... ON CONFLICT DO NOTHING.
 */

import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type {
  ActionInstance,
  ApprovalRecord,
  AuditRecord,
  BlastRadiusResult,
  RecoveryPlan,
  ValidationRecord,
} from "@kavachiq/schema";

export interface InsertRecoveryEntityResult {
  inserted: boolean;
}

export type AppendAuditRecordArgs = Omit<AuditRecord, "previousHash" | "recordHash">;

export async function insertBlastRadiusResult(
  client: PoolClient,
  result: BlastRadiusResult,
): Promise<InsertRecoveryEntityResult> {
  await assertTenantContext(client, "insertBlastRadiusResult", result.tenantId);

  const insert = await client.query(
    `INSERT INTO blast_radius_results (
       result_id, tenant_id, incident_id, computed_at, root_change_ids,
       total_impacted_objects, overall_confidence, graph_refresh_age,
       computation_duration, payload, schema_version
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
     )
     ON CONFLICT (result_id) DO NOTHING`,
    [
      result.resultId,
      result.tenantId,
      result.incidentId,
      result.computedAt,
      result.rootChangeIds,
      result.totalImpactedObjects,
      jsonb(result.overallConfidence),
      result.graphRefreshAge,
      result.computationDuration,
      jsonb(result),
      result.schemaVersion,
    ],
  );

  return { inserted: insert.rowCount === 1 };
}

export async function findBlastRadiusResultById(
  client: PoolClient,
  resultId: string,
): Promise<BlastRadiusResult | null> {
  const result = await client.query<{ payload: BlastRadiusResult }>(
    "SELECT payload FROM blast_radius_results WHERE result_id = $1",
    [resultId],
  );
  return result.rows[0]?.payload ?? null;
}

export async function findLatestBlastRadiusResultForIncident(
  client: PoolClient,
  incidentId: string,
): Promise<BlastRadiusResult | null> {
  const result = await client.query<{ payload: BlastRadiusResult }>(
    `SELECT payload
     FROM blast_radius_results
     WHERE incident_id = $1
     ORDER BY computed_at DESC
     LIMIT 1`,
    [incidentId],
  );
  return result.rows[0]?.payload ?? null;
}

export async function insertRecoveryPlan(
  client: PoolClient,
  plan: RecoveryPlan,
): Promise<InsertRecoveryEntityResult> {
  await assertTenantContext(client, "insertRecoveryPlan", plan.tenantId);

  const insert = await client.query(
    `INSERT INTO recovery_plans (
       plan_id, tenant_id, incident_id, version, status, baseline_version_id,
       trusted_state_outcome, generated_at, superseded_by, payload,
       schema_version
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
     )
     ON CONFLICT (tenant_id, incident_id, version) DO NOTHING`,
    [
      plan.planId,
      plan.tenantId,
      plan.incidentId,
      plan.version,
      plan.status,
      plan.baselineVersionId,
      jsonb(plan.trustedStateOutcome),
      plan.generatedAt,
      jsonb(plan.supersededBy),
      jsonb(plan),
      plan.schemaVersion,
    ],
  );

  return { inserted: insert.rowCount === 1 };
}

export async function updateRecoveryPlan(
  client: PoolClient,
  plan: RecoveryPlan,
): Promise<boolean> {
  await assertTenantContext(client, "updateRecoveryPlan", plan.tenantId);

  const update = await client.query(
    `UPDATE recovery_plans
     SET status = $1,
         trusted_state_outcome = $2,
         superseded_by = $3,
         payload = $4,
         updated_at = now()
     WHERE plan_id = $5 AND version = $6
     RETURNING plan_id`,
    [
      plan.status,
      jsonb(plan.trustedStateOutcome),
      jsonb(plan.supersededBy),
      jsonb(plan),
      plan.planId,
      plan.version,
    ],
  );

  return (update.rowCount ?? 0) === 1;
}

export async function findRecoveryPlan(
  client: PoolClient,
  planId: string,
  version: number,
): Promise<RecoveryPlan | null> {
  const result = await client.query<{ payload: RecoveryPlan }>(
    "SELECT payload FROM recovery_plans WHERE plan_id = $1 AND version = $2",
    [planId, version],
  );
  return result.rows[0]?.payload ?? null;
}

export async function findLatestRecoveryPlanForIncident(
  client: PoolClient,
  incidentId: string,
): Promise<RecoveryPlan | null> {
  const result = await client.query<{ payload: RecoveryPlan }>(
    `SELECT payload
     FROM recovery_plans
     WHERE incident_id = $1
     ORDER BY version DESC
     LIMIT 1`,
    [incidentId],
  );
  return result.rows[0]?.payload ?? null;
}

export async function insertApprovalRecord(
  client: PoolClient,
  approval: ApprovalRecord,
): Promise<InsertRecoveryEntityResult> {
  await assertTenantContext(client, "insertApprovalRecord", approval.tenantId);

  const insert = await client.query(
    `INSERT INTO approval_records (
       approval_id, tenant_id, incident_id, plan_id, plan_version, step_id,
       approved_by, approved_at, expires_at, state_hash_at_approval,
       target_object_id, target_state, signature, invalidated,
       invalidated_reason, payload, schema_version
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
     )
     ON CONFLICT (approval_id) DO NOTHING`,
    [
      approval.approvalId,
      approval.tenantId,
      approval.incidentId,
      approval.planId,
      approval.planVersion,
      approval.stepId,
      approval.approvedBy,
      approval.approvedAt,
      approval.expiresAt,
      approval.stateHashAtApproval,
      approval.targetObjectId,
      jsonb(approval.targetState),
      approval.signature,
      approval.invalidated,
      approval.invalidatedReason,
      jsonb(approval),
      approval.schemaVersion,
    ],
  );

  return { inserted: insert.rowCount === 1 };
}

export async function findApprovalRecord(
  client: PoolClient,
  approvalId: string,
): Promise<ApprovalRecord | null> {
  const result = await client.query<{ payload: ApprovalRecord }>(
    "SELECT payload FROM approval_records WHERE approval_id = $1",
    [approvalId],
  );
  return result.rows[0]?.payload ?? null;
}

export async function listApprovalRecordsForIncident(
  client: PoolClient,
  incidentId: string,
): Promise<ApprovalRecord[]> {
  const result = await client.query<{ payload: ApprovalRecord }>(
    `SELECT payload
     FROM approval_records
     WHERE incident_id = $1
     ORDER BY approved_at ASC`,
    [incidentId],
  );
  return result.rows.map((row) => row.payload);
}

export async function invalidateApprovalRecord(
  client: PoolClient,
  approvalId: string,
  reason: string,
): Promise<boolean> {
  const update = await client.query(
    `UPDATE approval_records
     SET invalidated = true,
         invalidated_reason = $2,
         payload = jsonb_set(
           jsonb_set(payload, '{invalidated}', 'true'::jsonb),
           '{invalidatedReason}', to_jsonb($2::text)
         )
     WHERE approval_id = $1
     RETURNING approval_id`,
    [approvalId, reason],
  );
  return (update.rowCount ?? 0) === 1;
}

export async function insertActionInstance(
  client: PoolClient,
  instance: ActionInstance,
): Promise<InsertRecoveryEntityResult> {
  await assertTenantContext(client, "insertActionInstance", instance.tenantId);

  const insert = await client.query(
    `INSERT INTO action_instances (
       instance_id, tenant_id, template_id, incident_id, plan_id, plan_version,
       step_id, approval_id, target_object_id, target_object_name,
       members_to_remove, expected_post_state, status, sub_actions,
       pre_execution_state, post_execution_state, circuit_broken,
       validation_handoff_id, payload, schema_version, created_at, started_at,
       completed_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
       $16, $17, $18, $19, $20, $21, $22, $23
     )
     ON CONFLICT (instance_id) DO NOTHING`,
    [
      instance.instanceId,
      instance.tenantId,
      instance.templateId,
      instance.incidentId,
      instance.planId,
      instance.planVersion,
      instance.stepId,
      instance.approvalId,
      instance.targetObjectId,
      instance.targetObjectName,
      jsonb(instance.membersToRemove),
      jsonb(instance.expectedPostState),
      instance.status,
      jsonb(instance.subActions),
      jsonb(instance.preExecutionState),
      jsonb(instance.postExecutionState),
      instance.circuitBroken,
      instance.validationHandoffId,
      jsonb(instance),
      instance.schemaVersion,
      instance.createdAt,
      instance.startedAt,
      instance.completedAt,
    ],
  );

  return { inserted: insert.rowCount === 1 };
}

export async function updateActionInstance(
  client: PoolClient,
  instance: ActionInstance,
): Promise<boolean> {
  await assertTenantContext(client, "updateActionInstance", instance.tenantId);

  const update = await client.query(
    `UPDATE action_instances
     SET status = $1,
         sub_actions = $2,
         pre_execution_state = $3,
         post_execution_state = $4,
         circuit_broken = $5,
         validation_handoff_id = $6,
         payload = $7,
         started_at = $8,
         completed_at = $9,
         updated_at = now()
     WHERE instance_id = $10
     RETURNING instance_id`,
    [
      instance.status,
      jsonb(instance.subActions),
      jsonb(instance.preExecutionState),
      jsonb(instance.postExecutionState),
      instance.circuitBroken,
      instance.validationHandoffId,
      jsonb(instance),
      instance.startedAt,
      instance.completedAt,
      instance.instanceId,
    ],
  );

  return (update.rowCount ?? 0) === 1;
}

export async function findActionInstance(
  client: PoolClient,
  instanceId: string,
): Promise<ActionInstance | null> {
  const result = await client.query<{ payload: ActionInstance }>(
    "SELECT payload FROM action_instances WHERE instance_id = $1",
    [instanceId],
  );
  return result.rows[0]?.payload ?? null;
}

export async function listActionInstancesForIncident(
  client: PoolClient,
  incidentId: string,
): Promise<ActionInstance[]> {
  const result = await client.query<{ payload: ActionInstance }>(
    `SELECT payload
     FROM action_instances
     WHERE incident_id = $1
     ORDER BY created_at ASC`,
    [incidentId],
  );
  return result.rows.map((row) => row.payload);
}

export async function insertValidationRecord(
  client: PoolClient,
  validation: ValidationRecord,
): Promise<InsertRecoveryEntityResult> {
  await assertTenantContext(client, "insertValidationRecord", validation.tenantId);

  const insert = await client.query(
    `INSERT INTO validation_records (
       validation_id, tenant_id, incident_id, step_id, object_id,
       target_state, observed_state, result, confidence, validated_at,
       revalidate_at, revalidation_id, payload, schema_version
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
     )
     ON CONFLICT (validation_id) DO NOTHING`,
    [
      validation.validationId,
      validation.tenantId,
      validation.incidentId,
      validation.stepId,
      validation.objectId,
      jsonb(validation.targetState),
      jsonb(validation.observedState),
      validation.result,
      jsonb(validation.confidence),
      validation.validatedAt,
      validation.revalidateAt,
      validation.revalidationId,
      jsonb(validation),
      validation.schemaVersion,
    ],
  );

  return { inserted: insert.rowCount === 1 };
}

export async function listValidationRecordsForIncident(
  client: PoolClient,
  incidentId: string,
): Promise<ValidationRecord[]> {
  const result = await client.query<{ payload: ValidationRecord }>(
    `SELECT payload
     FROM validation_records
     WHERE incident_id = $1
     ORDER BY validated_at DESC`,
    [incidentId],
  );
  return result.rows.map((row) => row.payload);
}

export async function appendAuditRecord(
  client: PoolClient,
  args: AppendAuditRecordArgs,
): Promise<AuditRecord> {
  await assertTenantContext(client, "appendAuditRecord", args.tenantId);

  // Serialize appends per tenant so the hash chain is deterministic even
  // under concurrent operator/execution events.
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)", [
    args.tenantId,
  ]);

  const previous = await client.query<{ record_hash: string }>(
    `SELECT record_hash
     FROM audit_records
     ORDER BY timestamp DESC, created_at DESC
     LIMIT 1`,
  );
  const previousHash = previous.rows[0]?.record_hash ?? "0".repeat(64);
  const recordHash = sha256(stableStringify({ ...args, previousHash }));
  const record: AuditRecord = { ...args, previousHash, recordHash };

  await client.query(
    `INSERT INTO audit_records (
       audit_record_id, tenant_id, event_type, actor, entity_type, entity_id,
       action, detail, previous_hash, record_hash, timestamp, schema_version
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
     )`,
    [
      record.auditRecordId,
      record.tenantId,
      record.eventType,
      jsonb(record.actor),
      record.entityType,
      record.entityId,
      record.action,
      jsonb(record.detail),
      record.previousHash,
      record.recordHash,
      record.timestamp,
      record.schemaVersion,
    ],
  );

  return record;
}

export async function listAuditRecordsForEntity(
  client: PoolClient,
  entityType: string,
  entityId: string,
): Promise<AuditRecord[]> {
  const result = await client.query<AuditRecordRow>(
    `SELECT audit_record_id, tenant_id::text, event_type, actor, entity_type,
            entity_id, action, detail, previous_hash, record_hash,
            timestamp::text, schema_version
     FROM audit_records
     WHERE entity_type = $1 AND entity_id = $2
     ORDER BY timestamp ASC`,
    [entityType, entityId],
  );

  return result.rows.map(toAuditRecord);
}

export async function listAuditRecordsForIncident(
  client: PoolClient,
  incidentId: string,
): Promise<AuditRecord[]> {
  const result = await client.query<AuditRecordRow>(
    `SELECT audit_record_id, tenant_id::text, event_type, actor, entity_type,
            entity_id, action, detail, previous_hash, record_hash,
            timestamp::text, schema_version
     FROM audit_records
     WHERE entity_id = $1 OR detail->>'incidentId' = $1
     ORDER BY timestamp ASC, created_at ASC`,
    [incidentId],
  );

  return result.rows.map(toAuditRecord);
}

interface AuditRecordRow {
  audit_record_id: string;
  tenant_id: string;
  event_type: AuditRecord["eventType"];
  actor: AuditRecord["actor"];
  entity_type: string;
  entity_id: string;
  action: string;
  detail: Record<string, unknown>;
  previous_hash: string;
  record_hash: string;
  timestamp: string;
  schema_version: number;
}

function toAuditRecord(row: AuditRecordRow): AuditRecord {
  return {
    auditRecordId: row.audit_record_id,
    tenantId: row.tenant_id,
    eventType: row.event_type,
    actor: row.actor,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    detail: row.detail,
    previousHash: row.previous_hash,
    recordHash: row.record_hash,
    timestamp: row.timestamp,
    schemaVersion: row.schema_version,
  };
}

async function assertTenantContext(
  client: PoolClient,
  operation: string,
  tenantId: string,
): Promise<void> {
  const setting = await client.query<{ tenant_id: string | null }>(
    "SELECT current_setting('app.tenant_id', true) AS tenant_id",
  );
  const sessionTenantId = setting.rows[0]?.tenant_id;
  if (!sessionTenantId) {
    throw new Error(
      `${operation}: app.tenant_id is not set on the connection. Call withTenantContext first.`,
    );
  }
  if (sessionTenantId !== tenantId) {
    throw new Error(
      `${operation}: tenant mismatch. Connection app.tenant_id=${sessionTenantId} but entity.tenantId=${tenantId}`,
    );
  }
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).filter((key) => record[key] !== undefined).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function jsonb(value: unknown): string | null {
  return value === null || value === undefined ? null : JSON.stringify(value);
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
