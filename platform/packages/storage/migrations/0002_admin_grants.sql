-- 0002_admin_grants.sql
-- Grant table-level privileges to kavachiq_admin (BYPASSRLS role).
--
-- 0001 created the role with BYPASSRLS but neglected the table-level GRANTs.
-- BYPASSRLS bypasses Row-Level Security, but it does NOT grant SELECT/INSERT/
-- UPDATE/DELETE — those still need to be GRANTed explicitly. This migration
-- adds them so withAdminContext() can drain the outbox, run cross-tenant
-- analytics queries, and perform ops tasks like tenant onboarding.
--
-- Apply with:
--   PGPASSWORD=… psql -h <pg-fqdn> -U kavachiqadmin -d kavachiq -f 0002_admin_grants.sql

\echo '═══ 0002_admin_grants.sql ═══'

BEGIN;

-- Full table privileges on all multi-tenant tables.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  tenants,
  tenant_credentials,
  polling_state,
  raw_events,
  normalized_changes,
  correlated_change_bundles,
  incidents,
  outbox,
  sensitivity_lists,
  baselines,
  operator_users,
  operator_action_audit
TO kavachiq_admin;

-- Sequences for bigserial PKs (outbox.outbox_id, operator_action_audit.action_id).
GRANT USAGE, SELECT ON
  outbox_outbox_id_seq,
  operator_action_audit_action_id_seq
TO kavachiq_admin;

-- Schema_migrations metadata: admin can audit which migrations are applied.
GRANT SELECT ON schema_migrations TO kavachiq_admin;

INSERT INTO schema_migrations (version, description)
  VALUES ('0002_admin_grants', 'Grant table-level privileges to kavachiq_admin (BYPASSRLS role)');

COMMIT;

\echo '═══ 0002_admin_grants.sql applied ═══'
