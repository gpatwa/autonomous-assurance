-- 0001_initial.sql
-- KavachIQ multi-tenant platform — initial schema.
-- Approved 2026-05-05 per docs/MULTI_TENANT_ARCHITECTURE_DECISIONS.md.
--
-- Conventions:
--   - All multi-tenant tables have tenant_id uuid NOT NULL.
--   - Postgres Row-Level Security enforces tenant isolation via
--     current_setting('app.tenant_id'). Application sets this per
--     connection acquisition; missing setting → query returns 0 rows.
--   - UNIQUE constraints on natural keys enforce N1 idempotency.
--     Same external event normalized twice → INSERT … ON CONFLICT DO NOTHING.
--   - Two roles:
--       kavachiq_app    — used by API + workers; subject to RLS
--       kavachiq_admin  — used by ops + outbox publisher; BYPASSRLS
--   - Each entity carries schema_version smallint for forward-compatible reads (N10).
--
-- Apply with:
--   PGPASSWORD=… psql -h <pg-fqdn> -U kavachiqadmin -d kavachiq -f 0001_initial.sql

\echo '═══ 0001_initial.sql ═══'

BEGIN;

-- ─── Extensions ──────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;     -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- legacy uuid support if needed

-- ─── Roles ────────────────────────────────────────────────────────────────
-- Created with NOLOGIN; the platform connects as the Postgres admin and
-- uses SET ROLE for per-request scoping in v1. Future: dedicated logins
-- per service via managed identity.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kavachiq_app') THEN
    CREATE ROLE kavachiq_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kavachiq_admin') THEN
    CREATE ROLE kavachiq_admin NOLOGIN BYPASSRLS;
  END IF;
END $$;

-- ─── Updated-at trigger function ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ═════════════════════════════════════════════════════════════════════════
-- Tenants — root entity. NOT subject to RLS (lookup happens before
-- tenant_id is set; otherwise we couldn't find tenants by their Microsoft
-- tenant ID at consent-callback time).
-- ═════════════════════════════════════════════════════════════════════════

CREATE TABLE tenants (
  tenant_id              uuid PRIMARY KEY,
  microsoft_tenant_id    uuid UNIQUE NOT NULL,
  display_name           text NOT NULL,
  status                 text NOT NULL CHECK (status IN ('active', 'suspended', 'offboarding', 'archived')),
  region                 text NOT NULL DEFAULT 'centralus',
  consented_at           timestamptz NOT NULL,
  consent_admin_email    text NOT NULL,
  consent_admin_object_id uuid,
  schema_version         smallint NOT NULL DEFAULT 1,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER tenants_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

GRANT SELECT ON tenants TO kavachiq_app;
GRANT INSERT, UPDATE ON tenants TO kavachiq_admin;

-- ═════════════════════════════════════════════════════════════════════════
-- Tenant credentials — encrypted client-credentials for OAuth token mint.
-- D2: per-tenant DEK (envelope encryption). The DEK lives in Key Vault;
-- this table stores the DEK URI and the ciphertext encrypted with it.
-- ═════════════════════════════════════════════════════════════════════════

CREATE TABLE tenant_credentials (
  tenant_id                uuid PRIMARY KEY REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  client_id                uuid NOT NULL,
  encrypted_client_secret  bytea NOT NULL,
  dek_key_vault_uri        text NOT NULL,
  consented_scopes         text[] NOT NULL,
  rotated_at               timestamptz NOT NULL DEFAULT now(),
  schema_version           smallint NOT NULL DEFAULT 1,
  created_at               timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tenant_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_iso_select ON tenant_credentials FOR SELECT
  USING (tenant_id = current_setting('app.tenant_id', false)::uuid);
CREATE POLICY tenant_iso_modify ON tenant_credentials FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', false)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', false)::uuid);
GRANT SELECT, INSERT, UPDATE ON tenant_credentials TO kavachiq_app;

-- ═════════════════════════════════════════════════════════════════════════
-- Polling state — N4: per-tenant delta token for Microsoft Graph audit.
-- Durable across worker restarts; transactional commit with Blob archive.
-- ═════════════════════════════════════════════════════════════════════════

