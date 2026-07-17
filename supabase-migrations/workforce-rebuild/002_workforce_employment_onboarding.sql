BEGIN;

-- ============================================================
-- 002_WORKFORCE_EMPLOYMENT_ONBOARDING.SQL
--
-- REQUIRED FOUNDATION:
--   001_workforce_foundation.sql
--
-- SCHEMA BOUNDARY:
--   public.*    : untouched
--   global.*    : shared identity; narrowly updated through
--                 controlled Workforce functions
--   workforce.* : tables, functions, policies and audit records
--
-- JOINING DATE SOURCE OF TRUTH:
--   global.users.joined_at
--
-- REPORTING MANAGER SOURCE OF TRUTH:
--   global.users.manager_user_id
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
-- 2. EMPLOYMENT AUTHORIZATION HELPERS
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.can_manage_employment()
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


CREATE OR REPLACE FUNCTION workforce.can_view_employment_record(
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
    OR workforce.can_manage_employment()
  );
$$;


CREATE OR REPLACE FUNCTION workforce.can_manage_onboarding()
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


-- ============================================================
-- 3. JOINING DATE AUDIT
-- ============================================================

CREATE TABLE workforce.joining_date_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id uuid NOT NULL
    REFERENCES global.users(id)
    ON DELETE RESTRICT,

  old_joined_at date,
  new_joined_at date NOT NULL,

  change_reason text NOT NULL
    CHECK (btrim(change_reason) <> ''),

  changed_by uuid NOT NULL
    REFERENCES global.users(id)
    ON DELETE RESTRICT,

  changed_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT joining_date_audit_changed_value_check
  CHECK (
    old_joined_at IS NULL
    OR old_joined_at IS DISTINCT FROM new_joined_at
  )
);


CREATE INDEX idx_joining_date_audit_user
ON workforce.joining_date_audit(
  user_id,
  changed_at DESC
);


CREATE INDEX idx_joining_date_audit_changed_by
ON workforce.joining_date_audit(
  changed_by,
  changed_at DESC
);


-- ============================================================
-- 4. EMPLOYMENT DETAILS
--
-- global.users.joined_at remains the only joining-date source.
-- ============================================================

CREATE TABLE workforce.employment_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id uuid NOT NULL UNIQUE
    REFERENCES global.users(id)
    ON DELETE CASCADE,

  probation_required boolean NOT NULL DEFAULT false,

  probation_duration_days integer,

  employment_status text NOT NULL DEFAULT 'active',

  created_by uuid NOT NULL
    REFERENCES global.users(id)
    ON DELETE RESTRICT,

  updated_by uuid
    REFERENCES global.users(id)
    ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT employment_details_probation_duration_check
  CHECK (
    probation_duration_days IS NULL
    OR probation_duration_days > 0
  ),

  CONSTRAINT employment_details_probation_required_check
  CHECK (
    (
      probation_required = false
      AND probation_duration_days IS NULL
    )
    OR
    (
      probation_required = true
      AND probation_duration_days IS NOT NULL
      AND probation_duration_days > 0
    )
  ),

  CONSTRAINT employment_details_status_check
  CHECK (
    employment_status IN (
      'pending',
      'active',
      'on_leave',
      'offboarding',
      'offboarded',
      'terminated',
      'cancelled'
    )
  )
);


CREATE INDEX idx_employment_details_status
ON workforce.employment_details(employment_status);


CREATE INDEX idx_employment_details_created_by
ON workforce.employment_details(created_by);


CREATE TRIGGER trg_employment_details_updated_at
BEFORE UPDATE
ON workforce.employment_details
FOR EACH ROW
EXECUTE FUNCTION workforce.set_updated_at();


-- ============================================================
-- 5. HR ONBOARDING
-- ============================================================

