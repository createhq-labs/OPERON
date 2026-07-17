BEGIN;

-- ============================================================
-- 003.1_WORKFORCE_ATTENDANCE.SQL
--
-- Adds:
--   workforce.hr_holidays
--   workforce.hr_attendance
--   workforce.hr_attendance_audit
--
-- Rules:
--   public.* is untouched
--   global.* is read/reference only
--   joining date source = global.users.joined_at
--   Sundays are automatic holidays
--   HR holidays do not create attendance rows
--   Creators cannot access attendance
--   Employees/interns see their own attendance
--   Direct managers see direct reports
--   HR/Co-Founder see organization-wide attendance
--   Attendance cannot exist before joining date
--   Every attendance change is audited
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

  IF to_regprocedure('workforce.my_user_id()') IS NULL THEN
    RAISE EXCEPTION
      'workforce.my_user_id() is missing. Run migration 001 first.';
  END IF;

  IF to_regprocedure('workforce.is_admin()') IS NULL THEN
    RAISE EXCEPTION
      'workforce.is_admin() is missing. Run migration 001 first.';
  END IF;

  IF to_regprocedure('workforce.is_hr()') IS NULL THEN
    RAISE EXCEPTION
      'workforce.is_hr() is missing. Run migration 001 first.';
  END IF;

  IF to_regprocedure('workforce.is_creator()') IS NULL THEN
    RAISE EXCEPTION
      'workforce.is_creator() is missing. Run migration 001 first.';
  END IF;

  IF to_regprocedure(
    'workforce.is_direct_manager_of(uuid)'
  ) IS NULL THEN
    RAISE EXCEPTION
      'workforce.is_direct_manager_of(uuid) is missing.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'global'
      AND table_name = 'users'
      AND column_name = 'joined_at'
  ) THEN
    RAISE EXCEPTION 'global.users.joined_at does not exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'global'
      AND table_name = 'users'
      AND column_name = 'manager_user_id'
  ) THEN
    RAISE EXCEPTION
      'global.users.manager_user_id does not exist';
  END IF;
END;
$$;


-- ============================================================
-- 2. ATTENDANCE AUTHORIZATION HELPERS
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.can_manage_attendance()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
SELECT
  workforce.is_admin()
  OR workforce.is_hr();
$$;


CREATE OR REPLACE FUNCTION workforce.can_view_attendance_for(
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
SELECT
  NOT workforce.is_creator()
  AND (
    p_user_id = workforce.my_user_id()
    OR workforce.is_direct_manager_of(p_user_id)
    OR workforce.can_manage_attendance()
  );
$$;


CREATE OR REPLACE FUNCTION workforce.is_employee_or_intern()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
SELECT COALESCE(
  workforce.my_role_name() IN (
    'im associate',
    'im executive',
    'finance associate',
    'finance manager',
    'sales executive',
    'intern',
    'category lead',
    'im team lead',
    'creator acquisition',
    'hr executive',
    'hr manager'
  ),
  false
);
$$;


-- ============================================================
-- 3. HOLIDAYS
-- ============================================================

CREATE TABLE workforce.hr_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  holiday_date date NOT NULL UNIQUE,

  name text NOT NULL
    CHECK (btrim(name) <> ''),

  description text,

  created_by uuid NOT NULL
    REFERENCES global.users(id)
    ON DELETE RESTRICT,

  created_at timestamptz NOT NULL DEFAULT now()
);


CREATE INDEX idx_hr_holidays_date
ON workforce.hr_holidays(holiday_date);


CREATE INDEX idx_hr_holidays_created_by
ON workforce.hr_holidays(created_by, created_at DESC);


-- ============================================================
-- 4. ATTENDANCE
-- ============================================================

CREATE TABLE workforce.hr_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id uuid NOT NULL
    REFERENCES global.users(id)
    ON DELETE CASCADE,

  attendance_date date NOT NULL,

  status text NOT NULL,

  source_type text NOT NULL DEFAULT 'manual',

  source_entity_id uuid,

  note text,

  created_by uuid NOT NULL
    REFERENCES global.users(id)
    ON DELETE RESTRICT,

  updated_by uuid
    REFERENCES global.users(id)
    ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hr_attendance_status_check
  CHECK (
    status IN (
      'present',
      'wfh',
      'leave',
      'unmarked'
    )
  ),

  CONSTRAINT hr_attendance_source_type_check
  CHECK (
    source_type IN (
      'manual',
      'leave_request',
      'wfh_request',
      'system'
    )
  ),

  UNIQUE (user_id, attendance_date)
);


CREATE INDEX idx_hr_attendance_date
ON workforce.hr_attendance(attendance_date);


CREATE INDEX idx_hr_attendance_user_date
ON workforce.hr_attendance(user_id, attendance_date DESC);


CREATE INDEX idx_hr_attendance_status_date
ON workforce.hr_attendance(status, attendance_date);


CREATE INDEX idx_hr_attendance_source
ON workforce.hr_attendance(source_type, source_entity_id)
WHERE source_entity_id IS NOT NULL;


CREATE TRIGGER trg_hr_attendance_updated_at
BEFORE UPDATE
ON workforce.hr_attendance
FOR EACH ROW
EXECUTE FUNCTION workforce.set_updated_at();


-- ============================================================
-- 5. ATTENDANCE AUDIT
-- ============================================================

CREATE TABLE workforce.hr_attendance_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  attendance_id uuid NOT NULL
    REFERENCES workforce.hr_attendance(id)
    ON DELETE RESTRICT,

  user_id uuid NOT NULL
    REFERENCES global.users(id)
    ON DELETE RESTRICT,

  attendance_date date NOT NULL,

  old_status text,

  new_status text NOT NULL,

  old_source_type text,
  new_source_type text NOT NULL,

  old_source_entity_id uuid,
  new_source_entity_id uuid,

  old_note text,
  new_note text,

  changed_by uuid NOT NULL
    REFERENCES global.users(id)
    ON DELETE RESTRICT,

  changed_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hr_attendance_audit_old_status_check
  CHECK (
    old_status IS NULL
    OR old_status IN (
      'present',
      'wfh',
      'leave',
      'unmarked'
    )
  ),

  CONSTRAINT hr_attendance_audit_new_status_check
  CHECK (
    new_status IN (
      'present',
      'wfh',
      'leave',
      'unmarked'
    )
  )
);


CREATE INDEX idx_hr_attendance_audit_attendance
ON workforce.hr_attendance_audit(
  attendance_id,
  changed_at DESC
);


CREATE INDEX idx_hr_attendance_audit_user
ON workforce.hr_attendance_audit(
  user_id,
  attendance_date DESC,
  changed_at DESC
);


CREATE INDEX idx_hr_attendance_audit_changed_by
ON workforce.hr_attendance_audit(
  changed_by,
  changed_at DESC
);


