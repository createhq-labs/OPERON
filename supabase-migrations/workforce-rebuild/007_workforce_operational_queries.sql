WRITE 007 PROPERLY IN ONE GO
BEGIN;

-- ============================================================
-- 007_WORKFORCE_OPERATIONAL_QUERIES.SQL
--
-- Run after:
--   001_workforce_foundation.sql
--   002_workforce_employment_onboarding.sql
--   003.1_workforce_attendance.sql
--   003.2_workforce_leave_workflow.sql
--   004.1_workforce_probation.sql
--   004.2_workforce_deboarding.sql
--   005_workforce_notifications.sql
--   006_workforce_documents_advanced.sql
--
-- Adds dashboard-ready read/RPC functions for:
--   Accessible documents and resources
--   Pending acknowledgements
--   Acknowledgement action
--   Notification feed
--   Attendance range presets
--   Attendance calendar
--   Direct reports
--   Organization attendance matrix
--   Probation dashboard
--   Deboarding dashboard
--   Final Workforce integrity audit
--
-- SCHEMA BOUNDARY:
--   public.*    : untouched
--   global.*    : read/reference only
--   workforce.* : functions created here
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

  IF to_regclass('workforce.documents') IS NULL THEN
    RAISE EXCEPTION
      'workforce.documents is missing. Run migration 001 first.';
  END IF;

  IF to_regclass('workforce.document_versions') IS NULL THEN
    RAISE EXCEPTION
      'workforce.document_versions is missing. Run migration 001 first.';
  END IF;

  IF to_regclass('workforce.document_acknowledgements') IS NULL THEN
    RAISE EXCEPTION
      'workforce.document_acknowledgements is missing.';
  END IF;

  IF to_regclass('workforce.user_document_reads') IS NULL THEN
    RAISE EXCEPTION
      'workforce.user_document_reads is missing.';
  END IF;

  IF to_regclass('workforce.resources') IS NULL THEN
    RAISE EXCEPTION
      'workforce.resources is missing. Run migration 001 first.';
  END IF;

  IF to_regclass('workforce.notifications') IS NULL THEN
    RAISE EXCEPTION
      'workforce.notifications is missing. Run migration 005 first.';
  END IF;

  IF to_regclass('workforce.notification_recipients') IS NULL THEN
    RAISE EXCEPTION
      'workforce.notification_recipients is missing. Run migration 005 first.';
  END IF;

  IF to_regclass('workforce.hr_attendance') IS NULL THEN
    RAISE EXCEPTION
      'workforce.hr_attendance is missing. Run migration 003.1 first.';
  END IF;

  IF to_regclass('workforce.hr_holidays') IS NULL THEN
    RAISE EXCEPTION
      'workforce.hr_holidays is missing. Run migration 003.1 first.';
  END IF;

  IF to_regclass('workforce.hr_probation') IS NULL THEN
    RAISE EXCEPTION
      'workforce.hr_probation is missing. Run migration 004.1 first.';
  END IF;

  IF to_regclass('workforce.hr_deboarding') IS NULL THEN
    RAISE EXCEPTION
      'workforce.hr_deboarding is missing. Run migration 004.2 first.';
  END IF;

  IF to_regprocedure('workforce.my_user_id()') IS NULL THEN
    RAISE EXCEPTION
      'workforce.my_user_id() is missing.';
  END IF;

  IF to_regprocedure('workforce.can_view_document(uuid)') IS NULL THEN
    RAISE EXCEPTION
      'workforce.can_view_document(uuid) is missing.';
  END IF;

  IF to_regprocedure('workforce.can_view_resource(uuid)') IS NULL THEN
    RAISE EXCEPTION
      'workforce.can_view_resource(uuid) is missing.';
  END IF;

  IF to_regprocedure(
    'workforce.can_view_attendance_for(uuid)'
  ) IS NULL THEN
    RAISE EXCEPTION
      'workforce.can_view_attendance_for(uuid) is missing.';
  END IF;

  IF to_regprocedure(
    'workforce.get_attendance_calendar(uuid,date,date)'
  ) IS NULL THEN
    RAISE EXCEPTION
      'workforce.get_attendance_calendar(uuid,date,date) is missing.';
  END IF;

  IF to_regprocedure('workforce.can_manage_probation()') IS NULL THEN
    RAISE EXCEPTION
      'workforce.can_manage_probation() is missing.';
  END IF;

  IF to_regprocedure('workforce.can_view_deboarding()') IS NULL THEN
    RAISE EXCEPTION
      'workforce.can_view_deboarding() is missing.';
  END IF;