CREATE TABLE workforce.hr_onboarding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id uuid NOT NULL
    REFERENCES global.users(id)
    ON DELETE CASCADE,

  joined_at date NOT NULL,

  reporting_manager_user_id uuid
    REFERENCES global.users(id)
    ON DELETE SET NULL,

  probation_required boolean NOT NULL DEFAULT false,

  probation_duration_days integer,

  status text NOT NULL DEFAULT 'draft',

  created_by uuid NOT NULL
    REFERENCES global.users(id)
    ON DELETE RESTRICT,

  updated_by uuid
    REFERENCES global.users(id)
    ON DELETE SET NULL,

  completed_by uuid
    REFERENCES global.users(id)
    ON DELETE SET NULL,

  completed_at timestamptz,

  cancelled_by uuid
    REFERENCES global.users(id)
    ON DELETE SET NULL,

  cancelled_at timestamptz,

  cancellation_reason text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hr_onboarding_manager_self_check
  CHECK (
    reporting_manager_user_id IS NULL
    OR reporting_manager_user_id <> user_id
  ),

  CONSTRAINT hr_onboarding_probation_duration_check
  CHECK (
    probation_duration_days IS NULL
    OR probation_duration_days > 0
  ),

  CONSTRAINT hr_onboarding_probation_required_check
  CHECK (
    (
      probation_required = false
      AND probation_duration_days IS NULL
    )
    OR
    (
      probation_required = true
      AND probation_duration_days IS NOT NULL
      AND probation_duration_days > 0
    )
  ),

  CONSTRAINT hr_onboarding_status_check
  CHECK (
    status IN (
      'draft',
      'in_progress',
      'completed',
      'cancelled'
    )
  ),

  CONSTRAINT hr_onboarding_completion_state_check
  CHECK (
    (
      status = 'completed'
      AND completed_by IS NOT NULL
      AND completed_at IS NOT NULL
      AND cancelled_by IS NULL
      AND cancelled_at IS NULL
      AND cancellation_reason IS NULL
    )
    OR
    (
      status = 'cancelled'
      AND cancelled_by IS NOT NULL
      AND cancelled_at IS NOT NULL
      AND cancellation_reason IS NOT NULL
      AND btrim(cancellation_reason) <> ''
      AND completed_by IS NULL
      AND completed_at IS NULL
    )
    OR
    (
      status IN ('draft', 'in_progress')
      AND completed_by IS NULL
      AND completed_at IS NULL
      AND cancelled_by IS NULL
      AND cancelled_at IS NULL
      AND cancellation_reason IS NULL
    )
  )
);


CREATE UNIQUE INDEX uq_hr_onboarding_one_open_per_user
ON workforce.hr_onboarding(user_id)
WHERE status IN ('draft', 'in_progress');


CREATE INDEX idx_hr_onboarding_user
ON workforce.hr_onboarding(user_id, created_at DESC);


CREATE INDEX idx_hr_onboarding_status
ON workforce.hr_onboarding(status, created_at DESC);


CREATE INDEX idx_hr_onboarding_manager
ON workforce.hr_onboarding(
  reporting_manager_user_id,
  status
)
WHERE reporting_manager_user_id IS NOT NULL;


CREATE TRIGGER trg_hr_onboarding_updated_at
BEFORE UPDATE
ON workforce.hr_onboarding
FOR EACH ROW
EXECUTE FUNCTION workforce.set_updated_at();


-- ============================================================
-- 6. ONBOARDING STATUS HISTORY
-- ============================================================

CREATE TABLE workforce.hr_onboarding_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  onboarding_id uuid NOT NULL
    REFERENCES workforce.hr_onboarding(id)
    ON DELETE CASCADE,

  old_status text,

  new_status text NOT NULL,

  changed_by uuid NOT NULL
    REFERENCES global.users(id)
    ON DELETE RESTRICT,

  change_note text,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hr_onboarding_history_old_status_check
  CHECK (
    old_status IS NULL
    OR old_status IN (
      'draft',
      'in_progress',
      'completed',
      'cancelled'
    )
  ),

  CONSTRAINT hr_onboarding_history_new_status_check
  CHECK (
    new_status IN (
      'draft',
      'in_progress',
      'completed',
      'cancelled'
    )
  )
);


CREATE INDEX idx_hr_onboarding_history_onboarding
ON workforce.hr_onboarding_status_history(
  onboarding_id,
  created_at DESC
);


