-- ============================================================
-- Workforce Documentation Platform (Documents + Resources)
--
-- Target database: the Finance Dashboard's live Supabase project.
-- Identity (`users`) already exists in `public`, owned by Finance —
-- this migration does not touch it. Every documentation-specific table
-- lives in the `workforce` schema (matches the app's existing
-- src/app/workforce/* module naming).
--
-- Supersedes an earlier draft of this migration that created a schema
-- named `documentation` — the real, agreed schema name is `workforce`.
-- No prior version of this migration was ever applied, so there is
-- nothing to roll back.
--
-- Design notes:
--   - Zero changes to existing enums (user_role, user_status, etc) or
--     tables in `public`. Every FK to identity is `REFERENCES
--     public.users(id)`, every role column is `public.user_role`.
--   - Role-gating reuses the real public.user_role enum values
--     directly (employee/team_lead/finance/admin/developer) — the
--     16-title role_catalog design considered earlier was dropped in
--     favor of this simpler model. Deliberate simplification; every
--     RLS policy below still enforces it fully.
--   - visibility_scope is a real Postgres enum
--     (workforce.visibility_scope), not text+check.
--   - user_document_reads / document_acknowledgements are scoped to a
--     specific document_version_id, not the parent document — "have
--     you read/acknowledged *this* version" is the actual question a
--     compliance audit needs answered, and it survives new versions
--     being uploaded without silently re-marking old approvals current.
--   - Notification dispatch is intentionally NOT wired to
--     public.notifications in this migration — its `type` enum is
--     Finance-workflow-specific and NOT NULL, so it cannot represent a
--     document/resource event without widening it. Wire actual
--     notification dispatch as a deliberate follow-up once you decide
--     how (or whether) to extend that enum.
--   - activity_log: this migration does not write to public.activity_log
--     and does not create a parallel workforce.activity_log — reuse it
--     from the app layer once its shape is confirmed generic enough.
--
-- IMPORTANT — Supabase PostgREST setup after running this migration:
--   PostgREST only serves schemas listed under Project Settings → API →
--   "Exposed schemas" (default is just `public`). Add `workforce` to
--   that list, or every REST/PostgREST call against these tables will 404.
--   Client code must also address these tables via
--   `supabase.schema('workforce').from(...)` — a bare `.from(...)` call
--   resolves against `public` and will not find them.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE SCHEMA IF NOT EXISTS workforce;

GRANT USAGE ON SCHEMA workforce TO authenticated, service_role;

CREATE TYPE workforce.visibility_scope AS ENUM ('global', 'team', 'role', 'private');

-- ─────────────────────────────────────────────────────────────
-- UPDATED_AT TRIGGER FUNCTION
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION workforce.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- RLS HELPER FUNCTIONS
-- Resolve identity via public.users.supabase_auth_id = auth.uid(), matching
-- the existing users_supabase_auth_id_fkey relationship. SECURITY DEFINER +
-- search_path locked to empty so every reference below must be (and is)
-- fully schema-qualified — nothing here can be hijacked by a search_path
-- attack, and there is never any ambiguity about which schema owns a name.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION workforce.my_user_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT id FROM public.users WHERE supabase_auth_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION workforce.my_role()
RETURNS public.user_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT role FROM public.users WHERE supabase_auth_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION workforce.my_team_name()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT team_name FROM public.users WHERE supabase_auth_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION workforce.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT workforce.my_role() = 'admin'::public.user_role;
$$;

CREATE OR REPLACE FUNCTION workforce.is_team_lead_or_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT workforce.my_role() IN ('team_lead'::public.user_role, 'admin'::public.user_role);
$$;

-- Visibility check shared by documents and resources. Both tables use the
-- same visibility_scope vocabulary and allowed_team_names shape, so this
-- one function (parameterized) avoids duplicating the same CASE logic in
-- every RLS policy. 'role' and 'private' scopes need an EXISTS against
-- their own join tables — those are added on top of this function in the
-- policies below, not folded in here.
CREATE OR REPLACE FUNCTION workforce.can_view(
  p_visibility_scope   workforce.visibility_scope,
  p_allowed_team_names text[],
  p_created_by         uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT
    workforce.is_admin()
    OR p_created_by = workforce.my_user_id()
    OR p_visibility_scope = 'global'
    OR (p_visibility_scope = 'team' AND workforce.my_team_name() = ANY(p_allowed_team_names))
$$;

-- ─────────────────────────────────────────────────────────────
-- DOCUMENT CATEGORIES
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workforce.document_categories (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL UNIQUE,
  slug       text        UNIQUE,
  sort_order integer     NOT NULL DEFAULT 0,
  created_by uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TRIGGER trg_document_categories_updated_at
  BEFORE UPDATE ON workforce.document_categories
  FOR EACH ROW EXECUTE FUNCTION workforce.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- DOCUMENT TAGS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workforce.document_tags (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL UNIQUE,
  slug       text        UNIQUE,
  created_by uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ─────────────────────────────────────────────────────────────
-- DOCUMENTS
-- visibility_scope: 'global' (everyone) | 'team' (allowed_team_names) |
-- 'role' (document_allowed_roles) | 'private' (document_assigned_users)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workforce.documents (
  id                      uuid                       PRIMARY KEY DEFAULT gen_random_uuid(),
  title                   text                       NOT NULL,
  description             text,
  category_id             uuid                       REFERENCES workforce.document_categories(id) ON DELETE SET NULL,
  storage_path            text,
  file_name               text,
  file_size_bytes         integer,
  mime_type               text,
  preview_url             text,
  visibility_scope        workforce.visibility_scope NOT NULL DEFAULT 'team',
  allowed_team_names      text[]                     NOT NULL DEFAULT '{}',
  current_version         integer                    NOT NULL DEFAULT 1,
  requires_acknowledgement boolean                   NOT NULL DEFAULT false,
  is_active               boolean                    NOT NULL DEFAULT true,
  created_by              uuid                       NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  updated_by              uuid                       REFERENCES public.users(id) ON DELETE SET NULL,
  created_at              timestamptz                NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at              timestamptz                NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TRIGGER trg_documents_updated_at
  BEFORE UPDATE ON workforce.documents
  FOR EACH ROW EXECUTE FUNCTION workforce.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- DOCUMENT VERSIONS (append-only history; documents.current_version
-- points at the latest version_number for that document)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workforce.document_versions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     uuid        NOT NULL REFERENCES workforce.documents(id) ON DELETE CASCADE,
  version_number  integer     NOT NULL CHECK (version_number > 0),
  storage_path    text,
  file_name       text,
  file_size_bytes integer,
  mime_type       text,
  changelog       text,
  created_by      uuid        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at      timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (document_id, version_number)
);

-- ─────────────────────────────────────────────────────────────
-- DOCUMENT TAG MAP
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workforce.document_tag_map (
  document_id uuid NOT NULL REFERENCES workforce.documents(id) ON DELETE CASCADE,
  tag_id      uuid NOT NULL REFERENCES workforce.document_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (document_id, tag_id)
);

-- ─────────────────────────────────────────────────────────────
-- DOCUMENT ALLOWED ROLES
-- Reuses the real public.user_role enum directly — a role value that
-- doesn't exist in the live system cannot be inserted here.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workforce.document_allowed_roles (
  document_id uuid             NOT NULL REFERENCES workforce.documents(id) ON DELETE CASCADE,
  role        public.user_role NOT NULL,
  PRIMARY KEY (document_id, role)
);

-- ─────────────────────────────────────────────────────────────
-- DOCUMENT ASSIGNED USERS
-- Postgres can't put a foreign key on a uuid[] column — this join table
-- is what makes visibility_scope = 'private' actually FK-safe against
-- public.users(id).
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workforce.document_assigned_users (
  document_id uuid NOT NULL REFERENCES workforce.documents(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  PRIMARY KEY (document_id, user_id)
);

-- ─────────────────────────────────────────────────────────────
-- USER DOCUMENT READS (one row per user per document *version* —
-- "have they opened this exact version")
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workforce.user_document_reads (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_version_id uuid        NOT NULL REFERENCES workforce.document_versions(id) ON DELETE CASCADE,
  user_id             uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  read_at             timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (document_version_id, user_id)
);

-- ─────────────────────────────────────────────────────────────
-- DOCUMENT ACKNOWLEDGEMENTS ("I have read and understood this version")
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workforce.document_acknowledgements (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_version_id uuid        NOT NULL REFERENCES workforce.document_versions(id) ON DELETE CASCADE,
  user_id             uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  acknowledged_at     timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  note                text,
  UNIQUE (document_version_id, user_id)
);

-- ─────────────────────────────────────────────────────────────
-- RESOURCE CATEGORIES
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workforce.resource_categories (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL UNIQUE,
  slug       text        UNIQUE,
  sort_order integer     NOT NULL DEFAULT 0,
  created_by uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TRIGGER trg_resource_categories_updated_at
  BEFORE UPDATE ON workforce.resource_categories
  FOR EACH ROW EXECUTE FUNCTION workforce.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- RESOURCES (links/tools, not uploaded files — mirrors documents'
-- visibility model without the versioning)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workforce.resources (
  id                 uuid                       PRIMARY KEY DEFAULT gen_random_uuid(),
  title              text                       NOT NULL,
  description        text,
  category_id        uuid                       REFERENCES workforce.resource_categories(id) ON DELETE SET NULL,
  url                text                       NOT NULL CHECK (btrim(url) <> ''),
  external           boolean                    NOT NULL DEFAULT true,
  visibility_scope   workforce.visibility_scope NOT NULL DEFAULT 'team',
  allowed_team_names text[]                     NOT NULL DEFAULT '{}',
  is_active          boolean                    NOT NULL DEFAULT true,
  created_by         uuid                       NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  updated_by         uuid                       REFERENCES public.users(id) ON DELETE SET NULL,
  created_at         timestamptz                NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at         timestamptz                NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TRIGGER trg_resources_updated_at
  BEFORE UPDATE ON workforce.resources
  FOR EACH ROW EXECUTE FUNCTION workforce.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- RESOURCE ALLOWED ROLES
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workforce.resource_allowed_roles (
  resource_id uuid             NOT NULL REFERENCES workforce.resources(id) ON DELETE CASCADE,
  role        public.user_role NOT NULL,
  PRIMARY KEY (resource_id, role)
);

-- ─────────────────────────────────────────────────────────────
-- RESOURCE ACCESS LOGS (append-only event log, not a dedup'd read-state
-- table like user_document_reads — deliberately shaped differently)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workforce.resource_access_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid        NOT NULL REFERENCES workforce.resources(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  accessed_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_documents_category         ON workforce.documents(category_id);
CREATE INDEX IF NOT EXISTS idx_documents_created_by        ON workforce.documents(created_by);
CREATE INDEX IF NOT EXISTS idx_documents_visibility_scope  ON workforce.documents(visibility_scope);
CREATE INDEX IF NOT EXISTS idx_documents_allowed_teams     ON workforce.documents USING gin(allowed_team_names);
CREATE INDEX IF NOT EXISTS idx_documents_active            ON workforce.documents(is_active);

CREATE INDEX IF NOT EXISTS idx_document_versions_document  ON workforce.document_versions(document_id);

CREATE INDEX IF NOT EXISTS idx_document_tag_map_tag        ON workforce.document_tag_map(tag_id);

CREATE INDEX IF NOT EXISTS idx_document_allowed_roles_role ON workforce.document_allowed_roles(role);

CREATE INDEX IF NOT EXISTS idx_document_assigned_users_user ON workforce.document_assigned_users(user_id);

CREATE INDEX IF NOT EXISTS idx_user_document_reads_user     ON workforce.user_document_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_user_document_reads_version  ON workforce.user_document_reads(document_version_id);

CREATE INDEX IF NOT EXISTS idx_document_acks_user           ON workforce.document_acknowledgements(user_id);
CREATE INDEX IF NOT EXISTS idx_document_acks_version        ON workforce.document_acknowledgements(document_version_id);

CREATE INDEX IF NOT EXISTS idx_resources_category          ON workforce.resources(category_id);
CREATE INDEX IF NOT EXISTS idx_resources_created_by         ON workforce.resources(created_by);
CREATE INDEX IF NOT EXISTS idx_resources_visibility_scope   ON workforce.resources(visibility_scope);
CREATE INDEX IF NOT EXISTS idx_resources_allowed_teams      ON workforce.resources USING gin(allowed_team_names);

CREATE INDEX IF NOT EXISTS idx_resource_allowed_roles_role  ON workforce.resource_allowed_roles(role);

CREATE INDEX IF NOT EXISTS idx_resource_access_logs_resource ON workforce.resource_access_logs(resource_id);
CREATE INDEX IF NOT EXISTS idx_resource_access_logs_user     ON workforce.resource_access_logs(user_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- document_categories / document_tags / resource_categories: read = any
-- authenticated user; write = admin only (taxonomy management is founder-tier,
-- matching the coarse role model — no dedicated "roles admin" role exists).
ALTER TABLE workforce.document_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "doc_categories_select" ON workforce.document_categories FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "doc_categories_write"  ON workforce.document_categories FOR ALL    USING (workforce.is_admin());

ALTER TABLE workforce.document_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "doc_tags_select" ON workforce.document_tags FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "doc_tags_write"  ON workforce.document_tags FOR ALL    USING (workforce.is_admin());

ALTER TABLE workforce.resource_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "resource_categories_select" ON workforce.resource_categories FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "resource_categories_write"  ON workforce.resource_categories FOR ALL    USING (workforce.is_admin());

-- documents: global/team/uploader/admin visible directly; 'role' and
-- 'private' scopes need an EXISTS against their join tables, so those two
-- are added on top of workforce.can_view() rather than folded into it.
ALTER TABLE workforce.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documents_select" ON workforce.documents FOR SELECT USING (
  workforce.can_view(visibility_scope, allowed_team_names, created_by)
  OR (
    visibility_scope = 'role' AND EXISTS (
      SELECT 1 FROM workforce.document_allowed_roles dar
      WHERE dar.document_id = documents.id AND dar.role = workforce.my_role()
    )
  )
  OR (
    visibility_scope = 'private' AND EXISTS (
      SELECT 1 FROM workforce.document_assigned_users dau
      WHERE dau.document_id = documents.id AND dau.user_id = workforce.my_user_id()
    )
  )
);

CREATE POLICY "documents_insert" ON workforce.documents FOR INSERT WITH CHECK (workforce.is_team_lead_or_admin());
CREATE POLICY "documents_update" ON workforce.documents FOR UPDATE USING (
  workforce.is_admin() OR created_by = workforce.my_user_id()
);
CREATE POLICY "documents_delete" ON workforce.documents FOR DELETE USING (workforce.is_admin());

-- document_versions: visible/writable wherever the parent document is.
ALTER TABLE workforce.document_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "document_versions_select" ON workforce.document_versions FOR SELECT USING (
  EXISTS (SELECT 1 FROM workforce.documents d WHERE d.id = document_versions.document_id)
);
CREATE POLICY "document_versions_insert" ON workforce.document_versions FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM workforce.documents d WHERE d.id = document_versions.document_id
      AND (workforce.is_admin() OR d.created_by = workforce.my_user_id())
  )
);

-- document_tag_map: readable wherever the doc is; writable by doc owner/admin.
ALTER TABLE workforce.document_tag_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "document_tag_map_select" ON workforce.document_tag_map FOR SELECT USING (
  EXISTS (SELECT 1 FROM workforce.documents d WHERE d.id = document_tag_map.document_id)
);
CREATE POLICY "document_tag_map_write" ON workforce.document_tag_map FOR ALL USING (
  EXISTS (
    SELECT 1 FROM workforce.documents d WHERE d.id = document_tag_map.document_id
      AND (workforce.is_admin() OR d.created_by = workforce.my_user_id())
  )
);

-- document_allowed_roles / document_assigned_users: managed by doc owner/admin only.
ALTER TABLE workforce.document_allowed_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "document_allowed_roles_select" ON workforce.document_allowed_roles FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "document_allowed_roles_write"  ON workforce.document_allowed_roles FOR ALL USING (
  EXISTS (
    SELECT 1 FROM workforce.documents d WHERE d.id = document_allowed_roles.document_id
      AND (workforce.is_admin() OR d.created_by = workforce.my_user_id())
  )
);

ALTER TABLE workforce.document_assigned_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "document_assigned_users_select" ON workforce.document_assigned_users FOR SELECT USING (
  user_id = workforce.my_user_id()
  OR EXISTS (
    SELECT 1 FROM workforce.documents d WHERE d.id = document_assigned_users.document_id
      AND (workforce.is_admin() OR d.created_by = workforce.my_user_id())
  )
);
CREATE POLICY "document_assigned_users_write" ON workforce.document_assigned_users FOR ALL USING (
  EXISTS (
    SELECT 1 FROM workforce.documents d WHERE d.id = document_assigned_users.document_id
      AND (workforce.is_admin() OR d.created_by = workforce.my_user_id())
  )
);

-- user_document_reads: users record/see their own reads; admin/doc-owner see
-- all for that document (joined through the version to reach the document).
ALTER TABLE workforce.user_document_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_document_reads_select" ON workforce.user_document_reads FOR SELECT USING (
  user_id = workforce.my_user_id()
  OR EXISTS (
    SELECT 1 FROM workforce.document_versions dv
    JOIN workforce.documents d ON d.id = dv.document_id
    WHERE dv.id = user_document_reads.document_version_id
      AND (workforce.is_admin() OR d.created_by = workforce.my_user_id())
  )
);
CREATE POLICY "user_document_reads_insert" ON workforce.user_document_reads FOR INSERT WITH CHECK (
  user_id = workforce.my_user_id()
);

-- document_acknowledgements: same pattern as reads.
ALTER TABLE workforce.document_acknowledgements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "document_acks_select" ON workforce.document_acknowledgements FOR SELECT USING (
  user_id = workforce.my_user_id()
  OR EXISTS (
    SELECT 1 FROM workforce.document_versions dv
    JOIN workforce.documents d ON d.id = dv.document_id
    WHERE dv.id = document_acknowledgements.document_version_id
      AND (workforce.is_admin() OR d.created_by = workforce.my_user_id())
  )
);
CREATE POLICY "document_acks_insert" ON workforce.document_acknowledgements FOR INSERT WITH CHECK (
  user_id = workforce.my_user_id()
);

-- resources: same visibility model as documents, minus the 'private' scope
-- (resource_allowed_roles is still checked explicitly for 'role').
ALTER TABLE workforce.resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "resources_select" ON workforce.resources FOR SELECT USING (
  workforce.can_view(visibility_scope, allowed_team_names, created_by)
  OR (
    visibility_scope = 'role' AND EXISTS (
      SELECT 1 FROM workforce.resource_allowed_roles rar
      WHERE rar.resource_id = resources.id AND rar.role = workforce.my_role()
    )
  )
);

CREATE POLICY "resources_insert" ON workforce.resources FOR INSERT WITH CHECK (workforce.is_team_lead_or_admin());
CREATE POLICY "resources_update" ON workforce.resources FOR UPDATE USING (
  workforce.is_admin() OR created_by = workforce.my_user_id()
);
CREATE POLICY "resources_delete" ON workforce.resources FOR DELETE USING (workforce.is_admin());

ALTER TABLE workforce.resource_allowed_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "resource_allowed_roles_select" ON workforce.resource_allowed_roles FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "resource_allowed_roles_write"  ON workforce.resource_allowed_roles FOR ALL USING (
  EXISTS (
    SELECT 1 FROM workforce.resources r WHERE r.id = resource_allowed_roles.resource_id
      AND (workforce.is_admin() OR r.created_by = workforce.my_user_id())
  )
);

-- resource_access_logs: append-only; users log/see their own, admin sees all.
ALTER TABLE workforce.resource_access_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "resource_access_logs_select" ON workforce.resource_access_logs FOR SELECT USING (
  user_id = workforce.my_user_id() OR workforce.is_admin()
);
CREATE POLICY "resource_access_logs_insert" ON workforce.resource_access_logs FOR INSERT WITH CHECK (
  user_id = workforce.my_user_id()
);

-- ============================================================
-- GRANTS
-- RLS restricts rows, but the role must first have the base table privilege
-- to touch the table at all. `public` gets these automatically in Supabase;
-- a fresh custom schema does not, so they're granted explicitly here.
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA workforce TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA workforce TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA workforce GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA workforce GRANT ALL ON TABLES TO service_role;
