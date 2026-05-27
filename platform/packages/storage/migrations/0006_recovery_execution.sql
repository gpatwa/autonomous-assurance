-- 0006_recovery_execution.sql
--
-- Persistence for the live recovery execution MVP.
--
-- Scope:
--   - blast-radius results
--   - versioned recovery plans
--   - operator approvals
--   - mutable action instances
--   - immutable validation records
--   - append-only, hash-chained audit records
--
-- All tenant-scoped tables use RLS via app.tenant_id, matching 0001.

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════
-- Blast radius results — immutable per computation.
-- ═════════════════════════════════════════════════════════════════════════

CREATE TABLE blast_radius_results (
  result_id                text PRIMARY KEY,
  tenant_id                uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  incident_id              text NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
  computed_at              timestamptz NOT NULL,
  root_change_ids          text[] NOT NULL,
  total_impacted_objects   integer NOT NULL CHECK (total_impacted_objects >= 0),
  overall_confidence       jsonb NOT NULL,
  graph_refresh_age        integer NOT NULL CHECK (graph_refresh_age >= 0),
  computation_duration     integer NOT NULL CHECK (computation_duration >= 0),
  payload                  jsonb NOT NULL,
  schema_version           smallint NOT NULL DEFAULT 1,
  created_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, incident_id, result_id)
);

CREATE INDEX blast_radius_results_incident_latest
  ON blast_radius_results (tenant_id, incident_id, computed_at DESC);

ALTER TABLE blast_radius_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_iso ON blast_radius_results
  USING (tenant_id = current_setting('app.tenant_id', false)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', false)::uuid);
GRANT SELECT, INSERT ON blast_radius_results TO kavachiq_app;

-- ═════════════════════════════════════════════════════════════════════════
-- Recovery plans — immutable per version, status/trusted outcome mutable.
-- ═════════════════════════════════════════════════════════════════════════

CREATE TABLE recovery_plans (
  plan_id                 text NOT NULL,
  tenant_id               uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  incident_id             text NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
  version                 integer NOT NULL CHECK (version > 0),
  status                  text NOT NULL CHECK (status IN (
                            'draft', 'pending-approval', 'executing', 'completed',
                            'partial', 'failed', 'cancelled', 'superseded'
                          )),
  baseline_version_id     integer NOT NULL,
  trusted_state_outcome   jsonb,
  generated_at            timestamptz NOT NULL,
  superseded_by           jsonb,
  payload                 jsonb NOT NULL,
  schema_version          smallint NOT NULL DEFAULT 1,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_id, version),
  UNIQUE (tenant_id, incident_id, version)
);

CREATE TRIGGER recovery_plans_updated_at BEFORE UPDATE ON recovery_plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX recovery_plans_incident_latest
  ON recovery_plans (tenant_id, incident_id, version DESC);
CREATE INDEX recovery_plans_status
  ON recovery_plans (tenant_id, status, generated_at DESC);

