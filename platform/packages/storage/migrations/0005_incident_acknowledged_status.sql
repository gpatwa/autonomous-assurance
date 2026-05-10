-- Add 'acknowledged' to the incidents status check constraint.
--
-- The initial schema omitted 'acknowledged' from the CHECK values.
-- The PATCH /tenants/:id/incidents/:id endpoint accepts it, so the DB
-- constraint must include it or every PATCH to 'acknowledged' throws a
-- check constraint violation (→ HTTP 500).
--
-- Postgres requires drop + re-add to change an existing CHECK constraint.

ALTER TABLE incidents
  DROP CONSTRAINT incidents_status_check,
  ADD CONSTRAINT incidents_status_check CHECK (status IN (
    'new', 'acknowledged', 'investigating', 'recovery-planning', 'recovering',
    'validating', 'restored', 'partial', 'closed', 'merged'
  ));
