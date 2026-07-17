BEGIN;

-- ============================================================
-- 001_WORKFORCE_FOUNDATION.SQL
--
-- SCHEMA BOUNDARY
--   public.*    : Finance production schema â€” untouched
--   global.*    : shared identity/RBAC â€” read/reference only
--   workforce.* : all objects created by this migration
--
-- ASSUMPTIONS
--   global.users.id = auth.users.id
--   global.users.role_id -> global.roles.id
--   global.users.department_id -> global.departments.id
--   global.users.manager_user_id -> global.users.id
--
-- IMPORTANT
--   This migration contains no CREATE, ALTER, UPDATE, DELETE,
--   INSERT, DROP, POLICY, TRIGGER, or FUNCTION statement against
--   public.*.
-- ============================================================


-- ============================================================
-- 1. PREFLIGHT
-- ============================================================

DO $$
BEGIN
  IF to_regclass('global.users') IS NULL THEN
    RAISE EXCEPTION 'Required table global.users does not exist';
  END IF;

  IF to_regclass('global.roles') IS NULL THEN
    RAISE EXCEPTION 'Required table global.roles does not exist';
  END IF;

  IF to_regclass('global.departments') IS NULL THEN
    RAISE EXCEPTION 'Required table global.departments does not exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'global'
      AND table_name = 'users'
      AND column_name = 'id'
  ) THEN
    RAISE EXCEPTION 'global.users.id does not exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'global'
      AND table_name = 'users'
      AND column_name = 'role_id'
  ) THEN
    RAISE EXCEPTION 'global.users.role_id does not exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'global'
      AND table_name = 'users'
      AND column_name = 'department_id'
  ) THEN
    RAISE EXCEPTION 'global.users.department_id does not exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'global'
      AND table_name = 'users'
      AND column_name = 'manager_user_id'
  ) THEN
    RAISE EXCEPTION 'global.users.manager_user_id does not exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'global'
      AND table_name = 'users'
      AND column_name = 'status'
  ) THEN
    RAISE EXCEPTION 'global.users.status does not exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'global'
      AND table_name = 'roles'
      AND column_name = 'name'
  ) THEN
    RAISE EXCEPTION 'global.roles.name does not exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'global'
      AND table_name = 'departments'
      AND column_name = 'name'
  ) THEN
    RAISE EXCEPTION 'global.departments.name does not exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM global.roles
    WHERE lower(name::text) = 'co-founder'
      AND status = true
  ) THEN
    RAISE EXCEPTION 'Active Co-Founder role is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM global.roles
    WHERE lower(name::text) = 'creator'
      AND status = true
  ) THEN
    RAISE EXCEPTION 'Active Creator role is missing';
  END IF;
END;
$$;


-- ============================================================
-- 2. WORKFORCE-OWNED UPDATED_AT FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, workforce
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


-- ============================================================
-- 3. TYPES
-- ============================================================

CREATE TYPE workforce.visibility_scope AS ENUM (
  'global',
  'team',
  'role',
  'private'
);


-- ============================================================
-- 4. CURRENT USER / ROLE HELPERS
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.my_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global
AS $$
SELECT gu.id
FROM global.users gu
WHERE gu.id = auth.uid()
  AND lower(gu.status::text) = 'active'
LIMIT 1;
$$;


CREATE OR REPLACE FUNCTION workforce.my_role_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global
AS $$
SELECT gu.role_id
FROM global.users gu
JOIN global.roles gr
  ON gr.id = gu.role_id
WHERE gu.id = auth.uid()
  AND lower(gu.status::text) = 'active'
  AND gr.status = true
LIMIT 1;
$$;


CREATE OR REPLACE FUNCTION workforce.my_role_name()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global
AS $$
SELECT lower(gr.name::text)
FROM global.users gu
JOIN global.roles gr
  ON gr.id = gu.role_id
WHERE gu.id = auth.uid()
  AND lower(gu.status::text) = 'active'
  AND gr.status = true
LIMIT 1;
$$;


CREATE OR REPLACE FUNCTION workforce.my_department_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global
AS $$
SELECT gu.department_id
FROM global.users gu
WHERE gu.id = auth.uid()
  AND lower(gu.status::text) = 'active'
LIMIT 1;
$$;


CREATE OR REPLACE FUNCTION workforce.my_department_name()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global
AS $$
SELECT gd.name::text
FROM global.users gu
JOIN global.departments gd
  ON gd.id = gu.department_id
WHERE gu.id = auth.uid()
  AND lower(gu.status::text) = 'active'
LIMIT 1;
$$;


CREATE OR REPLACE FUNCTION workforce.is_active_workforce_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
SELECT workforce.my_user_id() IS NOT NULL;
$$;


-- Co-Founder is the highest system role.

CREATE OR REPLACE FUNCTION workforce.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
SELECT COALESCE(
  workforce.my_role_name() = 'co-founder',
  false
);
$$;


CREATE OR REPLACE FUNCTION workforce.is_hr_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
SELECT COALESCE(
  workforce.my_role_name() = 'hr manager',
  false
);
$$;