END;
$$;


-- ============================================================
-- 2. ACCESSIBLE DOCUMENTS
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.list_accessible_documents(
  p_category_id uuid DEFAULT NULL,
  p_requires_acknowledgement boolean DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  document_id uuid,
  title text,
  description text,
  category_id uuid,
  category_name text,
  current_version integer,
  document_version_id uuid,
  file_name text,
  mime_type text,
  requires_acknowledgement boolean,
  acknowledged boolean,
  progress_percent numeric,
  completed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := workforce.my_user_id();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  IF p_limit IS NULL
     OR p_limit < 1
     OR p_limit > 500 THEN
    RAISE EXCEPTION
      'Limit must be between 1 and 500';
  END IF;

  IF p_offset IS NULL
     OR p_offset < 0 THEN
    RAISE EXCEPTION
      'Offset cannot be negative';
  END IF;

  RETURN QUERY
  SELECT
    d.id,
    d.title,
    d.description,
    d.category_id,
    dc.name,
    d.current_version,
    dv.id,
    COALESCE(dv.file_name, d.file_name),
    COALESCE(dv.mime_type, d.mime_type),
    d.requires_acknowledgement,

    EXISTS (
      SELECT 1
      FROM workforce.document_acknowledgements da
      WHERE da.document_version_id = dv.id
        AND da.user_id = v_user_id
    ) AS acknowledged,

    COALESCE(udr.progress_percent, 0::numeric),

    udr.completed_at,

    dv.published_at,

    d.created_at

  FROM workforce.documents d

  JOIN workforce.document_versions dv
    ON dv.document_id = d.id
   AND dv.version_number = d.current_version
   AND dv.render_status = 'published'

  LEFT JOIN workforce.document_categories dc
    ON dc.id = d.category_id

  LEFT JOIN workforce.user_document_reads udr
    ON udr.document_version_id = dv.id
   AND udr.user_id = v_user_id

  WHERE d.is_active = true

    AND workforce.can_view_document(d.id)

    AND (
      p_category_id IS NULL
      OR d.category_id = p_category_id
    )

    AND (
      p_requires_acknowledgement IS NULL
      OR d.requires_acknowledgement =
        p_requires_acknowledgement
    )

  ORDER BY
    dv.published_at DESC NULLS LAST,
    d.created_at DESC,
    d.title ASC

  LIMIT p_limit
  OFFSET p_offset;
END;
$$;


-- ============================================================
-- 3. ACCESSIBLE RESOURCES
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.list_accessible_resources(
  p_category_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  resource_id uuid,
  title text,
  description text,
  category_id uuid,
  category_name text,
  url text,
  external boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
BEGIN
  IF workforce.my_user_id() IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  IF p_limit IS NULL
     OR p_limit < 1
     OR p_limit > 500 THEN
    RAISE EXCEPTION
      'Limit must be between 1 and 500';
  END IF;

  IF p_offset IS NULL
     OR p_offset < 0 THEN
    RAISE EXCEPTION
      'Offset cannot be negative';
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    r.title,
    r.description,
    r.category_id,
    rc.name,
    r.url,
    r.external,
    r.created_at

  FROM workforce.resources r

  LEFT JOIN workforce.resource_categories rc
    ON rc.id = r.category_id

  WHERE r.is_active = true

    AND workforce.can_view_resource(r.id)

    AND (
      p_category_id IS NULL
      OR r.category_id = p_category_id
    )

  ORDER BY
    r.created_at DESC,
    r.title ASC

  LIMIT p_limit
  OFFSET p_offset;
END;
$$;


-- ============================================================
-- 4. PENDING ACKNOWLEDGEMENTS
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.my_pending_acknowledgements()
RETURNS TABLE (
  document_id uuid,
  document_version_id uuid,
  title text,
  version_number integer,
  published_at timestamptz,
  progress_percent numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := workforce.my_user_id();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  RETURN QUERY
  SELECT
    d.id,
    dv.id,
    d.title,
    dv.version_number,
    dv.published_at,
    COALESCE(udr.progress_percent, 0::numeric)

  FROM workforce.documents d

  JOIN workforce.document_versions dv
    ON dv.document_id = d.id
   AND dv.version_number = d.current_version
   AND dv.render_status = 'published'

  LEFT JOIN workforce.user_document_reads udr
    ON udr.document_version_id = dv.id
   AND udr.user_id = v_user_id

  WHERE d.is_active = true

    AND d.requires_acknowledgement = true

    AND workforce.can_view_document(d.id)

    AND NOT EXISTS (
      SELECT 1
      FROM workforce.document_acknowledgements da
      WHERE da.document_version_id = dv.id
        AND da.user_id = v_user_id
    )

  ORDER BY
    dv.published_at DESC NULLS LAST,
    d.title ASC;
END;
$$;


-- ============================================================
-- 5. ACKNOWLEDGE CURRENT VERSION
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.acknowledge_document_version(
  p_document_version_id uuid,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_user_id uuid;
  v_acknowledgement_id uuid;
BEGIN
  v_user_id := workforce.my_user_id();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  IF p_document_version_id IS NULL THEN
    RAISE EXCEPTION
      'Document version ID is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM workforce.document_versions dv
    JOIN workforce.documents d
      ON d.id = dv.document_id
    WHERE dv.id = p_document_version_id
      AND d.is_active = true
      AND d.requires_acknowledgement = true
      AND dv.version_number = d.current_version
      AND dv.render_status = 'published'
      AND workforce.can_view_document(d.id)
  ) THEN
    RAISE EXCEPTION
      'Accessible current version requiring acknowledgement not found';
  END IF;

  INSERT INTO workforce.document_acknowledgements (
    document_version_id,
    user_id,
    acknowledged_at,
    note
  )
  VALUES (
    p_document_version_id,
    v_user_id,
    now(),
    NULLIF(btrim(p_note), '')
  )
  ON CONFLICT (
    document_version_id,
    user_id
  )
  DO NOTHING
  RETURNING id
  INTO v_acknowledgement_id;

  IF v_acknowledgement_id IS NULL THEN
    SELECT da.id
    INTO v_acknowledgement_id
    FROM workforce.document_acknowledgements da
    WHERE da.document_version_id =
      p_document_version_id
      AND da.user_id = v_user_id;
  END IF;

  RETURN v_acknowledgement_id;
END;
$$;


-- ============================================================
-- 6. NOTIFICATION FEED
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.my_notifications(
  p_unread_only boolean DEFAULT false,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  notification_id uuid,
  notification_type text,
  title text,
  message text,
  actor_user_id uuid,
  entity_type text,
  entity_id uuid,
  target_path text,
  metadata jsonb,
  read_at timestamptz,
  created_at timestamptz,
  expires_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := workforce.my_user_id();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  IF p_limit IS NULL
     OR p_limit < 1
     OR p_limit > 200 THEN
    RAISE EXCEPTION
      'Limit must be between 1 and 200';
  END IF;

  IF p_offset IS NULL
     OR p_offset < 0 THEN
    RAISE EXCEPTION
      'Offset cannot be negative';
  END IF;

  RETURN QUERY
  SELECT
    n.id,
    n.notification_type,
    n.title,
    n.message,
    n.actor_user_id,
    n.entity_type,
    n.entity_id,
    n.target_path,
    n.metadata,
    nr.read_at,
    n.created_at,
    n.expires_at

  FROM workforce.notification_recipients nr

  JOIN workforce.notifications n
    ON n.id = nr.notification_id

  WHERE nr.recipient_user_id = v_user_id

    AND (
      COALESCE(p_unread_only, false) = false
      OR nr.read_at IS NULL
    )

    AND (
      n.expires_at IS NULL
      OR n.expires_at > now()
    )

  ORDER BY n.created_at DESC

  LIMIT p_limit
  OFFSET p_offset;
END;
$$;


-- ============================================================
-- 7. ATTENDANCE DATE RANGE PRESETS
--
-- Supported:
--   from_joining_date
--   this_week
--   this_month
--   last_month
--   quarter
--   year
--   custom
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.resolve_attendance_range(
  p_user_id uuid,
  p_preset text,
  p_custom_from date DEFAULT NULL,
  p_custom_to date DEFAULT NULL
)
RETURNS TABLE (
  date_from date,
  date_to date
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_joined_at date;
  v_today date := CURRENT_DATE;
  v_preset text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID is required';
  END IF;

  IF NOT workforce.can_view_attendance_for(p_user_id) THEN
    RAISE EXCEPTION
      'Not authorized to resolve this attendance range';
  END IF;

  SELECT gu.joined_at
  INTO v_joined_at
  FROM global.users gu
  WHERE gu.id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Global user not found';
  END IF;

  IF v_joined_at IS NULL THEN
    RAISE EXCEPTION
      'Joining date is not configured';
  END IF;

  v_preset := lower(btrim(COALESCE(
    p_preset,
    'from_joining_date'
  )));

  CASE v_preset
    WHEN 'from_joining_date' THEN
      date_from := v_joined_at;
      date_to := v_today;

    WHEN 'this_week' THEN
      date_from :=
        date_trunc('week', v_today::timestamp)::date;
      date_to := v_today;

    WHEN 'this_month' THEN
      date_from :=
        date_trunc('month', v_today::timestamp)::date;
      date_to := v_today;

    WHEN 'last_month' THEN
      date_from :=
        (
          date_trunc('month', v_today::timestamp)
          - interval '1 month'
        )::date;

      date_to :=
        (
          date_trunc('month', v_today::timestamp)
          - interval '1 day'
        )::date;

    WHEN 'quarter' THEN
      date_from :=
        date_trunc('quarter', v_today::timestamp)::date;
      date_to := v_today;

    WHEN 'year' THEN
      date_from :=
        date_trunc('year', v_today::timestamp)::date;
      date_to := v_today;

    WHEN 'custom' THEN
      IF p_custom_from IS NULL
         OR p_custom_to IS NULL THEN
        RAISE EXCEPTION
          'Custom range requires both dates';
      END IF;

      IF p_custom_from > p_custom_to THEN
        RAISE EXCEPTION
          'Custom date-from cannot be after date-to';
      END IF;

      date_from := p_custom_from;
      date_to := p_custom_to;

    ELSE
      RAISE EXCEPTION
        'Invalid attendance preset: %',
        p_preset;
  END CASE;

  IF date_from < v_joined_at THEN
    date_from := v_joined_at;
  END IF;

  IF date_to > v_today THEN
    date_to := v_today;
  END IF;

  IF date_from > date_to THEN
    date_from := date_to;
  END IF;

  RETURN NEXT;
END;
$$;


-- ============================================================
-- 8. ATTENDANCE CALENDAR BY PRESET
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.get_attendance_calendar_by_preset(
  p_user_id uuid,
  p_preset text DEFAULT 'from_joining_date',
  p_custom_from date DEFAULT NULL,
  p_custom_to date DEFAULT NULL
)
RETURNS TABLE (
  calendar_date date,
  attendance_status text,
  is_sunday boolean,
  is_holiday boolean,
  holiday_name text,
  attendance_id uuid,
  source_type text,
  source_entity_id uuid,
  note text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_date_from date;
  v_date_to date;
BEGIN
  SELECT
    r.date_from,
    r.date_to
  INTO
    v_date_from,
    v_date_to
  FROM workforce.resolve_attendance_range(
    p_user_id,
    p_preset,
    p_custom_from,
    p_custom_to
  ) r;

  RETURN QUERY
  SELECT
    c.calendar_date,
    c.attendance_status,
    c.is_sunday,
    c.is_holiday,
    c.holiday_name,
    c.attendance_id,
    c.source_type,
    c.source_entity_id,
    c.note
  FROM workforce.get_attendance_calendar(
    p_user_id,
    v_date_from,
    v_date_to
  ) c;
END;
$$;


-- ============================================================
-- 9. DIRECT REPORTS
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.my_direct_reports()
RETURNS TABLE (
  user_id uuid,
  employee_code varchar,
  full_name varchar,
  email varchar,
  department_id uuid,
  designation_id uuid,
  role_id uuid,
  role_name varchar,
  joined_at date,
  user_status varchar
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_manager_user_id uuid;
BEGIN
  v_manager_user_id := workforce.my_user_id();

  IF v_manager_user_id IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  IF workforce.is_creator() THEN
    RAISE EXCEPTION
      'Creators cannot view internal employee records';
  END IF;

  RETURN QUERY
  SELECT
    gu.id,
    gu.employee_code,
    gu.full_name,
    gu.email,
    gu.department_id,
    gu.designation_id,
    gu.role_id,
    gr.name,
    gu.joined_at,
    gu.status

  FROM global.users gu

  JOIN global.roles gr
    ON gr.id = gu.role_id

  WHERE gu.manager_user_id = v_manager_user_id

  ORDER BY gu.full_name ASC;
END;
$$;


-- ============================================================
-- 10. ORGANIZATION ATTENDANCE MATRIX
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.get_attendance_matrix(
  p_date_from date,
  p_date_to date,
  p_department_id uuid DEFAULT NULL
)
RETURNS TABLE (
  user_id uuid,
  employee_code varchar,
  full_name varchar,
  department_id uuid,
  role_name varchar,
  joined_at date,
  calendar_date date,
  attendance_status text,
  is_sunday boolean,
  is_holiday boolean,
  holiday_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
BEGIN
  IF NOT workforce.can_manage_attendance() THEN
    RAISE EXCEPTION
      'Only HR or Co-Founder can view the attendance matrix';
  END IF;

  IF p_date_from IS NULL
     OR p_date_to IS NULL THEN
    RAISE EXCEPTION
      'Date range is required';
  END IF;

  IF p_date_from > p_date_to THEN
    RAISE EXCEPTION
      'Date-from cannot be after date-to';
  END IF;

  RETURN QUERY
  SELECT
    gu.id,
    gu.employee_code,
    gu.full_name,
    gu.department_id,
    gr.name,
    gu.joined_at,
    gs.calendar_date,

    CASE
      WHEN workforce.is_sunday(gs.calendar_date)
        THEN NULL

      WHEN hh.id IS NOT NULL
        THEN NULL

      ELSE COALESCE(ha.status, 'unmarked')
    END,

    workforce.is_sunday(gs.calendar_date),

    hh.id IS NOT NULL,

    hh.name

  FROM global.users gu

  JOIN global.roles gr
    ON gr.id = gu.role_id

  CROSS JOIN LATERAL (
    SELECT generated_date::date AS calendar_date
    FROM generate_series(
      p_date_from::timestamp,
      p_date_to::timestamp,
      interval '1 day'
    ) generated_date
  ) gs

  LEFT JOIN workforce.hr_holidays hh
    ON hh.holiday_date = gs.calendar_date

  LEFT JOIN workforce.hr_attendance ha
    ON ha.user_id = gu.id
   AND ha.attendance_date = gs.calendar_date

  WHERE lower(gu.status::text) = 'active'

    AND lower(gr.name::text) <> 'creator'

    AND gu.joined_at IS NOT NULL

    AND gs.calendar_date >= gu.joined_at

    AND (
      p_department_id IS NULL
      OR gu.department_id = p_department_id
    )

  ORDER BY
    gu.full_name ASC,
    gs.calendar_date ASC;
END;
$$;


-- ============================================================
-- 11. PROBATION DASHBOARD
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.list_probation_dashboard(
  p_status text DEFAULT NULL,
  p_review_from date DEFAULT NULL,
  p_review_to date DEFAULT NULL
)
RETURNS TABLE (
  probation_id uuid,
  user_id uuid,
  employee_code varchar,
  full_name varchar,
  role_name varchar,
  start_date date,
  end_date date,
  review_date date,
  probation_status text,
  recommendation text,
  final_decision text,
  days_until_review integer,
  previous_probation_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
BEGIN
  IF NOT workforce.can_manage_probation() THEN
    RAISE EXCEPTION
      'Not authorized to view the probation dashboard';
  END IF;

  IF p_review_from IS NOT NULL
     AND p_review_to IS NOT NULL
     AND p_review_from > p_review_to THEN
    RAISE EXCEPTION
      'Review date-from cannot be after date-to';
  END IF;

  RETURN QUERY
  SELECT
    hp.id,
    hp.user_id,
    gu.employee_code,
    gu.full_name,
    gr.name,
    hp.start_date,
    hp.end_date,
    hp.review_date,
    hp.status,
    hp.recommendation,
    hp.final_decision,
    hp.review_date - CURRENT_DATE,
    hp.previous_probation_id

  FROM workforce.hr_probation hp

  JOIN global.users gu
    ON gu.id = hp.user_id

  JOIN global.roles gr
    ON gr.id = gu.role_id

  WHERE (
      p_status IS NULL
      OR hp.status = p_status
    )

    AND (
      p_review_from IS NULL
      OR hp.review_date >= p_review_from
    )

    AND (
      p_review_to IS NULL
      OR hp.review_date <= p_review_to
    )

  ORDER BY
    hp.review_date ASC,
    gu.full_name ASC;
END;
$$;


-- ============================================================
-- 12. DEBOARDING DASHBOARD
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.list_deboarding_dashboard(
  p_status text DEFAULT NULL,
  p_deboarding_type text DEFAULT NULL
)
RETURNS TABLE (
  deboarding_id uuid,
  user_id uuid,
  employee_code varchar,
  full_name varchar,
  role_name varchar,
  deboarding_type text,
  deboarding_status text,
  reason text,
  initiated_by uuid,
  initiated_at timestamptz,
  approved_at timestamptz,
  completed_at timestamptz,
  completed_required_items bigint,
  total_required_items bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
BEGIN
  IF NOT workforce.can_view_deboarding() THEN
    RAISE EXCEPTION
      'Not authorized to view the deboarding dashboard';
  END IF;

  IF p_deboarding_type IS NOT NULL
     AND p_deboarding_type NOT IN (
       'employee',
       'creator'
     ) THEN
    RAISE EXCEPTION
      'Invalid deboarding type';
  END IF;

  RETURN QUERY
  SELECT
    hd.id,
    hd.user_id,
    gu.employee_code,
    gu.full_name,
    gr.name,
    hd.deboarding_type,
    hd.status,
    hd.reason,
    hd.initiated_by,
    hd.initiated_at,
    hd.approved_at,
    hd.completed_at,

    COUNT(ci.id) FILTER (
      WHERE ci.is_required = true
        AND ci.is_completed = true
    ),

    COUNT(ci.id) FILTER (
      WHERE ci.is_required = true
    )

  FROM workforce.hr_deboarding hd

  JOIN global.users gu
    ON gu.id = hd.user_id

  JOIN global.roles gr
    ON gr.id = gu.role_id

  LEFT JOIN workforce.hr_deboarding_checklist_items ci
    ON ci.deboarding_id = hd.id

  WHERE (
      p_status IS NULL
      OR hd.status = p_status
    )

    AND (
      p_deboarding_type IS NULL
      OR hd.deboarding_type = p_deboarding_type
    )

  GROUP BY
    hd.id,
    hd.user_id,
    gu.employee_code,
    gu.full_name,
    gr.name,
    hd.deboarding_type,
    hd.status,
    hd.reason,
    hd.initiated_by,
    hd.initiated_at,
    hd.approved_at,
    hd.completed_at,
    hd.created_at

  ORDER BY hd.created_at DESC;
END;
$$;


-- ============================================================
-- 13. FINAL WORKFORCE INTEGRITY AUDIT
--
-- Healthy result:
--   zero rows
--
-- Restricted to service_role.
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.audit_workforce_integrity()
RETURNS TABLE (
  issue_type text,
  object_name text,
  issue_count bigint,
  details text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$

-- ------------------------------------------------------------
-- Workforce foreign keys pointing to public/Finance.
-- ------------------------------------------------------------

SELECT
  'public_foreign_key'::text,
  c.conrelid::regclass::text,
  COUNT(*)::bigint,
  string_agg(
    c.conname ||
    ' -> ' ||
    c.confrelid::regclass::text,
    ', '
  )::text

FROM pg_constraint c

JOIN pg_namespace constraint_namespace
  ON constraint_namespace.oid = c.connamespace

JOIN pg_class referenced_class
  ON referenced_class.oid = c.confrelid

JOIN pg_namespace referenced_namespace
  ON referenced_namespace.oid =
    referenced_class.relnamespace

WHERE constraint_namespace.nspname = 'workforce'
  AND c.contype = 'f'
  AND referenced_namespace.nspname = 'public'

GROUP BY c.conrelid::regclass::text


UNION ALL


-- ------------------------------------------------------------
-- Attendance before joining date.
-- ------------------------------------------------------------

SELECT
  'attendance_before_joining_date'::text,
  'workforce.hr_attendance'::text,
  COUNT(*)::bigint,
  'Attendance rows exist before global.users.joined_at'::text

FROM workforce.hr_attendance ha

JOIN global.users gu
  ON gu.id = ha.user_id

WHERE gu.joined_at IS NULL
   OR ha.attendance_date < gu.joined_at

HAVING COUNT(*) > 0


UNION ALL


-- ------------------------------------------------------------
-- Attendance on Sundays or stored HR holidays.
-- ------------------------------------------------------------

SELECT
  'attendance_on_non_working_day'::text,
  'workforce.hr_attendance'::text,
  COUNT(*)::bigint,
  'Attendance rows exist on Sundays or HR holidays'::text

FROM workforce.hr_attendance ha

WHERE workforce.is_non_working_day(
  ha.attendance_date
)

HAVING COUNT(*) > 0


UNION ALL


-- ------------------------------------------------------------
-- Creator attendance.
-- ------------------------------------------------------------

SELECT
  'creator_attendance'::text,
  'workforce.hr_attendance'::text,
  COUNT(*)::bigint,
  'Creator users have attendance records'::text

FROM workforce.hr_attendance ha

JOIN global.users gu
  ON gu.id = ha.user_id

JOIN global.roles gr
  ON gr.id = gu.role_id

WHERE lower(gr.name::text) = 'creator'

HAVING COUNT(*) > 0


UNION ALL


-- ------------------------------------------------------------
-- Creator Leave/WFH requests.
-- ------------------------------------------------------------

SELECT
  'creator_leave_request'::text,
  'workforce.hr_leave_requests'::text,
  COUNT(*)::bigint,
  'Creator users have Leave/WFH requests'::text

FROM workforce.hr_leave_requests lr

JOIN global.users gu
  ON gu.id = lr.requester_user_id

JOIN global.roles gr
  ON gr.id = gu.role_id

WHERE lower(gr.name::text) = 'creator'

HAVING COUNT(*) > 0


UNION ALL


-- ------------------------------------------------------------
-- Multiple open probation records.
-- ------------------------------------------------------------

SELECT
  'multiple_open_probation'::text,
  'workforce.hr_probation'::text,
  COUNT(*)::bigint,
  'Users have more than one open probation record'::text

FROM (
  SELECT hp.user_id
  FROM workforce.hr_probation hp
  WHERE hp.status IN (
    'active',
    'review_due',
    'recommendation_submitted'
  )
  GROUP BY hp.user_id
  HAVING COUNT(*) > 1
) duplicate_probation

HAVING COUNT(*) > 0


UNION ALL


-- ------------------------------------------------------------
-- Multiple open deboarding workflows.
-- ------------------------------------------------------------

SELECT
  'multiple_open_deboarding'::text,
  'workforce.hr_deboarding'::text,
  COUNT(*)::bigint,
  'Users have more than one open deboarding workflow'::text

FROM (
  SELECT hd.user_id
  FROM workforce.hr_deboarding hd
  WHERE hd.status IN (
    'draft',
    'pending_approval',
    'approved',
    'checklist_in_progress'
  )
  GROUP BY hd.user_id
  HAVING COUNT(*) > 1
) duplicate_deboarding

HAVING COUNT(*) > 0


UNION ALL


-- ------------------------------------------------------------
-- Document current_version does not resolve.
-- ------------------------------------------------------------

SELECT
  'missing_current_document_version'::text,
  'workforce.documents'::text,
  COUNT(*)::bigint,
  'documents.current_version does not resolve to document_versions'::text

FROM workforce.documents d

WHERE NOT EXISTS (
  SELECT 1
  FROM workforce.document_versions dv
  WHERE dv.document_id = d.id
    AND dv.version_number = d.current_version
)

HAVING COUNT(*) > 0


UNION ALL


-- ------------------------------------------------------------
-- Published versions missing required publication metadata.
-- ------------------------------------------------------------

SELECT
  'invalid_published_version'::text,
  'workforce.document_versions'::text,
  COUNT(*)::bigint,
  'Published versions have incomplete render/review/publication metadata'::text

FROM workforce.document_versions dv

WHERE dv.render_status = 'published'
  AND (
    dv.rendered_content IS NULL
    OR dv.rendered_at IS NULL
    OR dv.reviewed_by IS NULL
    OR dv.reviewed_at IS NULL
    OR dv.published_by IS NULL
    OR dv.published_at IS NULL
  )

HAVING COUNT(*) > 0


UNION ALL


-- ------------------------------------------------------------
-- Archived documents with inconsistent archive metadata.
-- ------------------------------------------------------------

SELECT
  'invalid_document_archive_state'::text,
  'workforce.documents'::text,
  COUNT(*)::bigint,
  'Document archive fields are inconsistent with is_active'::text

FROM workforce.documents d

WHERE (
    d.is_active = true
    AND (
      d.archived_at IS NOT NULL
      OR d.archived_by IS NOT NULL
    )
  )
  OR (
    d.is_active = false
    AND (
      d.archived_at IS NULL
      OR d.archived_by IS NULL
    )
  )

HAVING COUNT(*) > 0


UNION ALL


-- ------------------------------------------------------------
-- Archived resources with inconsistent archive metadata.
-- ------------------------------------------------------------

SELECT
  'invalid_resource_archive_state'::text,
  'workforce.resources'::text,
  COUNT(*)::bigint,
  'Resource archive fields are inconsistent with is_active'::text

FROM workforce.resources r

WHERE (
    r.is_active = true
    AND (
      r.archived_at IS NOT NULL
      OR r.archived_by IS NOT NULL
    )
  )
  OR (
    r.is_active = false
    AND (
      r.archived_at IS NULL
      OR r.archived_by IS NULL
    )
  )

HAVING COUNT(*) > 0


UNION ALL


-- ------------------------------------------------------------
-- Acknowledgements for non-current versions.
-- Historical acknowledgements may exist legitimately after a
-- new version is published, so this checks only future/invalid
-- version numbers greater than documents.current_version.
-- ------------------------------------------------------------

SELECT
  'acknowledgement_future_version'::text,
  'workforce.document_acknowledgements'::text,
  COUNT(*)::bigint,
  'Acknowledgements reference versions beyond documents.current_version'::text

FROM workforce.document_acknowledgements da

JOIN workforce.document_versions dv
  ON dv.id = da.document_version_id

JOIN workforce.documents d
  ON d.id = dv.document_id

WHERE dv.version_number > d.current_version

HAVING COUNT(*) > 0;

$$;


-- ============================================================
-- 14. FUNCTION SECURITY
-- ============================================================

REVOKE ALL
ON FUNCTION workforce.list_accessible_documents(
  uuid,
  boolean,
  integer,
  integer
)
FROM PUBLIC;


REVOKE ALL
ON FUNCTION workforce.list_accessible_resources(
  uuid,
  integer,
  integer
)
FROM PUBLIC;


REVOKE ALL
ON FUNCTION workforce.my_pending_acknowledgements()
FROM PUBLIC;


REVOKE ALL
ON FUNCTION workforce.acknowledge_document_version(
  uuid,
  text
)
FROM PUBLIC;


REVOKE ALL
ON FUNCTION workforce.my_notifications(
  boolean,
  integer,
  integer
)
FROM PUBLIC;


REVOKE ALL
ON FUNCTION workforce.resolve_attendance_range(
  uuid,
  text,
  date,
  date
)
FROM PUBLIC;


REVOKE ALL
ON FUNCTION workforce.get_attendance_calendar_by_preset(
  uuid,
  text,
  date,
  date
)
FROM PUBLIC;


REVOKE ALL
ON FUNCTION workforce.my_direct_reports()
FROM PUBLIC;


REVOKE ALL
ON FUNCTION workforce.get_attendance_matrix(
  date,
  date,
  uuid
)
FROM PUBLIC;


REVOKE ALL
ON FUNCTION workforce.list_probation_dashboard(
  text,
  date,
  date
)
FROM PUBLIC;


REVOKE ALL
ON FUNCTION workforce.list_deboarding_dashboard(
  text,
  text
)
FROM PUBLIC;


REVOKE ALL
ON FUNCTION workforce.audit_workforce_integrity()
FROM PUBLIC;


-- ============================================================
-- 15. AUTHENTICATED EXECUTE GRANTS
-- ============================================================

GRANT EXECUTE
ON FUNCTION workforce.list_accessible_documents(
  uuid,
  boolean,
  integer,
  integer
)
TO authenticated, service_role;


GRANT EXECUTE
ON FUNCTION workforce.list_accessible_resources(
  uuid,
  integer,
  integer
)
TO authenticated, service_role;


GRANT EXECUTE
ON FUNCTION workforce.my_pending_acknowledgements()
TO authenticated, service_role;


GRANT EXECUTE
ON FUNCTION workforce.acknowledge_document_version(
  uuid,
  text
)
TO authenticated, service_role;


GRANT EXECUTE
ON FUNCTION workforce.my_notifications(
  boolean,
  integer,
  integer
)
TO authenticated, service_role;


GRANT EXECUTE
ON FUNCTION workforce.resolve_attendance_range(
  uuid,
  text,
  date,
  date
)
TO authenticated, service_role;


GRANT EXECUTE
ON FUNCTION workforce.get_attendance_calendar_by_preset(
  uuid,
  text,
  date,
  date
)
TO authenticated, service_role;


GRANT EXECUTE
ON FUNCTION workforce.my_direct_reports()
TO authenticated, service_role;


GRANT EXECUTE
ON FUNCTION workforce.get_attendance_matrix(
  date,
  date,
  uuid
)
TO authenticated, service_role;


GRANT EXECUTE
ON FUNCTION workforce.list_probation_dashboard(
  text,
  date,
  date
)
TO authenticated, service_role;


GRANT EXECUTE
ON FUNCTION workforce.list_deboarding_dashboard(
  text,
  text
)
TO authenticated, service_role;


-- Integrity audit is intentionally restricted to service_role.

GRANT EXECUTE
ON FUNCTION workforce.audit_workforce_integrity()
TO service_role;


COMMIT;
