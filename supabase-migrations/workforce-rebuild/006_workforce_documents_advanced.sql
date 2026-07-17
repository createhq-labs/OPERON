BEGIN;

-- ============================================================
-- 006_WORKFORCE_DOCUMENTS_ADVANCED.SQL
--
-- Adds:
--   Version-specific reading progress
--   Interactive document rendering metadata
--   Review and publication workflow
--   Full-text and fuzzy search
--   RLS-aware unified document/resource search
--
-- SCHEMA BOUNDARY:
--   public.*    : untouched
--   global.*    : read/reference only
--   workforce.* : altered/created here
--   extensions  : pg_trgm extension only
-- ============================================================


-- ============================================================
-- 1. PREFLIGHT
-- ============================================================

DO $$
BEGIN
  IF to_regclass('workforce.documents') IS NULL THEN
    RAISE EXCEPTION
      'workforce.documents is missing. Run migration 001 first.';
  END IF;

  IF to_regclass('workforce.document_versions') IS NULL THEN
    RAISE EXCEPTION
      'workforce.document_versions is missing. Run migration 001 first.';
  END IF;

  IF to_regclass('workforce.user_document_reads') IS NULL THEN
    RAISE EXCEPTION
      'workforce.user_document_reads is missing. Run migration 001 first.';
  END IF;

  IF to_regclass('workforce.document_acknowledgements') IS NULL THEN
    RAISE EXCEPTION
      'workforce.document_acknowledgements is missing.';
  END IF;

  IF to_regclass('workforce.resources') IS NULL THEN
    RAISE EXCEPTION
      'workforce.resources is missing. Run migration 001 first.';
  END IF;

  IF to_regprocedure(
    'workforce.can_view_document_version(uuid)'
  ) IS NULL THEN
    RAISE EXCEPTION
      'workforce.can_view_document_version(uuid) is missing.';
  END IF;

  IF to_regprocedure('workforce.can_manage_content()') IS NULL THEN
    RAISE EXCEPTION
      'workforce.can_manage_content() is missing.';
  END IF;

  IF to_regprocedure(
    'workforce.notify_document_version_published(uuid)'
  ) IS NULL THEN
    RAISE EXCEPTION
      'Document publication notification function is missing. Run migration 005 first.';
  END IF;
END;
$$;


-- ============================================================
-- 2. SEARCH EXTENSION
--
-- Supabase commonly uses the extensions schema.
-- No public-schema object is created or altered.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS extensions;

CREATE EXTENSION IF NOT EXISTS pg_trgm
WITH SCHEMA extensions;


-- ============================================================
-- 3. VERSION-SPECIFIC READING PROGRESS
-- ============================================================

ALTER TABLE workforce.user_document_reads
ADD COLUMN progress_percent numeric(5,2)
NOT NULL DEFAULT 0;

ALTER TABLE workforce.user_document_reads
ADD COLUMN last_block_key text;

ALTER TABLE workforce.user_document_reads
ADD COLUMN highest_block_index integer
NOT NULL DEFAULT 0;

ALTER TABLE workforce.user_document_reads
ADD COLUMN total_blocks integer
NOT NULL DEFAULT 0;

ALTER TABLE workforce.user_document_reads
ADD COLUMN time_spent_seconds integer
NOT NULL DEFAULT 0;

ALTER TABLE workforce.user_document_reads
ADD COLUMN last_viewed_at timestamptz
NOT NULL DEFAULT now();

ALTER TABLE workforce.user_document_reads
ADD COLUMN completed_at timestamptz;


ALTER TABLE workforce.user_document_reads
ADD CONSTRAINT user_document_reads_progress_check
CHECK (
  progress_percent >= 0
  AND progress_percent <= 100
);


ALTER TABLE workforce.user_document_reads
ADD CONSTRAINT user_document_reads_blocks_check
CHECK (
  highest_block_index >= 0
  AND total_blocks >= 0
  AND (
    total_blocks = 0
    OR highest_block_index <= total_blocks
  )
);