CREATE OR REPLACE FUNCTION workforce.is_hr_executive()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
SELECT COALESCE(
  workforce.my_role_name() = 'hr executive',
  false
);
$$;


CREATE OR REPLACE FUNCTION workforce.is_hr()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
SELECT
  workforce.is_hr_manager()
  OR workforce.is_hr_executive();
$$;


CREATE OR REPLACE FUNCTION workforce.is_creator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
SELECT COALESCE(
  workforce.my_role_name() = 'creator',
  false
);
$$;


CREATE OR REPLACE FUNCTION workforce.is_creator_acquisition()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
SELECT COALESCE(
  workforce.my_role_name() = 'creator acquisition',
  false
);
$$;


CREATE OR REPLACE FUNCTION workforce.is_content_lead()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
SELECT COALESCE(
  workforce.my_role_name() IN (
    'im team lead',
    'category lead'
  ),
  false
);
$$;


CREATE OR REPLACE FUNCTION workforce.can_manage_content()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
SELECT
  workforce.is_admin()
  OR workforce.is_hr()
  OR workforce.is_content_lead();
$$;


CREATE OR REPLACE FUNCTION workforce.is_direct_manager_of(
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
SELECT EXISTS (
  SELECT 1
  FROM global.users gu
  WHERE gu.id = p_user_id
    AND gu.manager_user_id = workforce.my_user_id()
    AND lower(gu.status::text) = 'active'
);
$$;


-- ============================================================
-- 5. DOCUMENT CATEGORIES
-- ============================================================

CREATE TABLE workforce.document_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  name text NOT NULL UNIQUE,
  slug text UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,

  created_by uuid
    REFERENCES global.users(id)
    ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);


CREATE TRIGGER trg_document_categories_updated_at
BEFORE UPDATE
ON workforce.document_categories
FOR EACH ROW
EXECUTE FUNCTION workforce.set_updated_at();


-- ============================================================
-- 6. DOCUMENT TAGS
-- ============================================================

CREATE TABLE workforce.document_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  name text NOT NULL UNIQUE,
  slug text UNIQUE,

  created_by uuid
    REFERENCES global.users(id)
    ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now()
);


-- ============================================================
-- 7. DOCUMENTS
-- ============================================================

CREATE TABLE workforce.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  title text NOT NULL,
  description text,

  category_id uuid
    REFERENCES workforce.document_categories(id)
    ON DELETE SET NULL,

  storage_path text,
  file_name text,
  file_size_bytes bigint
    CHECK (
      file_size_bytes IS NULL
      OR file_size_bytes >= 0
    ),

  mime_type text,
  preview_url text,

  visibility_scope workforce.visibility_scope
    NOT NULL DEFAULT 'team',

  current_version integer NOT NULL DEFAULT 1
    CHECK (current_version > 0),

  requires_acknowledgement boolean
    NOT NULL DEFAULT false,

  is_active boolean NOT NULL DEFAULT true,

  archived_at timestamptz,

  archived_by uuid
    REFERENCES global.users(id)
    ON DELETE SET NULL,

  created_by uuid NOT NULL
    REFERENCES global.users(id)
    ON DELETE RESTRICT,

  updated_by uuid
    REFERENCES global.users(id)
    ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT documents_archive_state_check
  CHECK (
    (
      is_active = true
      AND archived_at IS NULL
      AND archived_by IS NULL
    )
    OR
    (
      is_active = false
      AND archived_at IS NOT NULL
      AND archived_by IS NOT NULL
    )
  )
);


CREATE TRIGGER trg_documents_updated_at
BEFORE UPDATE
ON workforce.documents
FOR EACH ROW
EXECUTE FUNCTION workforce.set_updated_at();


-- ============================================================
-- 8. DOCUMENT VERSIONS
-- ============================================================

CREATE TABLE workforce.document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  document_id uuid NOT NULL
    REFERENCES workforce.documents(id)
    ON DELETE CASCADE,

  version_number integer NOT NULL
    CHECK (version_number > 0),

  storage_path text,
  file_name text,

  file_size_bytes bigint
    CHECK (
      file_size_bytes IS NULL
      OR file_size_bytes >= 0
    ),

  mime_type text,
  changelog text,

  created_by uuid NOT NULL
    REFERENCES global.users(id)
    ON DELETE RESTRICT,

  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (document_id, version_number)
);


-- ============================================================
-- 9. DOCUMENT TAG MAP
-- ============================================================

CREATE TABLE workforce.document_tag_map (
  document_id uuid NOT NULL
    REFERENCES workforce.documents(id)
    ON DELETE CASCADE,

  tag_id uuid NOT NULL
    REFERENCES workforce.document_tags(id)
    ON DELETE CASCADE,

  PRIMARY KEY (document_id, tag_id)
);


-- ============================================================
-- 10. DOCUMENT ROLE VISIBILITY
-- ============================================================

