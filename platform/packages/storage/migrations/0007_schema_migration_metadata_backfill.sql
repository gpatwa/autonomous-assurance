-- 0007_schema_migration_metadata_backfill.sql
--
-- Backfill schema_migrations rows for migrations that predated consistent
-- migration-ledger writes. This is metadata-only and safe to rerun.

\echo '═══ 0007_schema_migration_metadata_backfill.sql ═══'

BEGIN;

INSERT INTO schema_migrations (version, description)
  VALUES
    ('0003_secretless', 'Secretless tenant onboarding schema changes'),
    ('0004_pending_onboarding', 'Pending onboarding state table'),
    ('0005_incident_acknowledged_status', 'Allow acknowledged incident status')
ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations (version, description)
  VALUES ('0007_schema_migration_metadata_backfill', 'Backfill missing migration ledger rows')
ON CONFLICT (version) DO NOTHING;

COMMIT;

\echo '═══ 0007_schema_migration_metadata_backfill.sql applied ═══'