CREATE INDEX idx_hr_onboarding_history_changed_by
ON workforce.hr_onboarding_status_history(
  changed_by,
  created_at DESC
);


-- ============================================================
-- 7. ONBOARDING STATUS HISTORY TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.record_onboarding_status_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_changed_by uuid;
  v_note text;
BEGIN
  v_changed_by := workforce.my_user_id();

  IF v_changed_by IS NULL THEN
    v_changed_by := COALESCE(
      NEW.updated_by,
      NEW.completed_by,
      NEW.cancelled_by,
      NEW.created_by
    );
  END IF;

  IF v_changed_by IS NULL THEN
    RAISE EXCEPTION
      'Unable to resolve onboarding status-change actor';
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO workforce.hr_onboarding_status_history (
      onboarding_id,
      old_status,
      new_status,
      changed_by,
      change_note
    )
    VALUES (
      NEW.id,
      NULL,
      NEW.status,
      v_changed_by,
      'Onboarding created'
    );

  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    v_note :=
      CASE
        WHEN NEW.status = 'in_progress'
          THEN 'Onboarding started'

        WHEN NEW.status = 'completed'
          THEN 'Onboarding completed'

        WHEN NEW.status = 'cancelled'
          THEN NEW.cancellation_reason

        ELSE NULL
      END;

    INSERT INTO workforce.hr_onboarding_status_history (
      onboarding_id,
      old_status,
      new_status,
      changed_by,
      change_note
    )
    VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      v_changed_by,
      v_note
    );
  END IF;

  RETURN NEW;
END;
$$;


CREATE TRIGGER trg_hr_onboarding_status_history
AFTER INSERT OR UPDATE OF status
ON workforce.hr_onboarding
FOR EACH ROW
EXECUTE FUNCTION workforce.record_onboarding_status_history();


-- ============================================================
-- 8. CONTROLLED JOINING-DATE UPDATE
--
-- Only updates global.users.joined_at.
-- Does not grant broad UPDATE access to global.users.
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.update_joining_date(
  p_user_id uuid,
  p_joined_at date,
  p_change_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_actor_user_id uuid;
  v_old_joined_at date;
BEGIN
  IF NOT workforce.can_manage_employment() THEN
    RAISE EXCEPTION
      'Not authorized to create or edit joining dates';
  END IF;

  v_actor_user_id := workforce.my_user_id();

  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID is required';
  END IF;

  IF p_joined_at IS NULL THEN
    RAISE EXCEPTION 'Joining date is required';
  END IF;

  IF p_change_reason IS NULL
     OR btrim(p_change_reason) = '' THEN
    RAISE EXCEPTION 'Joining-date change reason is required';
  END IF;

  SELECT gu.joined_at
  INTO v_old_joined_at
  FROM global.users gu
  WHERE gu.id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Global user not found';
  END IF;

  IF v_old_joined_at IS NOT DISTINCT FROM p_joined_at THEN
    RETURN;
  END IF;

  -- Migration 003 adds attendance tables.
  -- This dynamic check prevents moving joining date after
  -- already-existing attendance records once migration 003 exists.

  IF to_regclass('workforce.hr_attendance') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM workforce.hr_attendance ha
      WHERE ha.user_id = p_user_id
        AND ha.attendance_date < p_joined_at
    ) THEN
      RAISE EXCEPTION
        'Joining date cannot be moved after existing attendance dates';
    END IF;
  END IF;

  UPDATE global.users
  SET
    joined_at = p_joined_at,
    updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO workforce.joining_date_audit (
    user_id,
    old_joined_at,
    new_joined_at,
    change_reason,
    changed_by
  )
  VALUES (
    p_user_id,
    v_old_joined_at,
    p_joined_at,
    btrim(p_change_reason),
    v_actor_user_id
  );
END;
$$;