CREATE TABLE workforce.document_allowed_roles (
  document_id uuid NOT NULL
    REFERENCES workforce.documents(id)
    ON DELETE CASCADE,

  role_id uuid NOT NULL
    REFERENCES global.roles(id)
    ON DELETE CASCADE,

  PRIMARY KEY (document_id, role_id)
);


-- ============================================================
-- 11. DOCUMENT DEPARTMENT VISIBILITY
-- ============================================================

CREATE TABLE workforce.document_allowed_departments (
  document_id uuid NOT NULL
    REFERENCES workforce.documents(id)
    ON DELETE CASCADE,

  department_id uuid NOT NULL
    REFERENCES global.departments(id)
    ON DELETE CASCADE,

  PRIMARY KEY (document_id, department_id)
);


-- ============================================================
-- 12. DOCUMENT DIRECT USER ASSIGNMENTS
-- ============================================================

CREATE TABLE workforce.document_assigned_users (
  document_id uuid NOT NULL
    REFERENCES workforce.documents(id)
    ON DELETE CASCADE,

  user_id uuid NOT NULL
    REFERENCES global.users(id)
    ON DELETE CASCADE,

  PRIMARY KEY (document_id, user_id)
);


-- ============================================================
-- 13. VERSION-SPECIFIC DOCUMENT READS
-- ============================================================

CREATE TABLE workforce.user_document_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  document_version_id uuid NOT NULL
    REFERENCES workforce.document_versions(id)
    ON DELETE CASCADE,

  user_id uuid NOT NULL
    REFERENCES global.users(id)
    ON DELETE CASCADE,

  read_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (document_version_id, user_id)
);


-- ============================================================
-- 14. VERSION-SPECIFIC ACKNOWLEDGEMENTS
-- ============================================================

CREATE TABLE workforce.document_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  document_version_id uuid NOT NULL
    REFERENCES workforce.document_versions(id)
    ON DELETE CASCADE,

  user_id uuid NOT NULL
    REFERENCES global.users(id)
    ON DELETE CASCADE,

  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  note text,

  UNIQUE (document_version_id, user_id)
);


-- ============================================================
-- 15. RESOURCE CATEGORIES
-- ============================================================

CREATE TABLE workforce.resource_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  name text NOT NULL UNIQUE,
  slug text UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,

  created_by uuid
    REFERENCES global.users(id)
    ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);


CREATE TRIGGER trg_resource_categories_updated_at
BEFORE UPDATE
ON workforce.resource_categories
FOR EACH ROW
EXECUTE FUNCTION workforce.set_updated_at();


-- ============================================================
-- 16. RESOURCES
-- ============================================================

CREATE TABLE workforce.resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  title text NOT NULL,
  description text,

  category_id uuid
    REFERENCES workforce.resource_categories(id)
    ON DELETE SET NULL,

  url text NOT NULL
    CHECK (btrim(url) <> ''),

  external boolean NOT NULL DEFAULT true,

  visibility_scope workforce.visibility_scope
    NOT NULL DEFAULT 'team',

  is_active boolean NOT NULL DEFAULT true,

  archived_at timestamptz,

  archived_by uuid
    REFERENCES global.users(id)
    ON DELETE SET NULL,

  created_by uuid NOT NULL
    REFERENCES global.users(id)
    ON DELETE RESTRICT,

  updated_by uuid
    REFERENCES global.users(id)
    ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT resources_archive_state_check
  CHECK (
    (
      is_active = true
      AND archived_at IS NULL
      AND archived_by IS NULL
    )
    OR
    (
      is_active = false
      AND archived_at IS NOT NULL
      AND archived_by IS NOT NULL
    )
  )
);


CREATE TRIGGER trg_resources_updated_at
BEFORE UPDATE
ON workforce.resources
FOR EACH ROW
EXECUTE FUNCTION workforce.set_updated_at();


-- ============================================================
-- 17. RESOURCE ROLE VISIBILITY
-- ============================================================

CREATE TABLE workforce.resource_allowed_roles (
  resource_id uuid NOT NULL
    REFERENCES workforce.resources(id)
    ON DELETE CASCADE,

  role_id uuid NOT NULL
    REFERENCES global.roles(id)
    ON DELETE CASCADE,

  PRIMARY KEY (resource_id, role_id)
);


-- ============================================================
-- 18. RESOURCE DEPARTMENT VISIBILITY
-- ============================================================

CREATE TABLE workforce.resource_allowed_departments (
  resource_id uuid NOT NULL
    REFERENCES workforce.resources(id)
    ON DELETE CASCADE,

  department_id uuid NOT NULL
    REFERENCES global.departments(id)
    ON DELETE CASCADE,

  PRIMARY KEY (resource_id, department_id)
);


-- ============================================================
-- 19. RESOURCE ACCESS LOGS
-- ============================================================

CREATE TABLE workforce.resource_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  resource_id uuid NOT NULL
    REFERENCES workforce.resources(id)
    ON DELETE CASCADE,

  user_id uuid NOT NULL
    REFERENCES global.users(id)
    ON DELETE CASCADE,

  accessed_at timestamptz NOT NULL DEFAULT now()
);