ALTER TABLE workforce.user_document_reads
ADD CONSTRAINT user_document_reads_time_check
CHECK (
  time_spent_seconds >= 0
);


CREATE INDEX idx_user_document_reads_last_viewed
ON workforce.user_document_reads(
  user_id,
  last_viewed_at DESC
);


CREATE INDEX idx_user_document_reads_incomplete
ON workforce.user_document_reads(
  user_id,
  last_viewed_at DESC
)
WHERE completed_at IS NULL;


-- ============================================================
-- 4. READING PROGRESS VALIDATION
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.validate_document_read_progress()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, workforce
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.document_version_id
       IS DISTINCT FROM OLD.document_version_id THEN
      RAISE EXCEPTION
        'Document version cannot be changed on a read-progress row';
    END IF;

    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION
        'Read-progress owner cannot be changed';
    END IF;

    NEW.progress_percent :=
      GREATEST(
        OLD.progress_percent,
        NEW.progress_percent
      );

    NEW.highest_block_index :=
      GREATEST(
        OLD.highest_block_index,
        NEW.highest_block_index
      );

    NEW.time_spent_seconds :=
      GREATEST(
        OLD.time_spent_seconds,
        NEW.time_spent_seconds
      );

    NEW.total_blocks :=
      GREATEST(
        OLD.total_blocks,
        NEW.total_blocks
      );
  END IF;

  NEW.last_viewed_at := now();

  IF NEW.progress_percent >= 100
     AND NEW.completed_at IS NULL THEN
    NEW.completed_at := now();
  END IF;

  RETURN NEW;
END;
$$;


CREATE TRIGGER trg_user_document_reads_progress
BEFORE INSERT OR UPDATE
ON workforce.user_document_reads
FOR EACH ROW
EXECUTE FUNCTION workforce.validate_document_read_progress();


