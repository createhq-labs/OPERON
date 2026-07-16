-- ============================================================
-- Workforce schema grants
--
-- The RLS policies and helper functions for the `workforce` schema
-- are already in place, but nothing ever granted the `authenticated`
-- (or `service_role`) Postgres role permission to touch the schema or
-- its tables at all. RLS only filters rows for a role that already has
-- the underlying table privilege — without this, every request fails
-- with "permission denied for schema workforce" (42501) regardless of
-- what the RLS policies say.
-- ============================================================

GRANT USAGE ON SCHEMA workforce TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA workforce TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA workforce TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA workforce GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA workforce GRANT ALL ON TABLES TO service_role;