-- ============================================================
-- 20. ARCHIVE AUDIT
-- ============================================================

CREATE TABLE workforce.content_archive_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  entity_type text NOT NULL
    CHECK (
      entity_type IN (
        'document',
        'resource'
      )
    ),

  entity_id uuid NOT NULL,

  action text NOT NULL
    CHECK (
      action IN (
        'archived',
        'restored'
      )
    ),

  actor_user_id uuid NOT NULL
    REFERENCES global.users(id)
    ON DELETE RESTRICT,

  created_at timestamptz NOT NULL DEFAULT now()
);


-- ============================================================
-- 21. INDEXES
-- ============================================================

CREATE INDEX idx_documents_category
ON workforce.documents(category_id);


CREATE INDEX idx_documents_created_by
ON workforce.documents(created_by);


CREATE INDEX idx_documents_visibility_scope
ON workforce.documents(visibility_scope);


CREATE INDEX idx_documents_active_created
ON workforce.documents(is_active, created_at DESC);


CREATE INDEX idx_document_versions_document
ON workforce.document_versions(document_id);


CREATE INDEX idx_document_versions_created_by
ON workforce.document_versions(created_by);


CREATE INDEX idx_document_assigned_users_user
ON workforce.document_assigned_users(user_id, document_id);


CREATE INDEX idx_user_document_reads_user
ON workforce.user_document_reads(user_id, read_at DESC);


CREATE INDEX idx_document_acknowledgements_user
ON workforce.document_acknowledgements(
  user_id,
  acknowledged_at DESC
);


CREATE INDEX idx_resources_category
ON workforce.resources(category_id);


CREATE INDEX idx_resources_created_by
ON workforce.resources(created_by);


CREATE INDEX idx_resources_visibility_scope
ON workforce.resources(visibility_scope);


CREATE INDEX idx_resources_active_created
ON workforce.resources(is_active, created_at DESC);


CREATE INDEX idx_resource_access_logs_resource
ON workforce.resource_access_logs(resource_id, accessed_at DESC);


CREATE INDEX idx_resource_access_logs_user
ON workforce.resource_access_logs(user_id, accessed_at DESC);


CREATE INDEX idx_content_archive_audit_entity
ON workforce.content_archive_audit(
  entity_type,
  entity_id,
  created_at DESC
);


CREATE INDEX idx_content_archive_audit_actor
ON workforce.content_archive_audit(
  actor_user_id,
  created_at DESC
);