CREATE TABLE polling_state (
  tenant_id                uuid PRIMARY KEY REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  last_delta_token         text,
  last_poll_started_at     timestamptz,
  last_poll_completed_at   timestamptz,
  last_event_observed_at   timestamptz,
  consecutive_failures     integer NOT NULL DEFAULT 0,
  last_failure_message     text,
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER polling_state_updated_at BEFORE UPDATE ON polling_state
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE polling_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_iso ON polling_state
  USING (tenant_id = current_setting('app.tenant_id', false)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', false)::uuid);
GRANT SELECT, INSERT, UPDATE ON polling_state TO kavachiq_app;

-- ═════════════════════════════════════════════════════════════════════════
-- Raw events — N1 + N10: pointers to immutable Blob archive.
-- raw_event_id is deterministic: "raw_" + sha256(tenant_id::microsoft_event_id).
-- Same Microsoft event ingested twice → same raw_event_id → ON CONFLICT DO NOTHING.
-- ═════════════════════════════════════════════════════════════════════════

CREATE TABLE raw_events (
  raw_event_id        text PRIMARY KEY,                                -- "raw_<sha256>"
  tenant_id           uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  microsoft_event_id  text NOT NULL,
  blob_url            text NOT NULL,
  source_system       text NOT NULL CHECK (source_system IN ('entra-audit', 'm365-audit', 'graph-webhook', 'graph-api-read')),
  observed_at         timestamptz NOT NULL,
  ingested_at         timestamptz NOT NULL DEFAULT now(),
  processing_status   text NOT NULL DEFAULT 'pending'
                      CHECK (processing_status IN ('pending', 'normalized', 'dead-lettered')),
  schema_version      smallint NOT NULL DEFAULT 1,
  -- N1 dedup: same (tenant, microsoft_event_id) collapses to one row
  UNIQUE (tenant_id, microsoft_event_id)
);

CREATE INDEX raw_events_tenant_observed
  ON raw_events (tenant_id, observed_at DESC);
CREATE INDEX raw_events_processing_pending
  ON raw_events (observed_at)
  WHERE processing_status = 'pending';

ALTER TABLE raw_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_iso ON raw_events
  USING (tenant_id = current_setting('app.tenant_id', false)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', false)::uuid);
GRANT SELECT, INSERT, UPDATE ON raw_events TO kavachiq_app;

-- ═════════════════════════════════════════════════════════════════════════
-- Normalized changes — output of @kavachiq/core/normalization.
-- N1: change_id = "chg_" + sha256(tenant_id::raw_event_id::change_class::target_object_id).
-- ═════════════════════════════════════════════════════════════════════════

CREATE TABLE normalized_changes (
  change_id          text PRIMARY KEY,                                 -- "chg_<sha256>"
  tenant_id          uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  raw_event_id       text NOT NULL REFERENCES raw_events(raw_event_id),
  change_type        text NOT NULL,
  target_object_id   text NOT NULL,
  payload            jsonb NOT NULL,                                   -- full NormalizedChange
  bundle_id          text,                                             -- set by correlator (FK added below)
  observed_at        timestamptz NOT NULL,
  ingested_at        timestamptz NOT NULL DEFAULT now(),
  schema_version     smallint NOT NULL DEFAULT 1,
  -- N1 dedup
  UNIQUE (tenant_id, raw_event_id, change_type, target_object_id)
);

CREATE INDEX normalized_changes_tenant_observed
  ON normalized_changes (tenant_id, observed_at DESC);
CREATE INDEX normalized_changes_pending_correlation
  ON normalized_changes (tenant_id, observed_at)
  WHERE bundle_id IS NULL;

ALTER TABLE normalized_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_iso ON normalized_changes
  USING (tenant_id = current_setting('app.tenant_id', false)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', false)::uuid);
GRANT SELECT, INSERT, UPDATE ON normalized_changes TO kavachiq_app;

-- ═════════════════════════════════════════════════════════════════════════
-- Correlated change bundles — N5 stateless batch correlator output.
-- ═════════════════════════════════════════════════════════════════════════

CREATE TABLE correlated_change_bundles (
  bundle_id                  text PRIMARY KEY,                         -- "bnd_<uuid>"
  tenant_id                  uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  primary_actor_id           text NOT NULL,
  primary_actor_type         text NOT NULL,
  affected_object_ids        text[] NOT NULL,
  change_types               text[] NOT NULL,
  time_range_start           timestamptz NOT NULL,
  time_range_end             timestamptz NOT NULL,
  incident_candidate_score   integer NOT NULL CHECK (incident_candidate_score BETWEEN 0 AND 100),
  status                     text NOT NULL CHECK (status IN ('open', 'finalized')),
  finalized_at               timestamptz,
  payload                    jsonb NOT NULL,
  schema_version             smallint NOT NULL DEFAULT 1,
  created_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bundles_tenant_finalized
  ON correlated_change_bundles (tenant_id, finalized_at DESC NULLS LAST);
CREATE INDEX bundles_score
  ON correlated_change_bundles (tenant_id, incident_candidate_score DESC);

ALTER TABLE correlated_change_bundles ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_iso ON correlated_change_bundles
  USING (tenant_id = current_setting('app.tenant_id', false)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', false)::uuid);
GRANT SELECT, INSERT, UPDATE ON correlated_change_bundles TO kavachiq_app;

-- Now that bundles exists, add the back-reference from normalized_changes.
ALTER TABLE normalized_changes
  ADD CONSTRAINT normalized_changes_bundle_fk
  FOREIGN KEY (bundle_id) REFERENCES correlated_change_bundles(bundle_id);

-- ═════════════════════════════════════════════════════════════════════════
-- Incidents — operator-visible classification output.
-- N1 dedup: (tenant_id, bundle_id) UNIQUE — same bundle promoted twice
-- collapses to one incident.
-- ═════════════════════════════════════════════════════════════════════════

CREATE TABLE incidents (
  incident_id          text PRIMARY KEY,                                -- "inc_<uuid>"
  tenant_id            uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  bundle_id            text NOT NULL REFERENCES correlated_change_bundles(bundle_id),
  title                text NOT NULL,
  severity             text NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  urgency              text NOT NULL CHECK (urgency IN ('immediate', 'within-hour', 'within-day', 'informational')),
  status               text NOT NULL CHECK (status IN (
                         'new', 'investigating', 'recovery-planning', 'recovering',
                         'validating', 'restored', 'partial', 'closed', 'merged'
                       )),
  classification_score integer NOT NULL CHECK (classification_score BETWEEN 0 AND 100),
  payload              jsonb NOT NULL,
  detected_at          timestamptz NOT NULL,
  schema_version       smallint NOT NULL DEFAULT 1,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  closed_at            timestamptz,
  -- N1 dedup
  UNIQUE (tenant_id, bundle_id)
);

CREATE TRIGGER incidents_updated_at BEFORE UPDATE ON incidents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX incidents_tenant_detected
  ON incidents (tenant_id, detected_at DESC);
CREATE INDEX incidents_tenant_status_open
  ON incidents (tenant_id, detected_at DESC)
  WHERE status NOT IN ('closed', 'merged', 'restored');

ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_iso ON incidents
  USING (tenant_id = current_setting('app.tenant_id', false)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', false)::uuid);
GRANT SELECT, INSERT, UPDATE ON incidents TO kavachiq_app;

-- ═════════════════════════════════════════════════════════════════════════
-- Outbox — N3 transactional event publishing.
-- Producer writes entity + outbox row in same TX. Publisher worker
-- (kavachiq_admin role, BYPASSRLS) drains outbox to Service Bus.
-- ═════════════════════════════════════════════════════════════════════════

CREATE TABLE outbox (
  outbox_id          bigserial PRIMARY KEY,
  tenant_id          uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  event_type         text NOT NULL,
  payload            jsonb NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  published_at       timestamptz,
  publish_attempts   integer NOT NULL DEFAULT 0,
  last_publish_error text
);

CREATE INDEX outbox_pending
  ON outbox (created_at)
  WHERE published_at IS NULL;
CREATE INDEX outbox_tenant
  ON outbox (tenant_id, created_at DESC);

ALTER TABLE outbox ENABLE ROW LEVEL SECURITY;
-- App role: tenant-scoped writes only.
CREATE POLICY tenant_iso_writes ON outbox FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.tenant_id', false)::uuid);
CREATE POLICY tenant_iso_reads ON outbox FOR SELECT
  USING (tenant_id = current_setting('app.tenant_id', false)::uuid);
GRANT SELECT, INSERT ON outbox TO kavachiq_app;
GRANT USAGE, SELECT ON SEQUENCE outbox_outbox_id_seq TO kavachiq_app;
-- Admin role (publisher worker) bypasses RLS to drain across all tenants.
GRANT SELECT, UPDATE ON outbox TO kavachiq_admin;

-- ═════════════════════════════════════════════════════════════════════════
-- Sensitivity lists — per-tenant high-sensitivity groups + agent SPs.
-- Drives the classification rationale weights in @kavachiq/core/detection.
-- ═════════════════════════════════════════════════════════════════════════

CREATE TABLE sensitivity_lists (
  list_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  list_type         text NOT NULL CHECK (list_type IN (
                       'high-sensitivity-group',
                       'agent-identified-sp'
                     )),
  object_id         text NOT NULL,
  display_name      text,
  added_by_user_id  uuid,
  added_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, list_type, object_id)
);

CREATE INDEX sensitivity_lookup
  ON sensitivity_lists (tenant_id, list_type);

ALTER TABLE sensitivity_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_iso ON sensitivity_lists
  USING (tenant_id = current_setting('app.tenant_id', false)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', false)::uuid);
GRANT SELECT, INSERT, DELETE ON sensitivity_lists TO kavachiq_app;

-- ═════════════════════════════════════════════════════════════════════════
-- Baselines — pointers to large baseline state JSONs in Blob.
-- Drives @kavachiq/core/normalization snapshot reconstruction.
-- ═════════════════════════════════════════════════════════════════════════

CREATE TABLE baselines (
  baseline_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  subject_kind     text NOT NULL CHECK (subject_kind IN ('group-membership', 'app-role-assignment')),
  subject_id       text NOT NULL,
  blob_url         text NOT NULL,
  captured_at      timestamptz NOT NULL,
  member_count     integer,
  schema_version   smallint NOT NULL DEFAULT 1,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX baselines_lookup
  ON baselines (tenant_id, subject_kind, subject_id, captured_at DESC);

ALTER TABLE baselines ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_iso ON baselines
  USING (tenant_id = current_setting('app.tenant_id', false)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', false)::uuid);
GRANT SELECT, INSERT ON baselines TO kavachiq_app;

-- ═════════════════════════════════════════════════════════════════════════
-- Operator users — KavachIQ-side admin/operator/viewer accounts.
-- D5: External ID claims.sub maps to external_id_subject.
-- NOT subject to RLS; cross-tenant lookups happen at login.
-- ═════════════════════════════════════════════════════════════════════════

CREATE TABLE operator_users (
  operator_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                text UNIQUE NOT NULL,
  display_name         text,
  tenant_id            uuid REFERENCES tenants(tenant_id),  -- NULL = cross-tenant kavachiq-staff
  role                 text NOT NULL CHECK (role IN ('admin', 'operator', 'viewer', 'kavachiq-staff')),
  external_id_subject  text UNIQUE,                          -- claims.sub
  created_at           timestamptz NOT NULL DEFAULT now(),
  last_login_at        timestamptz
);

CREATE INDEX operator_users_tenant ON operator_users (tenant_id);
GRANT SELECT, INSERT, UPDATE ON operator_users TO kavachiq_admin;
GRANT SELECT ON operator_users TO kavachiq_app;

-- ═════════════════════════════════════════════════════════════════════════
-- Operator action audit — required for SOC 2.
-- Append-only; never UPDATE or DELETE.
-- ═════════════════════════════════════════════════════════════════════════

CREATE TABLE operator_action_audit (
  action_id      bigserial PRIMARY KEY,
  tenant_id      uuid REFERENCES tenants(tenant_id),
  operator_id    uuid NOT NULL REFERENCES operator_users(operator_id),
  action_type    text NOT NULL,
  resource_type  text,
  resource_id    text,
  ip_address     inet,
  user_agent     text,
  payload        jsonb,
  occurred_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_tenant_time
  ON operator_action_audit (tenant_id, occurred_at DESC);
CREATE INDEX audit_operator_time
  ON operator_action_audit (operator_id, occurred_at DESC);

GRANT INSERT ON operator_action_audit TO kavachiq_app;
GRANT USAGE, SELECT ON SEQUENCE operator_action_audit_action_id_seq TO kavachiq_app;
GRANT SELECT ON operator_action_audit TO kavachiq_admin;

-- ═════════════════════════════════════════════════════════════════════════
-- Schema migrations metadata — track which migrations have been applied.
-- ═════════════════════════════════════════════════════════════════════════

CREATE TABLE schema_migrations (
  version      text PRIMARY KEY,
  applied_at   timestamptz NOT NULL DEFAULT now(),
  description  text
);

INSERT INTO schema_migrations (version, description)
  VALUES ('0001_initial', 'Initial multi-tenant schema with RLS policies and idempotency keys');

COMMIT;

\echo '═══ 0001_initial.sql applied ═══'