ALTER TABLE recovery_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_iso ON recovery_plans
  USING (tenant_id = current_setting('app.tenant_id', false)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', false)::uuid);
GRANT SELECT, INSERT, UPDATE ON recovery_plans TO kavachiq_app;

-- ═════════════════════════════════════════════════════════════════════════
-- Approval records — immutable content, invalidation flag mutable.
-- ═════════════════════════════════════════════════════════════════════════

CREATE TABLE approval_records (
  approval_id             text PRIMARY KEY,
  tenant_id               uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  incident_id             text NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
  plan_id                 text NOT NULL,
  plan_version            integer NOT NULL,
  step_id                 text NOT NULL,
  approved_by             text NOT NULL,
  approved_at             timestamptz NOT NULL,
  expires_at              timestamptz NOT NULL,
  state_hash_at_approval  text NOT NULL,
  target_object_id        text NOT NULL,
  target_state            jsonb NOT NULL,
  signature               text NOT NULL,
  invalidated             boolean NOT NULL DEFAULT false,
  invalidated_reason      text,
  payload                 jsonb NOT NULL,
  schema_version          smallint NOT NULL DEFAULT 1,
  created_at              timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (plan_id, plan_version) REFERENCES recovery_plans(plan_id, version)
);

CREATE INDEX approval_records_incident
  ON approval_records (tenant_id, incident_id, approved_at DESC);
CREATE INDEX approval_records_step
  ON approval_records (tenant_id, plan_id, plan_version, step_id);
CREATE INDEX approval_records_expires
  ON approval_records (tenant_id, expires_at)
  WHERE invalidated = false;

ALTER TABLE approval_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_iso ON approval_records
  USING (tenant_id = current_setting('app.tenant_id', false)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', false)::uuid);
GRANT SELECT, INSERT, UPDATE ON approval_records TO kavachiq_app;

-- ═════════════════════════════════════════════════════════════════════════
-- Action instances — mutable lifecycle state for system execution.
-- ═════════════════════════════════════════════════════════════════════════

CREATE TABLE action_instances (
  instance_id             text PRIMARY KEY,
  tenant_id               uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  template_id             text NOT NULL,
  incident_id             text NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
  plan_id                 text NOT NULL,
  plan_version            integer NOT NULL,
  step_id                 text NOT NULL,
  approval_id             text NOT NULL REFERENCES approval_records(approval_id),
  target_object_id        text NOT NULL,
  target_object_name      text NOT NULL,
  members_to_remove       jsonb NOT NULL,
  expected_post_state     jsonb NOT NULL,
  status                  text NOT NULL CHECK (status IN (
                            'created', 'validating', 'ready', 'blocked', 'executing',
                            'partially-completed', 'completed', 'failed', 'cancelled'
                          )),
  sub_actions             jsonb NOT NULL,
  pre_execution_state     jsonb,
  post_execution_state    jsonb,
  circuit_broken          boolean NOT NULL DEFAULT false,
  validation_handoff_id   text,
  payload                 jsonb NOT NULL,
  schema_version          smallint NOT NULL DEFAULT 1,
  created_at              timestamptz NOT NULL,
  started_at              timestamptz,
  completed_at            timestamptz,
  updated_at              timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (plan_id, plan_version) REFERENCES recovery_plans(plan_id, version)
);

CREATE TRIGGER action_instances_updated_at BEFORE UPDATE ON action_instances
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX action_instances_incident
  ON action_instances (tenant_id, incident_id, created_at DESC);
CREATE INDEX action_instances_status
  ON action_instances (tenant_id, status, updated_at DESC);
CREATE INDEX action_instances_step
  ON action_instances (tenant_id, plan_id, plan_version, step_id);

ALTER TABLE action_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_iso ON action_instances
  USING (tenant_id = current_setting('app.tenant_id', false)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', false)::uuid);
GRANT SELECT, INSERT, UPDATE ON action_instances TO kavachiq_app;

-- ═════════════════════════════════════════════════════════════════════════
-- Validation records — immutable post-execution validation result.
-- ═════════════════════════════════════════════════════════════════════════

CREATE TABLE validation_records (
  validation_id           text PRIMARY KEY,
  tenant_id               uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  incident_id             text NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
  step_id                 text NOT NULL,
  object_id               text NOT NULL,
  target_state            jsonb NOT NULL,
  observed_state          jsonb NOT NULL,
  result                  text NOT NULL CHECK (result IN ('match', 'mismatch', 'pending-propagation', 'unknown')),
  confidence              jsonb NOT NULL,
  validated_at            timestamptz NOT NULL,
  revalidate_at           timestamptz,
  revalidation_id         text,
  payload                 jsonb NOT NULL,
  schema_version          smallint NOT NULL DEFAULT 1,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX validation_records_incident
  ON validation_records (tenant_id, incident_id, validated_at DESC);
CREATE INDEX validation_records_step
  ON validation_records (tenant_id, step_id, validated_at DESC);
CREATE INDEX validation_records_revalidate
  ON validation_records (tenant_id, revalidate_at)
  WHERE revalidate_at IS NOT NULL;

ALTER TABLE validation_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_iso ON validation_records
  USING (tenant_id = current_setting('app.tenant_id', false)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', false)::uuid);
GRANT SELECT, INSERT ON validation_records TO kavachiq_app;

-- ═════════════════════════════════════════════════════════════════════════
-- Audit records — append-only and hash-chained per tenant.
-- ═════════════════════════════════════════════════════════════════════════

CREATE TABLE audit_records (
  audit_record_id         text PRIMARY KEY,
  tenant_id               uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  event_type              text NOT NULL CHECK (event_type IN (
                            'raw-event-ingested', 'change-normalized', 'bundle-correlated',
                            'candidate-created', 'candidate-promoted', 'candidate-suppressed',
                            'incident-created', 'incident-status-changed', 'incident-closed',
                            'blast-radius-computed', 'baseline-captured', 'baseline-approved',
                            'plan-generated', 'step-approved', 'step-rejected',
                            'action-executed', 'action-failed', 'validation-completed',
                            'safe-mode-activated', 'credential-rotated', 'operator-login',
                            'self-action-detected', 'unauthorized-write-detected'
                          )),
  actor                  jsonb NOT NULL,
  entity_type            text NOT NULL,
  entity_id              text NOT NULL,
  action                 text NOT NULL,
  detail                 jsonb NOT NULL,
  previous_hash          text NOT NULL,
  record_hash            text NOT NULL,
  timestamp              timestamptz NOT NULL,
  schema_version         smallint NOT NULL DEFAULT 1,
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, record_hash)
);

CREATE INDEX audit_records_tenant_time
  ON audit_records (tenant_id, timestamp DESC);
CREATE INDEX audit_records_entity
  ON audit_records (tenant_id, entity_type, entity_id, timestamp DESC);

ALTER TABLE audit_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_iso ON audit_records
  USING (tenant_id = current_setting('app.tenant_id', false)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', false)::uuid);
GRANT SELECT, INSERT ON audit_records TO kavachiq_app;

INSERT INTO schema_migrations (version, description)
  VALUES ('0006_recovery_execution', 'Recovery execution persistence tables');

COMMIT;
