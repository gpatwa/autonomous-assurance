-- 0004_pending_onboarding.sql
--
-- Server-side onboarding state.
--
-- The OAuth admin-consent flow has two API calls: initiate + complete.
-- Between them the client carries an opaque token (the OAuth `state` param).
-- The real payload (tenant_id, display_name) lives here, not in the URL.
--
-- Design:
--   • token       — 32 crypto-random hex bytes; opaque to the client
--   • expires_at  — 1-hour TTL; abandoned flows clean themselves up
--   • Redemption  — DELETE ... RETURNING atomically redeems and prevents replay
--
-- Table is admin-only (no RLS); queried via kavachiq_admin role.

CREATE TABLE pending_onboarding (
  token          TEXT        PRIMARY KEY,
  tenant_id      UUID        NOT NULL,
  display_name   TEXT        NOT NULL,
  initiated_by   TEXT,                          -- operator email, for audit
  expires_at     TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX pending_onboarding_expires_idx ON pending_onboarding (expires_at);

-- kavachiq_admin owns this table (service role used by withAdminContext).
GRANT SELECT, INSERT, DELETE ON pending_onboarding TO kavachiq_admin;