-- ============================================================
-- 6. NON-WORKING DAY HELPERS
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.is_sunday(
  p_date date
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
SELECT EXTRACT(ISODOW FROM p_date) = 7;
$$;


CREATE OR REPLACE FUNCTION workforce.is_hr_holiday(
  p_date date
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, workforce
AS $$
SELECT EXISTS (
  SELECT 1
  FROM workforce.hr_holidays hh
  WHERE hh.holiday_date = p_date
);
$$;


CREATE OR REPLACE FUNCTION workforce.is_non_working_day(
  p_date date
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, workforce
AS $$
SELECT
  workforce.is_sunday(p_date)
  OR workforce.is_hr_holiday(p_date);
$$;


-- ============================================================
-- 7. ATTENDANCE VALIDATION TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.validate_attendance_record()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_joined_at date;
  v_role_name text;
BEGIN
  SELECT
    gu.joined_at,
    lower(gr.name::text)
  INTO
    v_joined_at,
    v_role_name
  FROM global.users gu
  JOIN global.roles gr
    ON gr.id = gu.role_id
  WHERE gu.id = NEW.user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attendance user does not exist';
  END IF;

  IF v_role_name = 'creator' THEN
    RAISE EXCEPTION
      'Creators cannot have attendance records';
  END IF;

  IF v_joined_at IS NULL THEN
    RAISE EXCEPTION
      'Joining date must be set before attendance can exist';
  END IF;

  IF NEW.attendance_date < v_joined_at THEN
    RAISE EXCEPTION
      'Attendance cannot exist before joining date %',
      v_joined_at;
  END IF;

  IF workforce.is_sunday(NEW.attendance_date) THEN
    RAISE EXCEPTION
      'Attendance cannot be created or changed on Sundays';
  END IF;

  IF workforce.is_hr_holiday(NEW.attendance_date) THEN
    RAISE EXCEPTION
      'Attendance cannot be created or changed on an HR holiday';
  END IF;

  IF NEW.created_by IS NULL THEN
    NEW.created_by := workforce.my_user_id();
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION
        'Attendance user cannot be changed';
    END IF;

    IF NEW.attendance_date IS DISTINCT FROM OLD.attendance_date THEN
      RAISE EXCEPTION
        'Attendance date cannot be changed';
    END IF;

    IF NEW.updated_by IS NULL THEN
      NEW.updated_by := workforce.my_user_id();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


CREATE TRIGGER trg_hr_attendance_validate
BEFORE INSERT OR UPDATE
ON workforce.hr_attendance
FOR EACH ROW
EXECUTE FUNCTION workforce.validate_attendance_record();


-- ============================================================
-- 8. ATTENDANCE AUDIT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.audit_attendance_record()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_actor_user_id uuid;
BEGIN
  v_actor_user_id := COALESCE(
    NEW.updated_by,
    NEW.created_by,
    workforce.my_user_id()
  );

  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION
      'Unable to resolve attendance audit actor';
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO workforce.hr_attendance_audit (
      attendance_id,
      user_id,
      attendance_date,
      old_status,
      new_status,
      old_source_type,
      new_source_type,
      old_source_entity_id,
      new_source_entity_id,
      old_note,
      new_note,
      changed_by
    )
    VALUES (
      NEW.id,
      NEW.user_id,
      NEW.attendance_date,
      NULL,
      NEW.status,
      NULL,
      NEW.source_type,
      NULL,
      NEW.source_entity_id,
      NULL,
      NEW.note,
      v_actor_user_id
    );

  ELSIF
    OLD.status IS DISTINCT FROM NEW.status
    OR OLD.source_type IS DISTINCT FROM NEW.source_type
    OR OLD.source_entity_id IS DISTINCT FROM NEW.source_entity_id
    OR OLD.note IS DISTINCT FROM NEW.note
  THEN
    INSERT INTO workforce.hr_attendance_audit (
      attendance_id,
      user_id,
      attendance_date,
      old_status,
      new_status,
      old_source_type,
      new_source_type,
      old_source_entity_id,
      new_source_entity_id,
      old_note,
      new_note,
      changed_by
    )
    VALUES (
      NEW.id,
      NEW.user_id,
      NEW.attendance_date,
      OLD.status,
      NEW.status,
      OLD.source_type,
      NEW.source_type,
      OLD.source_entity_id,
      NEW.source_entity_id,
      OLD.note,
      NEW.note,
      v_actor_user_id
    );
  END IF;

  RETURN NEW;
END;
$$;


CREATE TRIGGER trg_hr_attendance_audit
AFTER INSERT OR UPDATE
ON workforce.hr_attendance
FOR EACH ROW
EXECUTE FUNCTION workforce.audit_attendance_record();


-- ============================================================
-- 9. CONTROLLED HOLIDAY CREATION
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.create_hr_holiday(
  p_holiday_date date,
  p_name text,
  p_description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_actor_user_id uuid;
  v_holiday_id uuid;
BEGIN
  IF NOT workforce.can_manage_attendance() THEN
    RAISE EXCEPTION
      'Not authorized to create holidays';
  END IF;

  v_actor_user_id := workforce.my_user_id();

  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  IF p_holiday_date IS NULL THEN
    RAISE EXCEPTION 'Holiday date is required';
  END IF;

  IF workforce.is_sunday(p_holiday_date) THEN
    RAISE EXCEPTION
      'Sundays are automatic holidays and must not be stored';
  END IF;

  IF p_name IS NULL
     OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Holiday name is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM workforce.hr_attendance ha
    WHERE ha.attendance_date = p_holiday_date
  ) THEN
    RAISE EXCEPTION
      'Holiday cannot be created because attendance already exists for this date';
  END IF;

  INSERT INTO workforce.hr_holidays (
    holiday_date,
    name,
    description,
    created_by
  )
  VALUES (
    p_holiday_date,
    btrim(p_name),
    p_description,
    v_actor_user_id
  )
  RETURNING id
  INTO v_holiday_id;

  RETURN v_holiday_id;
END;
$$;


-- ============================================================
-- 10. CONTROLLED ATTENDANCE UPSERT
--
-- Used by HR/Co-Founder for manual attendance management.
-- Migration 003.2 will add internal Leave/WFH synchronization.
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.set_attendance(
  p_user_id uuid,
  p_attendance_date date,
  p_status text,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_actor_user_id uuid;
  v_attendance_id uuid;
BEGIN
  IF NOT workforce.can_manage_attendance() THEN
    RAISE EXCEPTION
      'Not authorized to manage attendance';
  END IF;

  v_actor_user_id := workforce.my_user_id();

  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Attendance user is required';
  END IF;

  IF p_attendance_date IS NULL THEN
    RAISE EXCEPTION 'Attendance date is required';
  END IF;

  IF p_status NOT IN (
    'present',
    'wfh',
    'leave',
    'unmarked'
  ) THEN
    RAISE EXCEPTION 'Invalid attendance status';
  END IF;

  INSERT INTO workforce.hr_attendance (
    user_id,
    attendance_date,
    status,
    source_type,
    source_entity_id,
    note,
    created_by,
    updated_by
  )
  VALUES (
    p_user_id,
    p_attendance_date,
    p_status,
    'manual',
    NULL,
    p_note,
    v_actor_user_id,
    v_actor_user_id
  )
  ON CONFLICT (user_id, attendance_date)
  DO UPDATE SET
    status = EXCLUDED.status,
    source_type = 'manual',
    source_entity_id = NULL,
    note = EXCLUDED.note,
    updated_by = v_actor_user_id,
    updated_at = now()
  RETURNING id
  INTO v_attendance_id;

  RETURN v_attendance_id;
END;
$$;


-- ============================================================
-- 11. INTERNAL ATTENDANCE SYNC FUNCTION
--
-- This function exists for Leave/WFH workflow integration.
-- It is not executable by authenticated users.
-- Migration 003.2 uses it from controlled SECURITY DEFINER
-- approval functions.
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.sync_attendance_from_request(
  p_user_id uuid,
  p_attendance_date date,
  p_status text,
  p_source_entity_id uuid,
  p_actor_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_attendance_id uuid;
  v_source_type text;
BEGIN
  IF p_status NOT IN ('leave', 'wfh') THEN
    RAISE EXCEPTION
      'Request attendance status must be leave or wfh';
  END IF;

  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION
      'Attendance synchronization actor is required';
  END IF;

  IF p_source_entity_id IS NULL THEN
    RAISE EXCEPTION
      'Attendance source entity is required';
  END IF;

  IF workforce.is_non_working_day(p_attendance_date) THEN
    RETURN NULL;
  END IF;

  v_source_type :=
    CASE
      WHEN p_status = 'leave'
        THEN 'leave_request'
      WHEN p_status = 'wfh'
        THEN 'wfh_request'
    END;

  INSERT INTO workforce.hr_attendance (
    user_id,
    attendance_date,
    status,
    source_type,
    source_entity_id,
    created_by,
    updated_by
  )
  VALUES (
    p_user_id,
    p_attendance_date,
    p_status,
    v_source_type,
    p_source_entity_id,
    p_actor_user_id,
    p_actor_user_id
  )
  ON CONFLICT (user_id, attendance_date)
  DO UPDATE SET
    status = EXCLUDED.status,
    source_type = EXCLUDED.source_type,
    source_entity_id = EXCLUDED.source_entity_id,
    note = NULL,
    updated_by = p_actor_user_id,
    updated_at = now()
  RETURNING id
  INTO v_attendance_id;

  RETURN v_attendance_id;
END;
$$;


-- ============================================================
-- 12. WORKING DATE RANGE HELPER
--
-- Returns dates excluding Sundays and HR holidays.
-- Used by Leave/WFH approval workflow in migration 003.2.
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.working_dates_between(
  p_date_from date,
  p_date_to date
)
RETURNS TABLE (
  working_date date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, workforce
AS $$
SELECT gs::date
FROM generate_series(
  p_date_from::timestamp,
  p_date_to::timestamp,
  interval '1 day'
) gs
WHERE NOT workforce.is_non_working_day(gs::date);
$$;


-- ============================================================
-- 13. ATTENDANCE RANGE VIEW
--
-- Produces a calendar-friendly result.
-- Missing rows appear as unmarked.
-- Sundays and HR holidays are identified separately.
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.get_attendance_calendar(
  p_user_id uuid,
  p_date_from date,
  p_date_to date
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
BEGIN
  IF NOT workforce.can_view_attendance_for(p_user_id) THEN
    RAISE EXCEPTION
      'Not authorized to view this attendance calendar';
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
    gs::date AS calendar_date,

    CASE
      WHEN workforce.is_sunday(gs::date)
        THEN NULL

      WHEN hh.id IS NOT NULL
        THEN NULL

      ELSE COALESCE(ha.status, 'unmarked')
    END AS attendance_status,

    workforce.is_sunday(gs::date) AS is_sunday,

    hh.id IS NOT NULL AS is_holiday,

    hh.name AS holiday_name,

    ha.id AS attendance_id,

    ha.source_type,

    ha.source_entity_id,

    ha.note

  FROM generate_series(
    p_date_from::timestamp,
    p_date_to::timestamp,
    interval '1 day'
  ) gs

  LEFT JOIN workforce.hr_holidays hh
    ON hh.holiday_date = gs::date

  LEFT JOIN workforce.hr_attendance ha
    ON ha.user_id = p_user_id
   AND ha.attendance_date = gs::date

  ORDER BY gs::date;
END;
$$;


-- ============================================================
-- 14. ENABLE AND FORCE RLS
-- ============================================================

ALTER TABLE workforce.hr_holidays
ENABLE ROW LEVEL SECURITY;

ALTER TABLE workforce.hr_attendance
ENABLE ROW LEVEL SECURITY;

ALTER TABLE workforce.hr_attendance_audit
ENABLE ROW LEVEL SECURITY;


ALTER TABLE workforce.hr_holidays
FORCE ROW LEVEL SECURITY;

ALTER TABLE workforce.hr_attendance
FORCE ROW LEVEL SECURITY;

ALTER TABLE workforce.hr_attendance_audit
FORCE ROW LEVEL SECURITY;


-- ============================================================
-- 15. HOLIDAY POLICIES
-- ============================================================

CREATE POLICY hr_holidays_select
ON workforce.hr_holidays
FOR SELECT
USING (
  NOT workforce.is_creator()
  AND workforce.is_active_workforce_user()
);


CREATE POLICY hr_holidays_insert
ON workforce.hr_holidays
FOR INSERT
WITH CHECK (
  workforce.can_manage_attendance()
  AND created_by = workforce.my_user_id()
);


-- No UPDATE policy.
-- No DELETE policy.
-- Holidays remain immutable after creation.


-- ============================================================
-- 16. ATTENDANCE POLICIES
-- ============================================================

CREATE POLICY hr_attendance_select
ON workforce.hr_attendance
FOR SELECT
USING (
  workforce.can_view_attendance_for(user_id)
);


CREATE POLICY hr_attendance_insert
ON workforce.hr_attendance
FOR INSERT
WITH CHECK (
  workforce.can_manage_attendance()
  AND created_by = workforce.my_user_id()
  AND (
    updated_by IS NULL
    OR updated_by = workforce.my_user_id()
  )
);


CREATE POLICY hr_attendance_update
ON workforce.hr_attendance
FOR UPDATE
USING (
  workforce.can_manage_attendance()
)
WITH CHECK (
  workforce.can_manage_attendance()
  AND updated_by = workforce.my_user_id()
);


-- No DELETE policy.


-- ============================================================
-- 17. ATTENDANCE AUDIT POLICIES
-- ============================================================

CREATE POLICY hr_attendance_audit_select
ON workforce.hr_attendance_audit
FOR SELECT
USING (
  workforce.can_manage_attendance()
);


-- No direct INSERT policy.
-- No UPDATE policy.
-- No DELETE policy.
-- Audit records are trigger-generated and append-only.


-- ============================================================
-- 18. PRIVILEGES
-- ============================================================

GRANT USAGE ON SCHEMA workforce
TO authenticated, service_role;


GRANT SELECT, INSERT
ON workforce.hr_holidays
TO authenticated;


GRANT SELECT, INSERT
ON workforce.hr_attendance
TO authenticated;


GRANT UPDATE (
  status,
  source_type,
  source_entity_id,
  note,
  updated_by
)
ON workforce.hr_attendance
TO authenticated;


GRANT SELECT
ON workforce.hr_attendance_audit
TO authenticated;


GRANT ALL PRIVILEGES
ON workforce.hr_holidays
TO service_role;

GRANT ALL PRIVILEGES
ON workforce.hr_attendance
TO service_role;

GRANT ALL PRIVILEGES
ON workforce.hr_attendance_audit
TO service_role;


-- ============================================================
-- 19. FUNCTION SECURITY
-- ============================================================

REVOKE ALL
ON FUNCTION workforce.can_manage_attendance()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.can_view_attendance_for(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.is_employee_or_intern()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.is_sunday(date)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.is_hr_holiday(date)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.is_non_working_day(date)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.validate_attendance_record()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.audit_attendance_record()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.create_hr_holiday(
  date,
  text,
  text
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.set_attendance(
  uuid,
  date,
  text,
  text
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.sync_attendance_from_request(
  uuid,
  date,
  text,
  uuid,
  uuid
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.working_dates_between(
  date,
  date
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.get_attendance_calendar(
  uuid,
  date,
  date
)
FROM PUBLIC;


GRANT EXECUTE
ON FUNCTION workforce.can_manage_attendance()
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.can_view_attendance_for(uuid)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.is_employee_or_intern()
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.is_sunday(date)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.is_hr_holiday(date)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.is_non_working_day(date)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.create_hr_holiday(
  date,
  text,
  text
)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.set_attendance(
  uuid,
  date,
  text,
  text
)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.working_dates_between(
  date,
  date
)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.get_attendance_calendar(
  uuid,
  date,
  date
)
TO authenticated, service_role;


-- Internal function: service role only.

GRANT EXECUTE
ON FUNCTION workforce.sync_attendance_from_request(
  uuid,
  date,
  text,
  uuid,
  uuid
)
TO service_role;


COMMIT;
Post-execution checks

BEGIN;

-- ============================================================
-- 003.2_WORKFORCE_LEAVE_WORKFLOW.SQL
--
-- Adds:
--   workforce.hr_leave_requests
--   workforce.hr_leave_decisions
--   workforce.hr_leave_status_history
--
-- Supports:
--   leave
--   wfh
--
-- Workflow:
--
-- Standard employee/intern/lead
--   requester
--   -> direct manager
--   -> HR Manager
--   -> approved
--   -> attendance synchronized
--
-- HR Executive
--   requester
--   -> direct manager / HR Manager
--   -> Co-Founder
--   -> approved
--
-- HR Manager
--   requester
--   -> Co-Founder
--   -> approved
--
-- Co-Founder
--   requester
--   -> automatically approved
--
-- Creators cannot submit or access Leave/WFH.
--
-- SCHEMA BOUNDARY:
--   public.*    : untouched
--   global.*    : read/reference only
--   workforce.* : all new workflow objects
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

  IF to_regclass('workforce.hr_attendance') IS NULL THEN
    RAISE EXCEPTION
      'workforce.hr_attendance is missing. Run migration 003.1 first.';
  END IF;

  IF to_regclass('workforce.hr_holidays') IS NULL THEN
    RAISE EXCEPTION
      'workforce.hr_holidays is missing. Run migration 003.1 first.';
  END IF;

  IF to_regprocedure('workforce.my_user_id()') IS NULL THEN
    RAISE EXCEPTION
      'workforce.my_user_id() is missing. Run migration 001 first.';
  END IF;

  IF to_regprocedure('workforce.my_role_name()') IS NULL THEN
    RAISE EXCEPTION
      'workforce.my_role_name() is missing. Run migration 001 first.';
  END IF;

  IF to_regprocedure('workforce.is_creator()') IS NULL THEN
    RAISE EXCEPTION
      'workforce.is_creator() is missing. Run migration 001 first.';
  END IF;

  IF to_regprocedure('workforce.is_admin()') IS NULL THEN
    RAISE EXCEPTION
      'workforce.is_admin() is missing. Run migration 001 first.';
  END IF;

  IF to_regprocedure('workforce.is_hr_manager()') IS NULL THEN
    RAISE EXCEPTION
      'workforce.is_hr_manager() is missing. Run migration 001 first.';
  END IF;

  IF to_regprocedure(
    'workforce.is_direct_manager_of(uuid)'
  ) IS NULL THEN
    RAISE EXCEPTION
      'workforce.is_direct_manager_of(uuid) is missing.';
  END IF;

  IF to_regprocedure(
    'workforce.sync_attendance_from_request(uuid,date,text,uuid,uuid)'
  ) IS NULL THEN
    RAISE EXCEPTION
      'Attendance synchronization function is missing. Run migration 003.1 first.';
  END IF;

  IF to_regprocedure(
    'workforce.working_dates_between(date,date)'
  ) IS NULL THEN
    RAISE EXCEPTION
      'Working-date helper is missing. Run migration 003.1 first.';
  END IF;
END;
$$;


-- ============================================================
-- 2. LEAVE/WFH AUTHORIZATION HELPERS
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.can_submit_leave_request()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
SELECT
  workforce.is_active_workforce_user()
  AND NOT workforce.is_creator()
  AND COALESCE(
    workforce.my_role_name() <> 'creator acquisition'
    OR true,
    false
  );
$$;


CREATE OR REPLACE FUNCTION workforce.can_view_leave_request_for(
  p_requester_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
SELECT
  NOT workforce.is_creator()
  AND (
    p_requester_user_id = workforce.my_user_id()
    OR workforce.is_direct_manager_of(p_requester_user_id)
    OR workforce.is_hr()
    OR workforce.is_admin()
  );
$$;


CREATE OR REPLACE FUNCTION workforce.is_current_leave_approver(
  p_current_approver_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
SELECT
  p_current_approver_user_id IS NOT NULL
  AND p_current_approver_user_id = workforce.my_user_id();
$$;


-- ============================================================
-- 3. APPROVER RESOLUTION HELPERS
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.resolve_role_user(
  p_role_name text
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global
AS $$
DECLARE
  v_user_id uuid;
  v_count integer;
BEGIN
  SELECT
    COUNT(*),
    MIN(gu.id)
  INTO
    v_count,
    v_user_id
  FROM global.users gu
  JOIN global.roles gr
    ON gr.id = gu.role_id
  WHERE lower(gr.name::text) = lower(btrim(p_role_name))
    AND gr.status = true
    AND lower(gu.status::text) = 'active';

  IF v_count = 0 THEN
    RAISE EXCEPTION
      'No active user found for role %',
      p_role_name;
  END IF;

  IF v_count > 1 THEN
    RAISE EXCEPTION
      'Multiple active users found for role %. A single approver is required.',
      p_role_name;
  END IF;

  RETURN v_user_id;
END;
$$;


CREATE OR REPLACE FUNCTION workforce.resolve_hr_manager_user()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
SELECT workforce.resolve_role_user('HR Manager');
$$;


CREATE OR REPLACE FUNCTION workforce.resolve_cofounder_user()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
SELECT workforce.resolve_role_user('Co-Founder');
$$;


CREATE OR REPLACE FUNCTION workforce.get_user_manager_id(
  p_user_id uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global
AS $$
SELECT gu.manager_user_id
FROM global.users gu
WHERE gu.id = p_user_id
  AND lower(gu.status::text) = 'active'
LIMIT 1;
$$;


CREATE OR REPLACE FUNCTION workforce.get_user_role_name(
  p_user_id uuid
)
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
WHERE gu.id = p_user_id
  AND lower(gu.status::text) = 'active'
  AND gr.status = true
LIMIT 1;
$$;


-- ============================================================
-- 4. LEAVE / WFH REQUESTS
-- ============================================================

CREATE TABLE workforce.hr_leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  requester_user_id uuid NOT NULL
    REFERENCES global.users(id)
    ON DELETE CASCADE,

  request_type text NOT NULL,

  date_from date NOT NULL,
  date_to date NOT NULL,

  reason text NOT NULL
    CHECK (btrim(reason) <> ''),

  status text NOT NULL DEFAULT 'draft',

  current_approver_user_id uuid
    REFERENCES global.users(id)
    ON DELETE SET NULL,

  submitted_at timestamptz,
  finalized_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hr_leave_requests_type_check
  CHECK (
    request_type IN (
      'leave',
      'wfh'
    )
  ),

  CONSTRAINT hr_leave_requests_date_range_check
  CHECK (
    date_from <= date_to
  ),

  CONSTRAINT hr_leave_requests_status_check
  CHECK (
    status IN (
      'draft',
      'pending_manager',
      'manager_approved',
      'pending_hr',
      'approved',
      'rejected',
      'cancelled'
    )
  ),

  CONSTRAINT hr_leave_requests_submission_state_check
  CHECK (
    (
      status = 'draft'
      AND submitted_at IS NULL
      AND finalized_at IS NULL
      AND current_approver_user_id IS NULL
    )
    OR
    (
      status IN (
        'pending_manager',
        'manager_approved',
        'pending_hr'
      )
      AND submitted_at IS NOT NULL
      AND finalized_at IS NULL
    )
    OR
    (
      status IN (
        'approved',
        'rejected',
        'cancelled'
      )
      AND finalized_at IS NOT NULL
    )
  )
);


CREATE INDEX idx_hr_leave_requests_requester
ON workforce.hr_leave_requests(
  requester_user_id,
  created_at DESC
);


CREATE INDEX idx_hr_leave_requests_status
ON workforce.hr_leave_requests(
  status,
  created_at DESC
);


CREATE INDEX idx_hr_leave_requests_approver
ON workforce.hr_leave_requests(
  current_approver_user_id,
  status
)
WHERE current_approver_user_id IS NOT NULL;


CREATE INDEX idx_hr_leave_requests_dates
ON workforce.hr_leave_requests(
  date_from,
  date_to
);


CREATE TRIGGER trg_hr_leave_requests_updated_at
BEFORE UPDATE
ON workforce.hr_leave_requests
FOR EACH ROW
EXECUTE FUNCTION workforce.set_updated_at();


-- ============================================================
-- 5. LEAVE / WFH DECISIONS
-- ============================================================

CREATE TABLE workforce.hr_leave_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  request_id uuid NOT NULL
    REFERENCES workforce.hr_leave_requests(id)
    ON DELETE CASCADE,

  decision_stage text NOT NULL,

  decision text NOT NULL,

  decided_by uuid NOT NULL
    REFERENCES global.users(id)
    ON DELETE RESTRICT,

  reason text,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hr_leave_decisions_stage_check
  CHECK (
    decision_stage IN (
      'manager',
      'hr',
      'auto'
    )
  ),

  CONSTRAINT hr_leave_decisions_decision_check
  CHECK (
    decision IN (
      'approved',
      'rejected'
    )
  ),

  CONSTRAINT hr_leave_decisions_rejection_reason_check
  CHECK (
    decision <> 'rejected'
    OR (
      reason IS NOT NULL
      AND btrim(reason) <> ''
    )
  )
);


CREATE INDEX idx_hr_leave_decisions_request
ON workforce.hr_leave_decisions(
  request_id,
  created_at DESC
);


CREATE INDEX idx_hr_leave_decisions_decider
ON workforce.hr_leave_decisions(
  decided_by,
  created_at DESC
);


-- ============================================================
-- 6. LEAVE / WFH STATUS HISTORY
-- ============================================================

CREATE TABLE workforce.hr_leave_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  request_id uuid NOT NULL
    REFERENCES workforce.hr_leave_requests(id)
    ON DELETE CASCADE,

  old_status text,
  new_status text NOT NULL,

  changed_by uuid NOT NULL
    REFERENCES global.users(id)
    ON DELETE RESTRICT,

  change_note text,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hr_leave_history_old_status_check
  CHECK (
    old_status IS NULL
    OR old_status IN (
      'draft',
      'pending_manager',
      'manager_approved',
      'pending_hr',
      'approved',
      'rejected',
      'cancelled'
    )
  ),

  CONSTRAINT hr_leave_history_new_status_check
  CHECK (
    new_status IN (
      'draft',
      'pending_manager',
      'manager_approved',
      'pending_hr',
      'approved',
      'rejected',
      'cancelled'
    )
  )
);


CREATE INDEX idx_hr_leave_status_history_request
ON workforce.hr_leave_status_history(
  request_id,
  created_at DESC
);


CREATE INDEX idx_hr_leave_status_history_actor
ON workforce.hr_leave_status_history(
  changed_by,
  created_at DESC
);


-- ============================================================
-- 7. OVERLAP CHECK
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.has_overlapping_leave_request(
  p_requester_user_id uuid,
  p_date_from date,
  p_date_to date,
  p_exclude_request_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, workforce
AS $$
SELECT EXISTS (
  SELECT 1
  FROM workforce.hr_leave_requests lr
  WHERE lr.requester_user_id = p_requester_user_id
    AND (
      p_exclude_request_id IS NULL
      OR lr.id <> p_exclude_request_id
    )
    AND lr.status IN (
      'pending_manager',
      'manager_approved',
      'pending_hr',
      'approved'
    )
    AND daterange(
      lr.date_from,
      lr.date_to,
      '[]'
    ) && daterange(
      p_date_from,
      p_date_to,
      '[]'
    )
);
$$;


CREATE OR REPLACE FUNCTION workforce.validate_leave_request_dates(
  p_requester_user_id uuid,
  p_date_from date,
  p_date_to date,
  p_exclude_request_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_joined_at date;
  v_working_day_count integer;
BEGIN
  IF p_date_from IS NULL
     OR p_date_to IS NULL THEN
    RAISE EXCEPTION 'Leave/WFH date range is required';
  END IF;

  IF p_date_from > p_date_to THEN
    RAISE EXCEPTION
      'Date-from cannot be after date-to';
  END IF;

  SELECT gu.joined_at
  INTO v_joined_at
  FROM global.users gu
  WHERE gu.id = p_requester_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Requester does not exist';
  END IF;

  IF v_joined_at IS NULL THEN
    RAISE EXCEPTION
      'Joining date must be set before Leave/WFH can be requested';
  END IF;

  IF p_date_from < v_joined_at THEN
    RAISE EXCEPTION
      'Leave/WFH cannot begin before joining date %',
      v_joined_at;
  END IF;

  SELECT COUNT(*)
  INTO v_working_day_count
  FROM workforce.working_dates_between(
    p_date_from,
    p_date_to
  );

  IF v_working_day_count = 0 THEN
    RAISE EXCEPTION
      'The selected range contains no working dates';
  END IF;

  IF workforce.has_overlapping_leave_request(
    p_requester_user_id,
    p_date_from,
    p_date_to,
    p_exclude_request_id
  ) THEN
    RAISE EXCEPTION
      'An overlapping active Leave/WFH request already exists';
  END IF;
END;
$$;


-- ============================================================
-- 8. STATUS HISTORY TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.record_leave_status_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_actor_user_id uuid;
BEGIN
  v_actor_user_id := workforce.my_user_id();

  IF v_actor_user_id IS NULL THEN
    v_actor_user_id := NEW.requester_user_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO workforce.hr_leave_status_history (
      request_id,
      old_status,
      new_status,
      changed_by,
      change_note
    )
    VALUES (
      NEW.id,
      NULL,
      NEW.status,
      v_actor_user_id,
      'Request created'
    );

  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO workforce.hr_leave_status_history (
      request_id,
      old_status,
      new_status,
      changed_by,
      change_note
    )
    VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      v_actor_user_id,
      CASE
        WHEN NEW.status = 'pending_manager'
          THEN 'Request submitted for manager approval'

        WHEN NEW.status = 'manager_approved'
          THEN 'Manager approved request'

        WHEN NEW.status = 'pending_hr'
          THEN 'Request sent for final approval'

        WHEN NEW.status = 'approved'
          THEN 'Request approved'

        WHEN NEW.status = 'rejected'
          THEN 'Request rejected'

        WHEN NEW.status = 'cancelled'
          THEN 'Request cancelled'

        ELSE NULL
      END
    );
  END IF;

  RETURN NEW;
END;
$$;


CREATE TRIGGER trg_hr_leave_status_history
AFTER INSERT OR UPDATE OF status
ON workforce.hr_leave_requests
FOR EACH ROW
EXECUTE FUNCTION workforce.record_leave_status_history();


-- ============================================================
-- 9. ATTENDANCE SYNCHRONIZATION
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.apply_approved_request_attendance(
  p_request_id uuid,
  p_actor_user_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_request workforce.hr_leave_requests%ROWTYPE;
  v_date record;
  v_count integer := 0;
BEGIN
  SELECT *
  INTO v_request
  FROM workforce.hr_leave_requests
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Leave/WFH request not found';
  END IF;

  IF v_request.status <> 'approved' THEN
    RAISE EXCEPTION
      'Attendance can only be synchronized for approved requests';
  END IF;

  FOR v_date IN
    SELECT working_date
    FROM workforce.working_dates_between(
      v_request.date_from,
      v_request.date_to
    )
  LOOP
    PERFORM workforce.sync_attendance_from_request(
      v_request.requester_user_id,
      v_date.working_date,
      v_request.request_type,
      v_request.id,
      p_actor_user_id
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;


-- ============================================================
-- 10. CREATE DRAFT REQUEST
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.create_leave_request(
  p_request_type text,
  p_date_from date,
  p_date_to date,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_requester_user_id uuid;
  v_request_id uuid;
BEGIN
  IF NOT workforce.can_submit_leave_request() THEN
    RAISE EXCEPTION
      'Not authorized to submit Leave/WFH requests';
  END IF;

  v_requester_user_id := workforce.my_user_id();

  IF v_requester_user_id IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  IF p_request_type NOT IN ('leave', 'wfh') THEN
    RAISE EXCEPTION
      'Request type must be leave or wfh';
  END IF;

  IF p_reason IS NULL
     OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Reason is required';
  END IF;

  PERFORM workforce.validate_leave_request_dates(
    v_requester_user_id,
    p_date_from,
    p_date_to,
    NULL
  );

  INSERT INTO workforce.hr_leave_requests (
    requester_user_id,
    request_type,
    date_from,
    date_to,
    reason,
    status
  )
  VALUES (
    v_requester_user_id,
    p_request_type,
    p_date_from,
    p_date_to,
    btrim(p_reason),
    'draft'
  )
  RETURNING id
  INTO v_request_id;

  RETURN v_request_id;
END;
$$;


-- ============================================================
-- 11. UPDATE DRAFT REQUEST
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.update_leave_request_draft(
  p_request_id uuid,
  p_request_type text,
  p_date_from date,
  p_date_to date,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_requester_user_id uuid;
BEGIN
  v_requester_user_id := workforce.my_user_id();

  IF v_requester_user_id IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  IF workforce.is_creator() THEN
    RAISE EXCEPTION
      'Creators cannot submit Leave/WFH requests';
  END IF;

  IF p_request_type NOT IN ('leave', 'wfh') THEN
    RAISE EXCEPTION
      'Request type must be leave or wfh';
  END IF;

  IF p_reason IS NULL
     OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Reason is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM workforce.hr_leave_requests lr
    WHERE lr.id = p_request_id
      AND lr.requester_user_id =
        v_requester_user_id
      AND lr.status = 'draft'
  ) THEN
    RAISE EXCEPTION
      'Editable draft request not found';
  END IF;

  PERFORM workforce.validate_leave_request_dates(
    v_requester_user_id,
    p_date_from,
    p_date_to,
    p_request_id
  );

  UPDATE workforce.hr_leave_requests
  SET
    request_type = p_request_type,
    date_from = p_date_from,
    date_to = p_date_to,
    reason = btrim(p_reason),
    updated_at = now()
  WHERE id = p_request_id;
END;
$$;


-- ============================================================
-- 12. SUBMIT REQUEST
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.submit_leave_request(
  p_request_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_requester_user_id uuid;
  v_request workforce.hr_leave_requests%ROWTYPE;
  v_requester_role text;
  v_manager_user_id uuid;
  v_approver_user_id uuid;
  v_new_status text;
BEGIN
  v_requester_user_id := workforce.my_user_id();

  IF v_requester_user_id IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  IF workforce.is_creator() THEN
    RAISE EXCEPTION
      'Creators cannot submit Leave/WFH requests';
  END IF;

  SELECT *
  INTO v_request
  FROM workforce.hr_leave_requests
  WHERE id = p_request_id
    AND requester_user_id = v_requester_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Leave/WFH request not found';
  END IF;

  IF v_request.status <> 'draft' THEN
    RAISE EXCEPTION
      'Only draft requests can be submitted';
  END IF;

  PERFORM workforce.validate_leave_request_dates(
    v_request.requester_user_id,
    v_request.date_from,
    v_request.date_to,
    v_request.id
  );

  v_requester_role :=
    workforce.get_user_role_name(
      v_request.requester_user_id
    );

  IF v_requester_role = 'creator' THEN
    RAISE EXCEPTION
      'Creators cannot submit Leave/WFH requests';
  END IF;

  -- Co-Founder requests are auto-approved.

  IF v_requester_role = 'co-founder' THEN
    UPDATE workforce.hr_leave_requests
    SET
      status = 'approved',
      current_approver_user_id = NULL,
      submitted_at = now(),
      finalized_at = now(),
      updated_at = now()
    WHERE id = p_request_id;

    INSERT INTO workforce.hr_leave_decisions (
      request_id,
      decision_stage,
      decision,
      decided_by,
      reason
    )
    VALUES (
      p_request_id,
      'auto',
      'approved',
      v_requester_user_id,
      'Co-Founder request automatically approved'
    );

    PERFORM workforce.apply_approved_request_attendance(
      p_request_id,
      v_requester_user_id
    );

    RETURN 'approved';
  END IF;

  -- HR Manager requests go directly to Co-Founder.

  IF v_requester_role = 'hr manager' THEN
    v_approver_user_id :=
      workforce.resolve_cofounder_user();

    v_new_status := 'pending_hr';

  ELSE
    v_manager_user_id :=
      workforce.get_user_manager_id(
        v_request.requester_user_id
      );

    -- If no manager exists, route normal requests directly
    -- to HR Manager.

    IF v_manager_user_id IS NULL THEN
      v_approver_user_id :=
        workforce.resolve_hr_manager_user();

      v_new_status := 'pending_hr';

    ELSE
      v_approver_user_id :=
        v_manager_user_id;

      v_new_status := 'pending_manager';
    END IF;
  END IF;

  UPDATE workforce.hr_leave_requests
  SET
    status = v_new_status,
    current_approver_user_id =
      v_approver_user_id,
    submitted_at = now(),
    finalized_at = NULL,
    updated_at = now()
  WHERE id = p_request_id;

  RETURN v_new_status;
END;
$$;


-- ============================================================
-- 13. MANAGER DECISION
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.manager_decide_leave_request(
  p_request_id uuid,
  p_decision text,
  p_reason text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_actor_user_id uuid;
  v_request workforce.hr_leave_requests%ROWTYPE;
  v_requester_role text;
  v_next_approver uuid;
BEGIN
  v_actor_user_id := workforce.my_user_id();

  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  IF workforce.is_creator() THEN
    RAISE EXCEPTION
      'Creators cannot approve Leave/WFH requests';
  END IF;

  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION
      'Decision must be approved or rejected';
  END IF;

  IF p_decision = 'rejected'
     AND (
       p_reason IS NULL
       OR btrim(p_reason) = ''
     ) THEN
    RAISE EXCEPTION
      'Rejection reason is required';
  END IF;

  SELECT *
  INTO v_request
  FROM workforce.hr_leave_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Leave/WFH request not found';
  END IF;

  IF v_request.status <> 'pending_manager' THEN
    RAISE EXCEPTION
      'Request is not awaiting manager approval';
  END IF;

  IF v_request.current_approver_user_id
     IS DISTINCT FROM v_actor_user_id THEN
    RAISE EXCEPTION
      'Current user is not the assigned manager approver';
  END IF;

  INSERT INTO workforce.hr_leave_decisions (
    request_id,
    decision_stage,
    decision,
    decided_by,
    reason
  )
  VALUES (
    p_request_id,
    'manager',
    p_decision,
    v_actor_user_id,
    CASE
      WHEN p_reason IS NULL
        THEN NULL
      ELSE btrim(p_reason)
    END
  );

  IF p_decision = 'rejected' THEN
    UPDATE workforce.hr_leave_requests
    SET
      status = 'rejected',
      current_approver_user_id = NULL,
      finalized_at = now(),
      updated_at = now()
    WHERE id = p_request_id;

    RETURN 'rejected';
  END IF;

  UPDATE workforce.hr_leave_requests
  SET
    status = 'manager_approved',
    updated_at = now()
  WHERE id = p_request_id;

  v_requester_role :=
    workforce.get_user_role_name(
      v_request.requester_user_id
    );

  -- HR Executive request escalates to Co-Founder.
  -- Standard request escalates to HR Manager.

  IF v_requester_role = 'hr executive' THEN
    v_next_approver :=
      workforce.resolve_cofounder_user();
  ELSE
    v_next_approver :=
      workforce.resolve_hr_manager_user();
  END IF;

  UPDATE workforce.hr_leave_requests
  SET
    status = 'pending_hr',
    current_approver_user_id =
      v_next_approver,
    updated_at = now()
  WHERE id = p_request_id;

  RETURN 'pending_hr';
END;
$$;


-- ============================================================
-- 14. HR / CO-FOUNDER FINAL DECISION
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.hr_decide_leave_request(
  p_request_id uuid,
  p_decision text,
  p_reason text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_actor_user_id uuid;
  v_request workforce.hr_leave_requests%ROWTYPE;
BEGIN
  v_actor_user_id := workforce.my_user_id();

  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  IF workforce.is_creator() THEN
    RAISE EXCEPTION
      'Creators cannot approve Leave/WFH requests';
  END IF;

  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION
      'Decision must be approved or rejected';
  END IF;

  IF p_decision = 'rejected'
     AND (
       p_reason IS NULL
       OR btrim(p_reason) = ''
     ) THEN
    RAISE EXCEPTION
      'Rejection reason is required';
  END IF;

  SELECT *
  INTO v_request
  FROM workforce.hr_leave_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Leave/WFH request not found';
  END IF;

  IF v_request.status <> 'pending_hr' THEN
    RAISE EXCEPTION
      'Request is not awaiting final approval';
  END IF;

  IF v_request.current_approver_user_id
     IS DISTINCT FROM v_actor_user_id THEN
    RAISE EXCEPTION
      'Current user is not the assigned final approver';
  END IF;

  IF NOT (
    workforce.is_hr_manager()
    OR workforce.is_admin()
  ) THEN
    RAISE EXCEPTION
      'Only HR Manager or Co-Founder may provide final approval';
  END IF;

  INSERT INTO workforce.hr_leave_decisions (
    request_id,
    decision_stage,
    decision,
    decided_by,
    reason
  )
  VALUES (
    p_request_id,
    'hr',
    p_decision,
    v_actor_user_id,
    CASE
      WHEN p_reason IS NULL
        THEN NULL
      ELSE btrim(p_reason)
    END
  );

  IF p_decision = 'rejected' THEN
    UPDATE workforce.hr_leave_requests
    SET
      status = 'rejected',
      current_approver_user_id = NULL,
      finalized_at = now(),
      updated_at = now()
    WHERE id = p_request_id;

    RETURN 'rejected';
  END IF;

  UPDATE workforce.hr_leave_requests
  SET
    status = 'approved',
    current_approver_user_id = NULL,
    finalized_at = now(),
    updated_at = now()
  WHERE id = p_request_id;

  PERFORM workforce.apply_approved_request_attendance(
    p_request_id,
    v_actor_user_id
  );

  RETURN 'approved';
END;
$$;


-- ============================================================
-- 15. CANCEL REQUEST
--
-- Requester may cancel only before final approval/rejection.
-- Approved requests are not cancelled by this function because
-- attendance has already been synchronized.
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.cancel_leave_request(
  p_request_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_actor_user_id uuid;
  v_request workforce.hr_leave_requests%ROWTYPE;
BEGIN
  v_actor_user_id := workforce.my_user_id();

  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  IF p_reason IS NULL
     OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION
      'Cancellation reason is required';
  END IF;

  SELECT *
  INTO v_request
  FROM workforce.hr_leave_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Leave/WFH request not found';
  END IF;

  IF v_request.requester_user_id
     IS DISTINCT FROM v_actor_user_id
     AND NOT workforce.is_hr_manager()
     AND NOT workforce.is_admin() THEN
    RAISE EXCEPTION
      'Not authorized to cancel this request';
  END IF;

  IF v_request.status NOT IN (
    'draft',
    'pending_manager',
    'manager_approved',
    'pending_hr'
  ) THEN
    RAISE EXCEPTION
      'Only non-finalized requests can be cancelled';
  END IF;

  UPDATE workforce.hr_leave_requests
  SET
    status = 'cancelled',
    current_approver_user_id = NULL,
    finalized_at = now(),
    updated_at = now()
  WHERE id = p_request_id;

  INSERT INTO workforce.hr_leave_status_history (
    request_id,
    old_status,
    new_status,
    changed_by,
    change_note
  )
  VALUES (
    p_request_id,
    v_request.status,
    'cancelled',
    v_actor_user_id,
    btrim(p_reason)
  );
END;
$$;


-- ============================================================
-- 16. REQUEST ACCESS VIEW FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.get_leave_request(
  p_request_id uuid
)
RETURNS SETOF workforce.hr_leave_requests
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_requester_user_id uuid;
BEGIN
  SELECT lr.requester_user_id
  INTO v_requester_user_id
  FROM workforce.hr_leave_requests lr
  WHERE lr.id = p_request_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF NOT workforce.can_view_leave_request_for(
    v_requester_user_id
  ) THEN
    RAISE EXCEPTION
      'Not authorized to view this Leave/WFH request';
  END IF;

  RETURN QUERY
  SELECT *
  FROM workforce.hr_leave_requests
  WHERE id = p_request_id;
END;
$$;


-- ============================================================
-- 17. ENABLE AND FORCE RLS
-- ============================================================

ALTER TABLE workforce.hr_leave_requests
ENABLE ROW LEVEL SECURITY;

ALTER TABLE workforce.hr_leave_decisions
ENABLE ROW LEVEL SECURITY;

ALTER TABLE workforce.hr_leave_status_history
ENABLE ROW LEVEL SECURITY;


ALTER TABLE workforce.hr_leave_requests
FORCE ROW LEVEL SECURITY;

ALTER TABLE workforce.hr_leave_decisions
FORCE ROW LEVEL SECURITY;

ALTER TABLE workforce.hr_leave_status_history
FORCE ROW LEVEL SECURITY;


-- ============================================================
-- 18. REQUEST POLICIES
-- ============================================================

CREATE POLICY hr_leave_requests_select
ON workforce.hr_leave_requests
FOR SELECT
USING (
  workforce.can_view_leave_request_for(
    requester_user_id
  )
);


-- No direct INSERT policy.
-- Requests are created through create_leave_request().


-- No direct UPDATE policy.
-- State transitions occur through controlled functions.


-- No DELETE policy.


-- ============================================================
-- 19. DECISION POLICIES
-- ============================================================

CREATE POLICY hr_leave_decisions_select
ON workforce.hr_leave_decisions
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM workforce.hr_leave_requests lr
    WHERE lr.id = request_id
      AND workforce.can_view_leave_request_for(
        lr.requester_user_id
      )
  )
);


-- No direct INSERT, UPDATE or DELETE policies.
-- Decisions are append-only and function-generated.


-- ============================================================
-- 20. STATUS HISTORY POLICIES
-- ============================================================

CREATE POLICY hr_leave_status_history_select
ON workforce.hr_leave_status_history
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM workforce.hr_leave_requests lr
    WHERE lr.id = request_id
      AND workforce.can_view_leave_request_for(
        lr.requester_user_id
      )
  )
);


-- No direct INSERT, UPDATE or DELETE policies.
-- History is append-only.


-- ============================================================
-- 21. PRIVILEGES
-- ============================================================

GRANT USAGE ON SCHEMA workforce
TO authenticated, service_role;


GRANT SELECT
ON workforce.hr_leave_requests
TO authenticated;


GRANT SELECT
ON workforce.hr_leave_decisions
TO authenticated;


GRANT SELECT
ON workforce.hr_leave_status_history
TO authenticated;


GRANT ALL PRIVILEGES
ON workforce.hr_leave_requests
TO service_role;

GRANT ALL PRIVILEGES
ON workforce.hr_leave_decisions
TO service_role;

GRANT ALL PRIVILEGES
ON workforce.hr_leave_status_history
TO service_role;


-- ============================================================
-- 22. FUNCTION SECURITY
-- ============================================================

REVOKE ALL
ON FUNCTION workforce.can_submit_leave_request()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.can_view_leave_request_for(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.is_current_leave_approver(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.resolve_role_user(text)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.resolve_hr_manager_user()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.resolve_cofounder_user()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.get_user_manager_id(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.get_user_role_name(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.has_overlapping_leave_request(
  uuid,
  date,
  date,
  uuid
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.validate_leave_request_dates(
  uuid,
  date,
  date,
  uuid
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.record_leave_status_history()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.apply_approved_request_attendance(
  uuid,
  uuid
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.create_leave_request(
  text,
  date,
  date,
  text
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.update_leave_request_draft(
  uuid,
  text,
  date,
  date,
  text
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.submit_leave_request(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.manager_decide_leave_request(
  uuid,
  text,
  text
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.hr_decide_leave_request(
  uuid,
  text,
  text
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.cancel_leave_request(
  uuid,
  text
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.get_leave_request(uuid)
FROM PUBLIC;


GRANT EXECUTE
ON FUNCTION workforce.can_submit_leave_request()
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.can_view_leave_request_for(uuid)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.create_leave_request(
  text,
  date,
  date,
  text
)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.update_leave_request_draft(
  uuid,
  text,
  date,
  date,
  text
)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.submit_leave_request(uuid)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.manager_decide_leave_request(
  uuid,
  text,
  text
)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.hr_decide_leave_request(
  uuid,
  text,
  text
)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.cancel_leave_request(
  uuid,
  text
)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.get_leave_request(uuid)
TO authenticated, service_role;


-- Internal helpers remain service-role / owner only.

GRANT EXECUTE
ON FUNCTION workforce.resolve_role_user(text)
TO service_role;

GRANT EXECUTE
ON FUNCTION workforce.resolve_hr_manager_user()
TO service_role;

GRANT EXECUTE
ON FUNCTION workforce.resolve_cofounder_user()
TO service_role;

GRANT EXECUTE
ON FUNCTION workforce.get_user_manager_id(uuid)
TO service_role;

GRANT EXECUTE
ON FUNCTION workforce.get_user_role_name(uuid)
TO service_role;

GRANT EXECUTE
ON FUNCTION workforce.has_overlapping_leave_request(
  uuid,
  date,
  date,
  uuid
)
TO service_role;

GRANT EXECUTE
ON FUNCTION workforce.validate_leave_request_dates(
  uuid,
  date,
  date,
  uuid
)
TO service_role;

GRANT EXECUTE
ON FUNCTION workforce.apply_approved_request_attendance(
  uuid,
  uuid
)
TO service_role;


COMMIT;
Post-execution checks
