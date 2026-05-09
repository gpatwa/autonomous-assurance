-- Migration 0003: secretless tenant onboarding.
--
-- KavachIQ uses a multi-tenant Entra app registration. Tenant admins grant
-- consent via OAuth admin-consent flow; KavachIQ's own platform credentials
-- are used to call Graph on behalf of any consenting tenant.
--
-- Changes:
--   1. Drop tenant_credentials (per-tenant client_id + encrypted_client_secret
--      are replaced by platform-level env vars KAVACHIQ_APP_CLIENT_ID +
--      KAVACHIQ_APP_CLIENT_SECRET in the Container App).
--   2. Make consent_admin_email nullable — the admin consent callback from
--      Microsoft does not return the admin email; it must be fetched via a
--      subsequent Graph call or left null for v1.

DROP TABLE IF EXISTS tenant_credentials;

ALTER TABLE tenants
  ALTER COLUMN consent_admin_email DROP NOT NULL;