-- ============================================================
-- 22. DOCUMENT VISIBILITY FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.can_view_document(
  p_document_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
SELECT EXISTS (
  SELECT 1
  FROM workforce.documents d
  WHERE d.id = p_document_id
    AND (
      (
        d.is_active = true
        AND workforce.is_active_workforce_user()
        AND (
          d.created_by = workforce.my_user_id()

          OR d.visibility_scope = 'global'

          OR (
            d.visibility_scope = 'team'
            AND EXISTS (
              SELECT 1
              FROM workforce.document_allowed_departments dad
              WHERE dad.document_id = d.id
                AND dad.department_id =
                  workforce.my_department_id()
            )
          )

          OR (
            d.visibility_scope = 'role'
            AND EXISTS (
              SELECT 1
              FROM workforce.document_allowed_roles dar
              WHERE dar.document_id = d.id
                AND dar.role_id = workforce.my_role_id()
            )
          )

          OR (
            d.visibility_scope = 'private'
            AND EXISTS (
              SELECT 1
              FROM workforce.document_assigned_users dau
              WHERE dau.document_id = d.id
                AND dau.user_id = workforce.my_user_id()
            )
          )
        )
      )

      OR (
        d.is_active = false
        AND workforce.can_manage_content()
      )
    )
);
$$;


CREATE OR REPLACE FUNCTION workforce.can_view_document_version(
  p_document_version_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
SELECT EXISTS (
  SELECT 1
  FROM workforce.document_versions dv
  WHERE dv.id = p_document_version_id
    AND workforce.can_view_document(dv.document_id)
);
$$;


-- ============================================================
-- 23. RESOURCE VISIBILITY FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.can_view_resource(
  p_resource_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
SELECT EXISTS (
  SELECT 1
  FROM workforce.resources r
  WHERE r.id = p_resource_id
    AND (
      (
        r.is_active = true
        AND workforce.is_active_workforce_user()
        AND (
          r.created_by = workforce.my_user_id()

          OR r.visibility_scope = 'global'

          OR (
            r.visibility_scope = 'team'
            AND EXISTS (
              SELECT 1
              FROM workforce.resource_allowed_departments rad
              WHERE rad.resource_id = r.id
                AND rad.department_id =
                  workforce.my_department_id()
            )
          )

          OR (
            r.visibility_scope = 'role'
            AND EXISTS (
              SELECT 1
              FROM workforce.resource_allowed_roles rar
              WHERE rar.resource_id = r.id
                AND rar.role_id = workforce.my_role_id()
            )
          )
        )
      )

      OR (
        r.is_active = false
        AND workforce.can_manage_content()
      )
    )
);
$$;


-- ============================================================
-- 24. ARCHIVE / RESTORE FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.archive_document(
  p_document_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF NOT workforce.can_manage_content() THEN
    RAISE EXCEPTION 'Not authorized to archive documents';
  END IF;

  v_user_id := workforce.my_user_id();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  UPDATE workforce.documents
  SET
    is_active = false,
    archived_at = now(),
    archived_by = v_user_id,
    updated_by = v_user_id,
    updated_at = now()
  WHERE id = p_document_id
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active document not found';
  END IF;

  INSERT INTO workforce.content_archive_audit (
    entity_type,
    entity_id,
    action,
    actor_user_id
  )
  VALUES (
    'document',
    p_document_id,
    'archived',
    v_user_id
  );
END;
$$;


CREATE OR REPLACE FUNCTION workforce.restore_document(
  p_document_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF NOT workforce.can_manage_content() THEN
    RAISE EXCEPTION 'Not authorized to restore documents';
  END IF;

  v_user_id := workforce.my_user_id();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  UPDATE workforce.documents
  SET
    is_active = true,
    archived_at = NULL,
    archived_by = NULL,
    updated_by = v_user_id,
    updated_at = now()
  WHERE id = p_document_id
    AND is_active = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Archived document not found';
  END IF;

  INSERT INTO workforce.content_archive_audit (
    entity_type,
    entity_id,
    action,
    actor_user_id
  )
  VALUES (
    'document',
    p_document_id,
    'restored',
    v_user_id
  );
END;
$$;


CREATE OR REPLACE FUNCTION workforce.archive_resource(
  p_resource_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF NOT workforce.can_manage_content() THEN
    RAISE EXCEPTION 'Not authorized to archive resources';
  END IF;

  v_user_id := workforce.my_user_id();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  UPDATE workforce.resources
  SET
    is_active = false,
    archived_at = now(),
    archived_by = v_user_id,
    updated_by = v_user_id,
    updated_at = now()
  WHERE id = p_resource_id
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active resource not found';
  END IF;

  INSERT INTO workforce.content_archive_audit (
    entity_type,
    entity_id,
    action,
    actor_user_id
  )
  VALUES (
    'resource',
    p_resource_id,
    'archived',
    v_user_id
  );
END;
$$;


CREATE OR REPLACE FUNCTION workforce.restore_resource(
  p_resource_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF NOT workforce.can_manage_content() THEN
    RAISE EXCEPTION 'Not authorized to restore resources';
  END IF;

  v_user_id := workforce.my_user_id();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  UPDATE workforce.resources
  SET
    is_active = true,
    archived_at = NULL,
    archived_by = NULL,
    updated_by = v_user_id,
    updated_at = now()
  WHERE id = p_resource_id
    AND is_active = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Archived resource not found';
  END IF;

  INSERT INTO workforce.content_archive_audit (
    entity_type,
    entity_id,
    action,
    actor_user_id
  )
  VALUES (
    'resource',
    p_resource_id,
    'restored',
    v_user_id
  );
END;
$$;


-- ============================================================
-- 25. ENABLE AND FORCE RLS
-- ============================================================

ALTER TABLE workforce.document_categories
ENABLE ROW LEVEL SECURITY;

ALTER TABLE workforce.document_tags
ENABLE ROW LEVEL SECURITY;

ALTER TABLE workforce.documents
ENABLE ROW LEVEL SECURITY;

ALTER TABLE workforce.document_versions
ENABLE ROW LEVEL SECURITY;

ALTER TABLE workforce.document_tag_map
ENABLE ROW LEVEL SECURITY;

ALTER TABLE workforce.document_allowed_roles
ENABLE ROW LEVEL SECURITY;

ALTER TABLE workforce.document_allowed_departments
ENABLE ROW LEVEL SECURITY;

ALTER TABLE workforce.document_assigned_users
ENABLE ROW LEVEL SECURITY;

ALTER TABLE workforce.user_document_reads
ENABLE ROW LEVEL SECURITY;

ALTER TABLE workforce.document_acknowledgements
ENABLE ROW LEVEL SECURITY;

ALTER TABLE workforce.resource_categories
ENABLE ROW LEVEL SECURITY;

ALTER TABLE workforce.resources
ENABLE ROW LEVEL SECURITY;

ALTER TABLE workforce.resource_allowed_roles
ENABLE ROW LEVEL SECURITY;

ALTER TABLE workforce.resource_allowed_departments
ENABLE ROW LEVEL SECURITY;

ALTER TABLE workforce.resource_access_logs
ENABLE ROW LEVEL SECURITY;

ALTER TABLE workforce.content_archive_audit
ENABLE ROW LEVEL SECURITY;


ALTER TABLE workforce.document_categories
FORCE ROW LEVEL SECURITY;

ALTER TABLE workforce.document_tags
FORCE ROW LEVEL SECURITY;

ALTER TABLE workforce.documents
FORCE ROW LEVEL SECURITY;

ALTER TABLE workforce.document_versions
FORCE ROW LEVEL SECURITY;

ALTER TABLE workforce.document_tag_map
FORCE ROW LEVEL SECURITY;

ALTER TABLE workforce.document_allowed_roles
FORCE ROW LEVEL SECURITY;

ALTER TABLE workforce.document_allowed_departments
FORCE ROW LEVEL SECURITY;

ALTER TABLE workforce.document_assigned_users
FORCE ROW LEVEL SECURITY;

ALTER TABLE workforce.user_document_reads
FORCE ROW LEVEL SECURITY;

ALTER TABLE workforce.document_acknowledgements
FORCE ROW LEVEL SECURITY;

ALTER TABLE workforce.resource_categories
FORCE ROW LEVEL SECURITY;

ALTER TABLE workforce.resources
FORCE ROW LEVEL SECURITY;

ALTER TABLE workforce.resource_allowed_roles
FORCE ROW LEVEL SECURITY;

ALTER TABLE workforce.resource_allowed_departments
FORCE ROW LEVEL SECURITY;

ALTER TABLE workforce.resource_access_logs
FORCE ROW LEVEL SECURITY;

ALTER TABLE workforce.content_archive_audit
FORCE ROW LEVEL SECURITY;


-- ============================================================
-- 26. CATEGORY AND TAG POLICIES
-- ============================================================

CREATE POLICY document_categories_select
ON workforce.document_categories
FOR SELECT
USING (
  workforce.is_active_workforce_user()
);


CREATE POLICY document_categories_insert
ON workforce.document_categories
FOR INSERT
WITH CHECK (
  workforce.can_manage_content()
  AND (
    created_by IS NULL
    OR created_by = workforce.my_user_id()
  )
);


CREATE POLICY document_categories_update
ON workforce.document_categories
FOR UPDATE
USING (
  workforce.can_manage_content()
)
WITH CHECK (
  workforce.can_manage_content()
);


CREATE POLICY document_tags_select
ON workforce.document_tags
FOR SELECT
USING (
  workforce.is_active_workforce_user()
);


CREATE POLICY document_tags_insert
ON workforce.document_tags
FOR INSERT
WITH CHECK (
  workforce.can_manage_content()
  AND (
    created_by IS NULL
    OR created_by = workforce.my_user_id()
  )
);


CREATE POLICY document_tags_update
ON workforce.document_tags
FOR UPDATE
USING (
  workforce.can_manage_content()
)
WITH CHECK (
  workforce.can_manage_content()
);


CREATE POLICY resource_categories_select
ON workforce.resource_categories
FOR SELECT
USING (
  workforce.is_active_workforce_user()
);


CREATE POLICY resource_categories_insert
ON workforce.resource_categories
FOR INSERT
WITH CHECK (
  workforce.can_manage_content()
  AND (
    created_by IS NULL
    OR created_by = workforce.my_user_id()
  )
);


CREATE POLICY resource_categories_update
ON workforce.resource_categories
FOR UPDATE
USING (
  workforce.can_manage_content()
)
WITH CHECK (
  workforce.can_manage_content()
);


-- ============================================================
-- 27. DOCUMENT POLICIES
-- ============================================================

CREATE POLICY documents_select
ON workforce.documents
FOR SELECT
USING (
  workforce.can_view_document(id)
);


CREATE POLICY documents_insert
ON workforce.documents
FOR INSERT
WITH CHECK (
  workforce.can_manage_content()
  AND created_by = workforce.my_user_id()
  AND (
    updated_by IS NULL
    OR updated_by = workforce.my_user_id()
  )
  AND is_active = true
  AND archived_at IS NULL
  AND archived_by IS NULL
);


CREATE POLICY documents_update
ON workforce.documents
FOR UPDATE
USING (
  workforce.can_manage_content()
)
WITH CHECK (
  workforce.can_manage_content()
  AND updated_by = workforce.my_user_id()
);


-- No document DELETE policy.
-- Normal dashboard users cannot hard-delete documents.


-- ============================================================
-- 28. DOCUMENT VERSION POLICIES
-- ============================================================

CREATE POLICY document_versions_select
ON workforce.document_versions
FOR SELECT
USING (
  workforce.can_view_document(document_id)
);


CREATE POLICY document_versions_insert
ON workforce.document_versions
FOR INSERT
WITH CHECK (
  workforce.can_manage_content()
  AND created_by = workforce.my_user_id()
  AND EXISTS (
    SELECT 1
    FROM workforce.documents d
    WHERE d.id = document_id
      AND d.is_active = true
  )
);


-- No UPDATE or DELETE policy for document versions.


-- ============================================================
-- 29. DOCUMENT TAG MAP POLICIES
-- ============================================================

CREATE POLICY document_tag_map_select
ON workforce.document_tag_map
FOR SELECT
USING (
  workforce.can_view_document(document_id)
);


CREATE POLICY document_tag_map_write
ON workforce.document_tag_map
FOR ALL
USING (
  workforce.can_manage_content()
)
WITH CHECK (
  workforce.can_manage_content()
);


-- ============================================================
-- 30. DOCUMENT ROLE VISIBILITY POLICIES
-- ============================================================

CREATE POLICY document_allowed_roles_select
ON workforce.document_allowed_roles
FOR SELECT
USING (
  workforce.can_manage_content()
  OR (
    role_id = workforce.my_role_id()
    AND workforce.can_view_document(document_id)
  )
);


CREATE POLICY document_allowed_roles_write
ON workforce.document_allowed_roles
FOR ALL
USING (
  workforce.can_manage_content()
)
WITH CHECK (
  workforce.can_manage_content()
);


-- ============================================================
-- 31. DOCUMENT DEPARTMENT VISIBILITY POLICIES
-- ============================================================

CREATE POLICY document_allowed_departments_select
ON workforce.document_allowed_departments
FOR SELECT
USING (
  workforce.can_manage_content()
  OR (
    department_id = workforce.my_department_id()
    AND workforce.can_view_document(document_id)
  )
);


CREATE POLICY document_allowed_departments_write
ON workforce.document_allowed_departments
FOR ALL
USING (
  workforce.can_manage_content()
)
WITH CHECK (
  workforce.can_manage_content()
);


-- ============================================================
-- 32. DOCUMENT ASSIGNMENT POLICIES
-- ============================================================

CREATE POLICY document_assigned_users_select
ON workforce.document_assigned_users
FOR SELECT
USING (
  user_id = workforce.my_user_id()
  OR workforce.can_manage_content()
);


CREATE POLICY document_assigned_users_write
ON workforce.document_assigned_users
FOR ALL
USING (
  workforce.can_manage_content()
)
WITH CHECK (
  workforce.can_manage_content()
);


-- ============================================================
-- 33. VERSION-SPECIFIC READ POLICIES
-- ============================================================

CREATE POLICY user_document_reads_select
ON workforce.user_document_reads
FOR SELECT
USING (
  user_id = workforce.my_user_id()
  OR workforce.can_manage_content()
);


CREATE POLICY user_document_reads_insert
ON workforce.user_document_reads
FOR INSERT
WITH CHECK (
  user_id = workforce.my_user_id()
  AND workforce.can_view_document_version(
    document_version_id
  )
);


-- Reading progress UPDATE policy is added in migration 006.


-- ============================================================
-- 34. ACKNOWLEDGEMENT POLICIES
-- ============================================================

CREATE POLICY document_acknowledgements_select
ON workforce.document_acknowledgements
FOR SELECT
USING (
  user_id = workforce.my_user_id()
  OR workforce.can_manage_content()
);


CREATE POLICY document_acknowledgements_insert
ON workforce.document_acknowledgements
FOR INSERT
WITH CHECK (
  user_id = workforce.my_user_id()
  AND EXISTS (
    SELECT 1
    FROM workforce.document_versions dv
    JOIN workforce.documents d
      ON d.id = dv.document_id
    WHERE dv.id = document_version_id
      AND workforce.can_view_document(d.id)
      AND d.requires_acknowledgement = true
      AND dv.version_number = d.current_version
  )
);


-- No UPDATE or DELETE policy for acknowledgements.


-- ============================================================
-- 35. RESOURCE POLICIES
-- ============================================================

CREATE POLICY resources_select
ON workforce.resources
FOR SELECT
USING (
  workforce.can_view_resource(id)
);


CREATE POLICY resources_insert
ON workforce.resources
FOR INSERT
WITH CHECK (
  workforce.can_manage_content()
  AND created_by = workforce.my_user_id()
  AND (
    updated_by IS NULL
    OR updated_by = workforce.my_user_id()
  )
  AND is_active = true
  AND archived_at IS NULL
  AND archived_by IS NULL
);


CREATE POLICY resources_update
ON workforce.resources
FOR UPDATE
USING (
  workforce.can_manage_content()
)
WITH CHECK (
  workforce.can_manage_content()
  AND updated_by = workforce.my_user_id()
);


-- No resource DELETE policy.


-- ============================================================
-- 36. RESOURCE ROLE VISIBILITY POLICIES
-- ============================================================

CREATE POLICY resource_allowed_roles_select
ON workforce.resource_allowed_roles
FOR SELECT
USING (
  workforce.can_manage_content()
  OR (
    role_id = workforce.my_role_id()
    AND workforce.can_view_resource(resource_id)
  )
);


CREATE POLICY resource_allowed_roles_write
ON workforce.resource_allowed_roles
FOR ALL
USING (
  workforce.can_manage_content()
)
WITH CHECK (
  workforce.can_manage_content()
);


-- ============================================================
-- 37. RESOURCE DEPARTMENT VISIBILITY POLICIES
-- ============================================================

CREATE POLICY resource_allowed_departments_select
ON workforce.resource_allowed_departments
FOR SELECT
USING (
  workforce.can_manage_content()
  OR (
    department_id = workforce.my_department_id()
    AND workforce.can_view_resource(resource_id)
  )
);


CREATE POLICY resource_allowed_departments_write
ON workforce.resource_allowed_departments
FOR ALL
USING (
  workforce.can_manage_content()
)
WITH CHECK (
  workforce.can_manage_content()
);


-- ============================================================
-- 38. RESOURCE ACCESS LOG POLICIES
-- ============================================================

CREATE POLICY resource_access_logs_select
ON workforce.resource_access_logs
FOR SELECT
USING (
  user_id = workforce.my_user_id()
  OR workforce.can_manage_content()
);


CREATE POLICY resource_access_logs_insert
ON workforce.resource_access_logs
FOR INSERT
WITH CHECK (
  user_id = workforce.my_user_id()
  AND workforce.can_view_resource(resource_id)
);


-- No UPDATE or DELETE policy for access logs.


-- ============================================================
-- 39. ARCHIVE AUDIT POLICIES
-- ============================================================

CREATE POLICY content_archive_audit_select
ON workforce.content_archive_audit
FOR SELECT
USING (
  workforce.can_manage_content()
);


-- No direct INSERT, UPDATE or DELETE policies.
-- Archive functions create append-only audit records.


-- ============================================================
-- 40. PRIVILEGES
-- ============================================================

GRANT USAGE ON SCHEMA workforce
TO authenticated, service_role;


GRANT SELECT, INSERT, UPDATE
ON workforce.document_categories
TO authenticated;


GRANT SELECT, INSERT, UPDATE
ON workforce.document_tags
TO authenticated;


GRANT SELECT, INSERT
ON workforce.documents
TO authenticated;


GRANT UPDATE (
  title,
  description,
  category_id,
  storage_path,
  file_name,
  file_size_bytes,
  mime_type,
  preview_url,
  visibility_scope,
  current_version,
  requires_acknowledgement,
  updated_by
)
ON workforce.documents
TO authenticated;


GRANT SELECT, INSERT
ON workforce.document_versions
TO authenticated;


GRANT SELECT, INSERT, UPDATE, DELETE
ON workforce.document_tag_map
TO authenticated;


GRANT SELECT, INSERT, UPDATE, DELETE
ON workforce.document_allowed_roles
TO authenticated;


GRANT SELECT, INSERT, UPDATE, DELETE
ON workforce.document_allowed_departments
TO authenticated;


GRANT SELECT, INSERT, UPDATE, DELETE
ON workforce.document_assigned_users
TO authenticated;


GRANT SELECT, INSERT
ON workforce.user_document_reads
TO authenticated;


GRANT SELECT, INSERT
ON workforce.document_acknowledgements
TO authenticated;


GRANT SELECT, INSERT, UPDATE
ON workforce.resource_categories
TO authenticated;


GRANT SELECT, INSERT
ON workforce.resources
TO authenticated;


GRANT UPDATE (
  title,
  description,
  category_id,
  url,
  external,
  visibility_scope,
  updated_by
)
ON workforce.resources
TO authenticated;


GRANT SELECT, INSERT, UPDATE, DELETE
ON workforce.resource_allowed_roles
TO authenticated;


GRANT SELECT, INSERT, UPDATE, DELETE
ON workforce.resource_allowed_departments
TO authenticated;


GRANT SELECT, INSERT
ON workforce.resource_access_logs
TO authenticated;


GRANT SELECT
ON workforce.content_archive_audit
TO authenticated;


GRANT ALL PRIVILEGES
ON ALL TABLES IN SCHEMA workforce
TO service_role;


GRANT ALL PRIVILEGES
ON ALL FUNCTIONS IN SCHEMA workforce
TO service_role;


-- ============================================================
-- 41. FUNCTION EXECUTION SECURITY
-- ============================================================

REVOKE ALL
ON FUNCTION workforce.my_user_id()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.my_role_id()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.my_role_name()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.my_department_id()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.my_department_name()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.is_active_workforce_user()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.is_admin()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.is_hr_manager()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.is_hr_executive()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.is_hr()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.is_creator()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.is_creator_acquisition()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.is_content_lead()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.can_manage_content()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.is_direct_manager_of(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.can_view_document(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.can_view_document_version(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.can_view_resource(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.archive_document(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.restore_document(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.archive_resource(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.restore_resource(uuid)
FROM PUBLIC;


GRANT EXECUTE
ON FUNCTION workforce.my_user_id()
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.my_role_id()
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.my_role_name()
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.my_department_id()
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.my_department_name()
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.is_active_workforce_user()
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.is_admin()
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.is_hr_manager()
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.is_hr_executive()
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.is_hr()
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.is_creator()
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.is_creator_acquisition()
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.is_content_lead()
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.can_manage_content()
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.is_direct_manager_of(uuid)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.can_view_document(uuid)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.can_view_document_version(uuid)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.can_view_resource(uuid)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.archive_document(uuid)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.restore_document(uuid)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.archive_resource(uuid)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.restore_resource(uuid)
TO authenticated, service_role;


COMMIT;