-- ============================================================
-- 5. CONTROLLED PROGRESS UPSERT
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.save_document_progress(
  p_document_version_id uuid,
  p_progress_percent numeric,
  p_last_block_key text,
  p_highest_block_index integer,
  p_total_blocks integer,
  p_time_spent_seconds integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, workforce
AS $$
DECLARE
  v_user_id uuid;
  v_read_id uuid;
BEGIN
  v_user_id := workforce.my_user_id();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  IF NOT workforce.can_view_document_version(
    p_document_version_id
  ) THEN
    RAISE EXCEPTION
      'Document version is not accessible';
  END IF;

  IF p_progress_percent IS NULL
     OR p_progress_percent < 0
     OR p_progress_percent > 100 THEN
    RAISE EXCEPTION
      'Progress percentage must be between 0 and 100';
  END IF;

  IF p_highest_block_index IS NULL
     OR p_highest_block_index < 0 THEN
    RAISE EXCEPTION
      'Highest block index cannot be negative';
  END IF;

  IF p_total_blocks IS NULL
     OR p_total_blocks < 0 THEN
    RAISE EXCEPTION
      'Total blocks cannot be negative';
  END IF;

  IF p_total_blocks > 0
     AND p_highest_block_index > p_total_blocks THEN
    RAISE EXCEPTION
      'Highest block index cannot exceed total blocks';
  END IF;

  IF p_time_spent_seconds IS NULL
     OR p_time_spent_seconds < 0 THEN
    RAISE EXCEPTION
      'Time spent cannot be negative';
  END IF;

  INSERT INTO workforce.user_document_reads (
    document_version_id,
    user_id,
    read_at,
    progress_percent,
    last_block_key,
    highest_block_index,
    total_blocks,
    time_spent_seconds,
    last_viewed_at
  )
  VALUES (
    p_document_version_id,
    v_user_id,
    now(),
    p_progress_percent,
    p_last_block_key,
    p_highest_block_index,
    p_total_blocks,
    p_time_spent_seconds,
    now()
  )
  ON CONFLICT (
    document_version_id,
    user_id
  )
  DO UPDATE SET
    progress_percent =
      GREATEST(
        workforce.user_document_reads.progress_percent,
        EXCLUDED.progress_percent
      ),

    last_block_key =
      EXCLUDED.last_block_key,

    highest_block_index =
      GREATEST(
        workforce.user_document_reads.highest_block_index,
        EXCLUDED.highest_block_index
      ),

    total_blocks =
      GREATEST(
        workforce.user_document_reads.total_blocks,
        EXCLUDED.total_blocks
      ),

    time_spent_seconds =
      GREATEST(
        workforce.user_document_reads.time_spent_seconds,
        EXCLUDED.time_spent_seconds
      ),

    last_viewed_at = now()

  RETURNING id
  INTO v_read_id;

  RETURN v_read_id;
END;
$$;


-- ============================================================
-- 6. READING PROGRESS RLS
-- ============================================================

DROP POLICY IF EXISTS user_document_reads_update
ON workforce.user_document_reads;


CREATE POLICY user_document_reads_update
ON workforce.user_document_reads
FOR UPDATE
USING (
  user_id = workforce.my_user_id()
  AND workforce.can_view_document_version(
    document_version_id
  )
)
WITH CHECK (
  user_id = workforce.my_user_id()
  AND workforce.can_view_document_version(
    document_version_id
  )
);


-- ============================================================
-- 7. INTERACTIVE RENDERING METADATA
-- ============================================================

ALTER TABLE workforce.document_versions
ADD COLUMN rendered_content jsonb;

ALTER TABLE workforce.document_versions
ADD COLUMN render_status text
NOT NULL DEFAULT 'pending';

ALTER TABLE workforce.document_versions
ADD COLUMN rendered_at timestamptz;

ALTER TABLE workforce.document_versions
ADD COLUMN render_error text;

ALTER TABLE workforce.document_versions
ADD COLUMN parser_version text;

ALTER TABLE workforce.document_versions
ADD COLUMN total_blocks integer
NOT NULL DEFAULT 0;

ALTER TABLE workforce.document_versions
ADD COLUMN reviewed_by uuid
REFERENCES global.users(id)
ON DELETE SET NULL;

ALTER TABLE workforce.document_versions
ADD COLUMN reviewed_at timestamptz;

ALTER TABLE workforce.document_versions
ADD COLUMN published_by uuid
REFERENCES global.users(id)
ON DELETE SET NULL;

ALTER TABLE workforce.document_versions
ADD COLUMN published_at timestamptz;


ALTER TABLE workforce.document_versions
ADD CONSTRAINT document_versions_render_status_check
CHECK (
  render_status IN (
    'pending',
    'processing',
    'ready_for_review',
    'published',
    'failed'
  )
);


ALTER TABLE workforce.document_versions
ADD CONSTRAINT document_versions_total_blocks_check
CHECK (
  total_blocks >= 0
);


ALTER TABLE workforce.document_versions
ADD CONSTRAINT document_versions_review_state_check
CHECK (
  (
    reviewed_by IS NULL
    AND reviewed_at IS NULL
  )
  OR
  (
    reviewed_by IS NOT NULL
    AND reviewed_at IS NOT NULL
  )
);


ALTER TABLE workforce.document_versions
ADD CONSTRAINT document_versions_publish_state_check
CHECK (
  (
    published_by IS NULL
    AND published_at IS NULL
  )
  OR
  (
    published_by IS NOT NULL
    AND published_at IS NOT NULL
  )
);


ALTER TABLE workforce.document_versions
ADD CONSTRAINT document_versions_published_content_check
CHECK (
  render_status <> 'published'
  OR (
    rendered_content IS NOT NULL
    AND rendered_at IS NOT NULL
    AND reviewed_by IS NOT NULL
    AND reviewed_at IS NOT NULL
    AND published_by IS NOT NULL
    AND published_at IS NOT NULL
  )
);


ALTER TABLE workforce.document_versions
ADD CONSTRAINT document_versions_failed_error_check
CHECK (
  render_status <> 'failed'
  OR (
    render_error IS NOT NULL
    AND btrim(render_error) <> ''
  )
);


CREATE INDEX idx_document_versions_render_status
ON workforce.document_versions(
  render_status,
  created_at DESC
);


CREATE INDEX idx_document_versions_published
ON workforce.document_versions(
  document_id,
  version_number DESC
)
WHERE render_status = 'published';


-- ============================================================
-- 8. RENDER PAYLOAD VALIDATION
--
-- Prevents arbitrary top-level generated content categories.
-- It does not inspect or rewrite original document text.
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.validate_rendered_content()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, workforce
AS $$
DECLARE
  v_key text;
  v_allowed_keys text[] := ARRAY[
    'title',
    'blocks',
    'headings',
    'paragraphs',
    'lists',
    'numbered_steps',
    'tables',
    'images',
    'captions',
    'links',
    'metadata'
  ];
BEGIN
  IF NEW.rendered_content IS NOT NULL THEN
    IF jsonb_typeof(NEW.rendered_content) <> 'object' THEN
      RAISE EXCEPTION
        'Rendered content must be a JSON object';
    END IF;

    FOR v_key IN
      SELECT jsonb_object_keys(NEW.rendered_content)
    LOOP
      IF NOT v_key = ANY(v_allowed_keys) THEN
        RAISE EXCEPTION
          'Unsupported rendered-content key: %',
          v_key;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;


CREATE TRIGGER trg_document_versions_render_validation
BEFORE INSERT OR UPDATE OF rendered_content
ON workforce.document_versions
FOR EACH ROW
EXECUTE FUNCTION workforce.validate_rendered_content();


-- ============================================================
-- 9. STORE PARSER OUTPUT
--
-- Intended for parser/backend processing.
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.store_rendered_document(
  p_document_version_id uuid,
  p_rendered_content jsonb,
  p_parser_version text,
  p_total_blocks integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, workforce
AS $$
BEGIN
  IF p_rendered_content IS NULL THEN
    RAISE EXCEPTION 'Rendered content is required';
  END IF;

  IF p_parser_version IS NULL
     OR btrim(p_parser_version) = '' THEN
    RAISE EXCEPTION 'Parser version is required';
  END IF;

  IF p_total_blocks IS NULL
     OR p_total_blocks < 0 THEN
    RAISE EXCEPTION
      'Total blocks cannot be negative';
  END IF;

  UPDATE workforce.document_versions
  SET
    rendered_content = p_rendered_content,
    parser_version = btrim(p_parser_version),
    total_blocks = p_total_blocks,
    render_status = 'ready_for_review',
    rendered_at = now(),
    render_error = NULL,
    reviewed_by = NULL,
    reviewed_at = NULL,
    published_by = NULL,
    published_at = NULL
  WHERE id = p_document_version_id
    AND render_status IN (
      'pending',
      'processing',
      'failed',
      'ready_for_review'
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Document version cannot accept rendered content in its current state';
  END IF;
END;
$$;


CREATE OR REPLACE FUNCTION workforce.mark_document_render_processing(
  p_document_version_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, workforce
AS $$
BEGIN
  UPDATE workforce.document_versions
  SET
    render_status = 'processing',
    render_error = NULL
  WHERE id = p_document_version_id
    AND render_status IN (
      'pending',
      'failed'
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Document version cannot enter processing state';
  END IF;
END;
$$;


CREATE OR REPLACE FUNCTION workforce.mark_document_render_failed(
  p_document_version_id uuid,
  p_render_error text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, workforce
AS $$
BEGIN
  IF p_render_error IS NULL
     OR btrim(p_render_error) = '' THEN
    RAISE EXCEPTION 'Render error is required';
  END IF;

  UPDATE workforce.document_versions
  SET
    render_status = 'failed',
    render_error = btrim(p_render_error)
  WHERE id = p_document_version_id
    AND render_status IN (
      'pending',
      'processing',
      'ready_for_review',
      'failed'
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Document version cannot be marked failed';
  END IF;
END;
$$;


-- ============================================================
-- 10. REVIEW AND PUBLICATION
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.review_document_version(
  p_document_version_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, workforce
AS $$
DECLARE
  v_actor uuid;
BEGIN
  IF NOT workforce.can_manage_content() THEN
    RAISE EXCEPTION
      'Not authorized to review document versions';
  END IF;

  v_actor := workforce.my_user_id();

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  UPDATE workforce.document_versions
  SET
    reviewed_by = v_actor,
    reviewed_at = now()
  WHERE id = p_document_version_id
    AND render_status = 'ready_for_review'
    AND rendered_content IS NOT NULL
    AND rendered_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Document version is not ready for review';
  END IF;
END;
$$;


CREATE OR REPLACE FUNCTION workforce.publish_document_version(
  p_document_version_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, workforce
AS $$
DECLARE
  v_actor uuid;
  v_document_id uuid;
  v_version_number integer;
  v_existing_published_count integer;
BEGIN
  IF NOT workforce.can_manage_content() THEN
    RAISE EXCEPTION
      'Not authorized to publish document versions';
  END IF;

  v_actor := workforce.my_user_id();

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  SELECT
    dv.document_id,
    dv.version_number
  INTO
    v_document_id,
    v_version_number
  FROM workforce.document_versions dv
  JOIN workforce.documents d
    ON d.id = dv.document_id
  WHERE dv.id = p_document_version_id
    AND dv.render_status = 'ready_for_review'
    AND dv.rendered_content IS NOT NULL
    AND dv.rendered_at IS NOT NULL
    AND dv.reviewed_by IS NOT NULL
    AND dv.reviewed_at IS NOT NULL
    AND d.is_active = true
  FOR UPDATE OF dv, d;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Reviewed active document version not found';
  END IF;

  SELECT COUNT(*)
  INTO v_existing_published_count
  FROM workforce.document_versions dv
  WHERE dv.document_id = v_document_id
    AND dv.render_status = 'published';

  UPDATE workforce.document_versions
  SET
    render_status = 'published',
    published_by = v_actor,
    published_at = now()
  WHERE id = p_document_version_id;

  UPDATE workforce.documents
  SET
    current_version = v_version_number,
    updated_by = v_actor,
    updated_at = now()
  WHERE id = v_document_id;

  IF v_existing_published_count = 0 THEN
    PERFORM workforce.notify_document_published(
      v_document_id
    );
  ELSE
    PERFORM workforce.notify_document_version_published(
      p_document_version_id
    );
  END IF;
END;
$$;


-- ============================================================
-- 11. DOCUMENT VERSION UPDATE POLICY
--
-- Direct authenticated updates remain blocked.
-- Rendering and publication use controlled functions.
-- ============================================================

-- No direct UPDATE policy is created on document_versions.


-- ============================================================
-- 12. FULL-TEXT SEARCH INDEXES
-- ============================================================

CREATE INDEX idx_documents_search_vector
ON workforce.documents
USING gin (
  to_tsvector(
    'simple',
    COALESCE(title, '') || ' ' ||
    COALESCE(description, '') || ' ' ||
    COALESCE(file_name, '')
  )
);


CREATE INDEX idx_document_versions_rendered_search
ON workforce.document_versions
USING gin (
  to_tsvector(
    'simple',
    COALESCE(rendered_content::text, '')
  )
)
WHERE render_status = 'published';


CREATE INDEX idx_resources_search_vector
ON workforce.resources
USING gin (
  to_tsvector(
    'simple',
    COALESCE(title, '') || ' ' ||
    COALESCE(description, '') || ' ' ||
    COALESCE(url, '')
  )
);


CREATE INDEX idx_documents_title_trgm
ON workforce.documents
USING gin (
  title extensions.gin_trgm_ops
);


CREATE INDEX idx_resources_title_trgm
ON workforce.resources
USING gin (
  title extensions.gin_trgm_ops
);


CREATE INDEX idx_document_categories_name_trgm
ON workforce.document_categories
USING gin (
  name extensions.gin_trgm_ops
);


CREATE INDEX idx_resource_categories_name_trgm
ON workforce.resource_categories
USING gin (
  name extensions.gin_trgm_ops
);


CREATE INDEX idx_document_tags_name_trgm
ON workforce.document_tags
USING gin (
  name extensions.gin_trgm_ops
);


-- ============================================================
-- 13. ACCESSIBLE DOCUMENT DOWNLOAD METADATA
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.get_document_download(
  p_document_version_id uuid
)
RETURNS TABLE (
  document_id uuid,
  document_version_id uuid,
  title text,
  version_number integer,
  storage_path text,
  file_name text,
  file_size_bytes bigint,
  mime_type text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, workforce
AS $$
BEGIN
  IF NOT workforce.can_view_document_version(
    p_document_version_id
  ) THEN
    RAISE EXCEPTION
      'Document version is not accessible';
  END IF;

  RETURN QUERY
  SELECT
    d.id,
    dv.id,
    d.title,
    dv.version_number,
    COALESCE(dv.storage_path, d.storage_path),
    COALESCE(dv.file_name, d.file_name),
    COALESCE(dv.file_size_bytes, d.file_size_bytes),
    COALESCE(dv.mime_type, d.mime_type)
  FROM workforce.document_versions dv
  JOIN workforce.documents d
    ON d.id = dv.document_id
  WHERE dv.id = p_document_version_id
    AND d.is_active = true;
END;
$$;


-- ============================================================
-- 14. UNIFIED ADVANCED SEARCH
--
-- p_content_type:
--   all
--   document
--   resource
--
-- p_sort:
--   relevance
--   newest
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.search_content(
  p_query text DEFAULT NULL,
  p_content_type text DEFAULT 'all',
  p_category_id uuid DEFAULT NULL,
  p_tag_id uuid DEFAULT NULL,
  p_department_id uuid DEFAULT NULL,
  p_role_id uuid DEFAULT NULL,
  p_sort text DEFAULT 'relevance',
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  content_type text,
  content_id uuid,
  document_version_id uuid,
  title text,
  description text,
  category_id uuid,
  category_name text,
  file_name text,
  resource_url text,
  relevance real,
  published_or_created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, extensions, workforce
AS $$
DECLARE
  v_query text;
BEGIN
  IF p_content_type NOT IN (
    'all',
    'document',
    'resource'
  ) THEN
    RAISE EXCEPTION
      'Content type must be all, document or resource';
  END IF;

  IF p_sort NOT IN (
    'relevance',
    'newest'
  ) THEN
    RAISE EXCEPTION
      'Sort must be relevance or newest';
  END IF;

  IF p_limit < 1 OR p_limit > 200 THEN
    RAISE EXCEPTION
      'Limit must be between 1 and 200';
  END IF;

  IF p_offset < 0 THEN
    RAISE EXCEPTION
      'Offset cannot be negative';
  END IF;

  v_query := NULLIF(btrim(p_query), '');

  RETURN QUERY
  WITH searchable_documents AS (
    SELECT
      'document'::text AS content_type,
      d.id AS content_id,
      dv.id AS document_version_id,
      d.title,
      d.description,
      d.category_id,
      dc.name AS category_name,
      COALESCE(dv.file_name, d.file_name) AS file_name,
      NULL::text AS resource_url,

      CASE
        WHEN v_query IS NULL THEN 0::real
        ELSE (
          ts_rank(
            to_tsvector(
              'simple',
              COALESCE(d.title, '') || ' ' ||
              COALESCE(d.description, '') || ' ' ||
              COALESCE(dv.file_name, d.file_name, '') || ' ' ||
              COALESCE(dc.name, '') || ' ' ||
              COALESCE(dv.rendered_content::text, '') || ' ' ||
              COALESCE(tags.tag_text, '')
            ),
            websearch_to_tsquery('simple', v_query)
          )
          +
          extensions.similarity(
            lower(d.title),
            lower(v_query)
          )
        )::real
      END AS relevance,

      COALESCE(
        dv.published_at,
        dv.created_at
      ) AS published_or_created_at

    FROM workforce.documents d

    JOIN workforce.document_versions dv
      ON dv.document_id = d.id
     AND dv.version_number = d.current_version
     AND dv.render_status = 'published'

    LEFT JOIN workforce.document_categories dc
      ON dc.id = d.category_id

    LEFT JOIN LATERAL (
      SELECT string_agg(dt.name, ' ') AS tag_text
      FROM workforce.document_tag_map dtm
      JOIN workforce.document_tags dt
        ON dt.id = dtm.tag_id
      WHERE dtm.document_id = d.id
    ) tags
      ON true

    WHERE d.is_active = true

      AND workforce.can_view_document(d.id)

      AND p_content_type IN ('all', 'document')

      AND (
        p_category_id IS NULL
        OR d.category_id = p_category_id
      )

      AND (
        p_tag_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM workforce.document_tag_map dtm
          WHERE dtm.document_id = d.id
            AND dtm.tag_id = p_tag_id
        )
      )

      AND (
        p_department_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM workforce.document_allowed_departments dad
          WHERE dad.document_id = d.id
            AND dad.department_id = p_department_id
        )
      )

      AND (
        p_role_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM workforce.document_allowed_roles dar
          WHERE dar.document_id = d.id
            AND dar.role_id = p_role_id
        )
      )

      AND (
        v_query IS NULL

        OR to_tsvector(
          'simple',
          COALESCE(d.title, '') || ' ' ||
          COALESCE(d.description, '') || ' ' ||
          COALESCE(dv.file_name, d.file_name, '') || ' ' ||
          COALESCE(dc.name, '') || ' ' ||
          COALESCE(dv.rendered_content::text, '') || ' ' ||
          COALESCE(tags.tag_text, '')
        ) @@ websearch_to_tsquery(
          'simple',
          v_query
        )

        OR extensions.similarity(
          lower(d.title),
          lower(v_query)
        ) >= 0.2
      )
  ),

  searchable_resources AS (
    SELECT
      'resource'::text AS content_type,
      r.id AS content_id,
      NULL::uuid AS document_version_id,
      r.title,
      r.description,
      r.category_id,
      rc.name AS category_name,
      NULL::text AS file_name,
      r.url AS resource_url,

      CASE
        WHEN v_query IS NULL THEN 0::real
        ELSE (
          ts_rank(
            to_tsvector(
              'simple',
              COALESCE(r.title, '') || ' ' ||
              COALESCE(r.description, '') || ' ' ||
              COALESCE(rc.name, '') || ' ' ||
              COALESCE(r.url, '')
            ),
            websearch_to_tsquery('simple', v_query)
          )
          +
          extensions.similarity(
            lower(r.title),
            lower(v_query)
          )
        )::real
      END AS relevance,

      r.created_at AS published_or_created_at

    FROM workforce.resources r

    LEFT JOIN workforce.resource_categories rc
      ON rc.id = r.category_id

    WHERE r.is_active = true

      AND workforce.can_view_resource(r.id)

      AND p_content_type IN ('all', 'resource')

      AND (
        p_category_id IS NULL
        OR r.category_id = p_category_id
      )

      AND p_tag_id IS NULL

      AND (
        p_department_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM workforce.resource_allowed_departments rad
          WHERE rad.resource_id = r.id
            AND rad.department_id = p_department_id
        )
      )

      AND (
        p_role_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM workforce.resource_allowed_roles rar
          WHERE rar.resource_id = r.id
            AND rar.role_id = p_role_id
        )
      )

      AND (
        v_query IS NULL

        OR to_tsvector(
          'simple',
          COALESCE(r.title, '') || ' ' ||
          COALESCE(r.description, '') || ' ' ||
          COALESCE(rc.name, '') || ' ' ||
          COALESCE(r.url, '')
        ) @@ websearch_to_tsquery(
          'simple',
          v_query
        )

        OR extensions.similarity(
          lower(r.title),
          lower(v_query)
        ) >= 0.2
      )
  ),

  combined AS (
    SELECT * FROM searchable_documents
    UNION ALL
    SELECT * FROM searchable_resources
  )

  SELECT
    c.content_type,
    c.content_id,
    c.document_version_id,
    c.title,
    c.description,
    c.category_id,
    c.category_name,
    c.file_name,
    c.resource_url,
    c.relevance,
    c.published_or_created_at
  FROM combined c

  ORDER BY
    CASE
      WHEN p_sort = 'relevance'
        THEN c.relevance
    END DESC,

    CASE
      WHEN p_sort = 'newest'
        THEN c.published_or_created_at
    END DESC,

    c.published_or_created_at DESC,
    c.title ASC

  LIMIT p_limit
  OFFSET p_offset;
END;
$$;


-- ============================================================
-- 15. PRIVILEGES
-- ============================================================

GRANT UPDATE (
  progress_percent,
  last_block_key,
  highest_block_index,
  total_blocks,
  time_spent_seconds,
  last_viewed_at,
  completed_at
)
ON workforce.user_document_reads
TO authenticated;


GRANT SELECT (
  rendered_content,
  render_status,
  rendered_at,
  parser_version,
  total_blocks,
  reviewed_at,
  published_at
)
ON workforce.document_versions
TO authenticated;


-- Parser/service backend may update rendering fields.

GRANT UPDATE (
  rendered_content,
  render_status,
  rendered_at,
  render_error,
  parser_version,
  total_blocks,
  reviewed_by,
  reviewed_at,
  published_by,
  published_at
)
ON workforce.document_versions
TO service_role;


-- ============================================================
-- 16. FUNCTION SECURITY
-- ============================================================

REVOKE ALL
ON FUNCTION workforce.validate_document_read_progress()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.save_document_progress(
  uuid,
  numeric,
  text,
  integer,
  integer,
  integer
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.validate_rendered_content()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.store_rendered_document(
  uuid,
  jsonb,
  text,
  integer
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.mark_document_render_processing(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.mark_document_render_failed(
  uuid,
  text
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.review_document_version(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.publish_document_version(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.get_document_download(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.search_content(
  text,
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  integer,
  integer
)
FROM PUBLIC;


GRANT EXECUTE
ON FUNCTION workforce.save_document_progress(
  uuid,
  numeric,
  text,
  integer,
  integer,
  integer
)
TO authenticated, service_role;


GRANT EXECUTE
ON FUNCTION workforce.review_document_version(uuid)
TO authenticated, service_role;


GRANT EXECUTE
ON FUNCTION workforce.publish_document_version(uuid)
TO authenticated, service_role;


GRANT EXECUTE
ON FUNCTION workforce.get_document_download(uuid)
TO authenticated, service_role;


GRANT EXECUTE
ON FUNCTION workforce.search_content(
  text,
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  integer,
  integer
)
TO authenticated, service_role;


GRANT EXECUTE
ON FUNCTION workforce.store_rendered_document(
  uuid,
  jsonb,
  text,
  integer
)
TO service_role;


GRANT EXECUTE
ON FUNCTION workforce.mark_document_render_processing(uuid)
TO service_role;


GRANT EXECUTE
ON FUNCTION workforce.mark_document_render_failed(
  uuid,
  text
)
TO service_role;


COMMIT;
Post-execution checks