-- ============================================================
-- 9. CREATE ONBOARDING FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.create_hr_onboarding(
  p_user_id uuid,
  p_joined_at date,
  p_reporting_manager_user_id uuid DEFAULT NULL,
  p_probation_required boolean DEFAULT false,
  p_probation_duration_days integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_actor_user_id uuid;
  v_onboarding_id uuid;
BEGIN
  IF NOT workforce.can_manage_onboarding() THEN
    RAISE EXCEPTION 'Not authorized to create onboarding';
  END IF;

  v_actor_user_id := workforce.my_user_id();

  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Onboarding user is required';
  END IF;

  IF p_joined_at IS NULL THEN
    RAISE EXCEPTION 'Joining date is required';
  END IF;

  IF p_reporting_manager_user_id = p_user_id THEN
    RAISE EXCEPTION
      'A user cannot be their own reporting manager';
  END IF;

  IF p_probation_required
     AND (
       p_probation_duration_days IS NULL
       OR p_probation_duration_days <= 0
     ) THEN
    RAISE EXCEPTION
      'Positive probation duration is required';
  END IF;

  IF NOT p_probation_required
     AND p_probation_duration_days IS NOT NULL THEN
    RAISE EXCEPTION
      'Probation duration must be null when probation is not required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM global.users gu
    WHERE gu.id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Onboarding user does not exist';
  END IF;

  IF p_reporting_manager_user_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM global.users gu
       WHERE gu.id = p_reporting_manager_user_id
         AND lower(gu.status::text) = 'active'
     ) THEN
    RAISE EXCEPTION
      'Reporting manager does not exist or is inactive';
  END IF;

  INSERT INTO workforce.hr_onboarding (
    user_id,
    joined_at,
    reporting_manager_user_id,
    probation_required,
    probation_duration_days,
    status,
    created_by,
    updated_by
  )
  VALUES (
    p_user_id,
    p_joined_at,
    p_reporting_manager_user_id,
    p_probation_required,
    p_probation_duration_days,
    'draft',
    v_actor_user_id,
    v_actor_user_id
  )
  RETURNING id
  INTO v_onboarding_id;

  RETURN v_onboarding_id;
END;
$$;


-- ============================================================
-- 10. START ONBOARDING FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.start_hr_onboarding(
  p_onboarding_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_actor_user_id uuid;
BEGIN
  IF NOT workforce.can_manage_onboarding() THEN
    RAISE EXCEPTION 'Not authorized to start onboarding';
  END IF;

  v_actor_user_id := workforce.my_user_id();

  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  UPDATE workforce.hr_onboarding
  SET
    status = 'in_progress',
    updated_by = v_actor_user_id,
    updated_at = now()
  WHERE id = p_onboarding_id
    AND status = 'draft';

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Draft onboarding record not found';
  END IF;
END;
$$;


-- ============================================================
-- 11. CANCEL ONBOARDING FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.cancel_hr_onboarding(
  p_onboarding_id uuid,
  p_cancellation_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_actor_user_id uuid;
BEGIN
  IF NOT workforce.can_manage_onboarding() THEN
    RAISE EXCEPTION 'Not authorized to cancel onboarding';
  END IF;

  v_actor_user_id := workforce.my_user_id();

  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  IF p_cancellation_reason IS NULL
     OR btrim(p_cancellation_reason) = '' THEN
    RAISE EXCEPTION 'Cancellation reason is required';
  END IF;

  UPDATE workforce.hr_onboarding
  SET
    status = 'cancelled',
    cancelled_by = v_actor_user_id,
    cancelled_at = now(),
    cancellation_reason = btrim(p_cancellation_reason),
    updated_by = v_actor_user_id,
    updated_at = now()
  WHERE id = p_onboarding_id
    AND status IN ('draft', 'in_progress');

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Open onboarding record not found';
  END IF;
END;
$$;


-- ============================================================
-- 12. COMPLETE ONBOARDING FUNCTION
--
-- Transactionally:
--   1. Locks onboarding record
--   2. Updates global joining date
--   3. Updates global reporting manager
--   4. Creates/updates employment details
--   5. Marks onboarding completed
--
-- Migration 004 adds probation records and will extend this
-- function to create probation automatically.
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.complete_hr_onboarding(
  p_onboarding_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_actor_user_id uuid;
  v_onboarding workforce.hr_onboarding%ROWTYPE;
BEGIN
  IF NOT workforce.can_manage_onboarding() THEN
    RAISE EXCEPTION 'Not authorized to complete onboarding';
  END IF;

  v_actor_user_id := workforce.my_user_id();

  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  SELECT *
  INTO v_onboarding
  FROM workforce.hr_onboarding
  WHERE id = p_onboarding_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Onboarding record not found';
  END IF;

  IF v_onboarding.status NOT IN ('draft', 'in_progress') THEN
    RAISE EXCEPTION
      'Only draft or in-progress onboarding can be completed';
  END IF;

  IF v_onboarding.reporting_manager_user_id =
     v_onboarding.user_id THEN
    RAISE EXCEPTION
      'A user cannot be their own reporting manager';
  END IF;

  IF v_onboarding.reporting_manager_user_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM global.users gu
       WHERE gu.id =
         v_onboarding.reporting_manager_user_id
         AND lower(gu.status::text) = 'active'
     ) THEN
    RAISE EXCEPTION
      'Reporting manager does not exist or is inactive';
  END IF;

  PERFORM workforce.update_joining_date(
    v_onboarding.user_id,
    v_onboarding.joined_at,
    'Workforce onboarding completion'
  );

  UPDATE global.users
  SET
    manager_user_id =
      v_onboarding.reporting_manager_user_id,
    updated_at = now()
  WHERE id = v_onboarding.user_id;

  INSERT INTO workforce.employment_details (
    user_id,
    probation_required,
    probation_duration_days,
    employment_status,
    created_by,
    updated_by
  )
  VALUES (
    v_onboarding.user_id,
    v_onboarding.probation_required,
    v_onboarding.probation_duration_days,
    'active',
    v_actor_user_id,
    v_actor_user_id
  )
  ON CONFLICT (user_id)
  DO UPDATE SET
    probation_required =
      EXCLUDED.probation_required,

    probation_duration_days =
      EXCLUDED.probation_duration_days,

    employment_status = 'active',

    updated_by = v_actor_user_id,

    updated_at = now();

  UPDATE workforce.hr_onboarding
  SET
    status = 'completed',
    completed_by = v_actor_user_id,
    completed_at = now(),
    updated_by = v_actor_user_id,
    updated_at = now()
  WHERE id = p_onboarding_id;

  -- Notifications are added in migration 005.
  -- Probation creation is added in migration 004.
END;
$$;


-- ============================================================
-- 13. ENABLE AND FORCE RLS
-- ============================================================

ALTER TABLE workforce.joining_date_audit
ENABLE ROW LEVEL SECURITY;

ALTER TABLE workforce.employment_details
ENABLE ROW LEVEL SECURITY;

ALTER TABLE workforce.hr_onboarding
ENABLE ROW LEVEL SECURITY;

ALTER TABLE workforce.hr_onboarding_status_history
ENABLE ROW LEVEL SECURITY;


ALTER TABLE workforce.joining_date_audit
FORCE ROW LEVEL SECURITY;

ALTER TABLE workforce.employment_details
FORCE ROW LEVEL SECURITY;

ALTER TABLE workforce.hr_onboarding
FORCE ROW LEVEL SECURITY;

ALTER TABLE workforce.hr_onboarding_status_history
FORCE ROW LEVEL SECURITY;


-- ============================================================
-- 14. JOINING DATE AUDIT POLICIES
-- ============================================================

CREATE POLICY joining_date_audit_select
ON workforce.joining_date_audit
FOR SELECT
USING (
  workforce.can_manage_employment()
);


-- No direct INSERT, UPDATE or DELETE policies.
-- Records are written only by controlled functions.


-- ============================================================
-- 15. EMPLOYMENT DETAILS POLICIES
-- ============================================================

CREATE POLICY employment_details_select
ON workforce.employment_details
FOR SELECT
USING (
  workforce.can_view_employment_record(user_id)
);


CREATE POLICY employment_details_insert
ON workforce.employment_details
FOR INSERT
WITH CHECK (
  workforce.can_manage_employment()
  AND created_by = workforce.my_user_id()
  AND (
    updated_by IS NULL
    OR updated_by = workforce.my_user_id()
  )
);


CREATE POLICY employment_details_update
ON workforce.employment_details
FOR UPDATE
USING (
  workforce.can_manage_employment()
)
WITH CHECK (
  workforce.can_manage_employment()
  AND updated_by = workforce.my_user_id()
);


-- No DELETE policy.


-- ============================================================
-- 16. ONBOARDING POLICIES
-- ============================================================

CREATE POLICY hr_onboarding_select
ON workforce.hr_onboarding
FOR SELECT
USING (
  workforce.can_manage_onboarding()
);


CREATE POLICY hr_onboarding_insert
ON workforce.hr_onboarding
FOR INSERT
WITH CHECK (
  workforce.can_manage_onboarding()
  AND created_by = workforce.my_user_id()
  AND (
    updated_by IS NULL
    OR updated_by = workforce.my_user_id()
  )
  AND status = 'draft'
  AND completed_by IS NULL
  AND completed_at IS NULL
  AND cancelled_by IS NULL
  AND cancelled_at IS NULL
);


CREATE POLICY hr_onboarding_update
ON workforce.hr_onboarding
FOR UPDATE
USING (
  workforce.can_manage_onboarding()
)
WITH CHECK (
  workforce.can_manage_onboarding()
  AND updated_by = workforce.my_user_id()
);


-- No DELETE policy.


-- ============================================================
-- 17. ONBOARDING HISTORY POLICIES
-- ============================================================

CREATE POLICY hr_onboarding_status_history_select
ON workforce.hr_onboarding_status_history
FOR SELECT
USING (
  workforce.can_manage_onboarding()
);


-- No direct INSERT, UPDATE or DELETE policies.
-- Status history is trigger-generated and append-only.


-- ============================================================
-- 18. PRIVILEGES
-- ============================================================

GRANT USAGE ON SCHEMA workforce
TO authenticated, service_role;


GRANT SELECT
ON workforce.joining_date_audit
TO authenticated;


GRANT SELECT, INSERT
ON workforce.employment_details
TO authenticated;


GRANT UPDATE (
  probation_required,
  probation_duration_days,
  employment_status,
  updated_by
)
ON workforce.employment_details
TO authenticated;


GRANT SELECT, INSERT
ON workforce.hr_onboarding
TO authenticated;


-- Normal authenticated users may edit draft/in-progress details,
-- but cannot directly edit workflow status/completion columns.

GRANT UPDATE (
  joined_at,
  reporting_manager_user_id,
  probation_required,
  probation_duration_days,
  updated_by
)
ON workforce.hr_onboarding
TO authenticated;


GRANT SELECT
ON workforce.hr_onboarding_status_history
TO authenticated;


GRANT ALL PRIVILEGES
ON workforce.joining_date_audit
TO service_role;

GRANT ALL PRIVILEGES
ON workforce.employment_details
TO service_role;

GRANT ALL PRIVILEGES
ON workforce.hr_onboarding
TO service_role;

GRANT ALL PRIVILEGES
ON workforce.hr_onboarding_status_history
TO service_role;


-- ============================================================
-- 19. FUNCTION EXECUTION SECURITY
-- ============================================================

REVOKE ALL
ON FUNCTION workforce.can_manage_employment()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.can_view_employment_record(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.can_manage_onboarding()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.record_onboarding_status_history()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.update_joining_date(
  uuid,
  date,
  text
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.create_hr_onboarding(
  uuid,
  date,
  uuid,
  boolean,
  integer
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.start_hr_onboarding(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.cancel_hr_onboarding(
  uuid,
  text
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.complete_hr_onboarding(uuid)
FROM PUBLIC;


GRANT EXECUTE
ON FUNCTION workforce.can_manage_employment()
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.can_view_employment_record(uuid)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.can_manage_onboarding()
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.update_joining_date(
  uuid,
  date,
  text
)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.create_hr_onboarding(
  uuid,
  date,
  uuid,
  boolean,
  integer
)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.start_hr_onboarding(uuid)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.cancel_hr_onboarding(
  uuid,
  text
)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.complete_hr_onboarding(uuid)
TO authenticated, service_role;


COMMIT;
