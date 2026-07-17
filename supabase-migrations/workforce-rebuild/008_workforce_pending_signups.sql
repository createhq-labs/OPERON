BEGIN;

-- ============================================================
-- 008_WORKFORCE_PENDING_SIGNUPS.SQL
--
-- Adds:
--   workforce.pending_signups
--   workforce.request_signup_verification()
--   workforce.decide_pending_signup()
--
-- Purpose:
--   Google/Supabase Auth sign-in creates an auth.users account but
--   must NEVER by itself create a global.users identity. A first-time
--   sign-in with no matching global.users row registers a pending
--   signup request here instead, notifies HR, and waits. Only HR's
--   explicit approval (via decide_pending_signup) ever inserts into
--   global.users — this is the one and only code path that does so.
--
-- SCHEMA BOUNDARY:
--   public.*    : untouched
--   global.*    : written to ONLY inside decide_pending_signup(),
--                 and only on explicit HR approval. Never by the
--                 browser directly, never on rejection.
--   workforce.* : owns pending_signups and the two functions below.
--
-- SCHEMA CONFIRMED (live global schema dump, see AUTH_RBAC_SECURITY_AUDIT.md):
--   global.users has NO team_id or business_line column — the
--   defensive information_schema checks in decide_pending_signup()
--   below will therefore always no-op on that part of
--   p_extra_attributes on the current schema. Left in place rather
--   than removed: harmless, and picks up those fields automatically
--   if such columns are ever added later without another migration.
--   global.users.designation_id IS NOT NULL with no default — unlike
--   team/business_line this is a required field, not optional, so
--   decide_pending_signup() takes p_designation_id and requires it
--   on approval (see preflight + approval path below).
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

  IF to_regclass('global.designations') IS NULL THEN
    RAISE EXCEPTION 'Required table global.designations does not exist';
  END IF;

  IF to_regclass('workforce.employment_details') IS NULL THEN
    RAISE EXCEPTION 'Required table workforce.employment_details does not exist — apply migration 002 first';
  END IF;

  IF to_regclass('workforce.notifications') IS NULL THEN
    RAISE EXCEPTION 'Required table workforce.notifications does not exist — apply migration 005 first';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'global' AND table_name = 'users' AND column_name = 'id'
  ) THEN
    RAISE EXCEPTION 'global.users.id does not exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'global' AND table_name = 'users' AND column_name = 'role_id'
  ) THEN
    RAISE EXCEPTION 'global.users.role_id does not exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'global' AND table_name = 'users' AND column_name = 'department_id'
  ) THEN
    RAISE EXCEPTION 'global.users.department_id does not exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'global' AND table_name = 'users' AND column_name = 'manager_user_id'
  ) THEN
    RAISE EXCEPTION 'global.users.manager_user_id does not exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'global' AND table_name = 'users' AND column_name = 'designation_id'
  ) THEN
    RAISE EXCEPTION 'global.users.designation_id does not exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'global' AND table_name = 'users' AND column_name = 'status'
  ) THEN
    RAISE EXCEPTION 'global.users.status does not exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'global' AND table_name = 'users' AND column_name = 'joined_at'
  ) THEN
    RAISE EXCEPTION 'global.users.joined_at does not exist — apply migration 002 first';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'global' AND table_name = 'users' AND column_name = 'full_name'
  ) THEN
    RAISE EXCEPTION 'global.users.full_name does not exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'global' AND table_name = 'users' AND column_name = 'email'
  ) THEN
    RAISE EXCEPTION 'global.users.email does not exist';
  END IF;
END $$;


-- ============================================================
-- 2. NOTIFICATION TYPE
--
-- workforce.notifications is owned by this migration set (created in
-- 005), so — unlike global.* — it is safe to extend directly.
-- ============================================================

ALTER TABLE workforce.notifications
DROP CONSTRAINT notifications_type_check;

ALTER TABLE workforce.notifications
ADD CONSTRAINT notifications_type_check
CHECK (
  notification_type IN (
    'onboarding_completed',

    'leave_wfh_submitted',
    'manager_approved',
    'manager_rejected',
    'hr_approved',
    'hr_rejected',
    'leave_wfh_cancelled',

    'probation_30_days_before',
    'probation_7_days_before',
    'probation_review_date',
    'probation_overdue',
    'probation_recommendation_submitted',
    'probation_decision_completed',

    'creator_deboarding_requested',
    'creator_deboarding_approved',
    'creator_deboarding_rejected',
    'deboarding_checklist_completed',

    'document_published',
    'document_version_published',
    'mandatory_acknowledgement_required',
    'resource_published',

    'signup_verification_requested'
  )
);


-- ============================================================
-- 3. PENDING SIGNUPS TABLE
-- ============================================================

CREATE TABLE workforce.pending_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  auth_user_id uuid NOT NULL UNIQUE
    REFERENCES auth.users(id)
    ON DELETE CASCADE,

  email text NOT NULL,
  full_name text,
  avatar_url text,

  status text NOT NULL DEFAULT 'pending',

  requested_at timestamptz NOT NULL DEFAULT now(),

  reviewed_at timestamptz,

  reviewed_by uuid
    REFERENCES global.users(id)
    ON DELETE SET NULL,

  rejection_reason text,

  -- Set once decide_pending_signup() approves — always equal to
  -- auth_user_id in practice (the identity rule), kept explicit for
  -- audit clarity rather than implying identity from status alone.
  provisioned_user_id uuid,

  -- Catch-all for fields not confirmed to exist on global.users yet
  -- (team, business line). Only ever written into global.users if a
  -- matching column is found at call time — see decide_pending_signup().
  extra_attributes jsonb,

  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pending_signups_status_check
  CHECK (
    status IN ('pending', 'approved', 'rejected')
  ),

  CONSTRAINT pending_signups_review_pair_check
  CHECK (
    (
      status = 'pending'
      AND reviewed_at IS NULL
      AND reviewed_by IS NULL
    )
    OR (
      status IN ('approved', 'rejected')
      AND reviewed_at IS NOT NULL
      AND reviewed_by IS NOT NULL
    )
  ),

  CONSTRAINT pending_signups_rejection_reason_check
  CHECK (
    status <> 'rejected'
    OR (rejection_reason IS NOT NULL AND btrim(rejection_reason) <> '')
  )
);

CREATE INDEX idx_pending_signups_status
ON workforce.pending_signups(status);


CREATE TRIGGER trg_pending_signups_updated_at
BEFORE UPDATE
ON workforce.pending_signups
FOR EACH ROW
EXECUTE FUNCTION workforce.set_updated_at();


-- ============================================================
-- 4. RLS
-- ============================================================

ALTER TABLE workforce.pending_signups
ENABLE ROW LEVEL SECURITY;

ALTER TABLE workforce.pending_signups
FORCE ROW LEVEL SECURITY;

CREATE POLICY pending_signups_select
ON workforce.pending_signups
FOR SELECT
USING (
  auth_user_id = auth.uid()
  OR workforce.can_manage_onboarding()
);

-- No INSERT policy — rows are only ever created by
-- request_signup_verification().
-- No UPDATE policy — rows are only ever transitioned by
-- decide_pending_signup().
-- No DELETE policy.


-- ============================================================
-- 5. REQUEST SIGNUP VERIFICATION
--
-- Called once by the browser right after a Google/Supabase sign-in
-- resolves to "authenticated, but no global.users row exists". Reads
-- the caller's own auth.users row server-side for email/name/avatar —
-- never trusts client-supplied values, so a signed-in user cannot
-- spoof someone else's name/email into the HR review queue.
--
-- Idempotent: a repeat call while status='pending' is a no-op. A
-- repeat call after status='rejected' does NOT reopen it — rejected
-- stays rejected until HR acts again (a deliberate product decision,
-- not an oversight) — HR must explicitly re-invite via a separate
-- action if a rejection was made in error.
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.request_signup_verification()
RETURNS workforce.pending_signups
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce, auth
AS $$
DECLARE
  v_auth_user_id uuid;
  v_email text;
  v_full_name text;
  v_avatar_url text;
  v_signup workforce.pending_signups%ROWTYPE;
  v_hr_user_ids uuid[];
BEGIN
  v_auth_user_id := auth.uid();

  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'No authenticated session';
  END IF;

  IF EXISTS (
    SELECT 1 FROM global.users gu
    WHERE gu.id = v_auth_user_id
      AND lower(gu.status::text) = 'active'
  ) THEN
    RAISE EXCEPTION 'This account is already provisioned';
  END IF;

  SELECT
    au.email,
    COALESCE(
      au.raw_user_meta_data ->> 'full_name',
      au.raw_user_meta_data ->> 'name'
    ),
    au.raw_user_meta_data ->> 'avatar_url'
  INTO v_email, v_full_name, v_avatar_url
  FROM auth.users au
  WHERE au.id = v_auth_user_id;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Auth account not found';
  END IF;

  INSERT INTO workforce.pending_signups (
    auth_user_id,
    email,
    full_name,
    avatar_url
  )
  VALUES (
    v_auth_user_id,
    v_email,
    v_full_name,
    v_avatar_url
  )
  ON CONFLICT (auth_user_id) DO NOTHING;

  SELECT *
  INTO v_signup
  FROM workforce.pending_signups
  WHERE auth_user_id = v_auth_user_id;

  -- Only notify HR the first time a request is actually created, not
  -- on every idempotent re-call — a fresh row's requested_at will be
  -- (effectively) now(); use a tight window rather than a separate
  -- "notified" flag to keep this function simple.
  IF v_signup.status = 'pending'
     AND v_signup.requested_at > (now() - interval '5 seconds') THEN
    v_hr_user_ids := workforce.active_user_ids_for_roles(
      ARRAY['co-founder', 'hr manager', 'hr executive']
    );

    PERFORM workforce.create_notification(
      'signup_verification_requested',
      'New sign-in awaiting verification',
      COALESCE(v_full_name, v_email) || ' signed in and is awaiting HR verification before Workforce access is granted.',
      NULL,
      'pending_signup',
      v_signup.id,
      '/workforce/signups',
      jsonb_build_object('email', v_email),
      v_hr_user_ids,
      NULL
    );
  END IF;

  RETURN v_signup;
END;
$$;


-- ============================================================
-- 6. DECIDE PENDING SIGNUP
--
-- The ONLY code path anywhere that writes to global.users. Runs only
-- after an explicit HR call, gated on can_manage_onboarding() — which
-- already resolves to false for any caller with no global.users row,
-- since the identity join it depends on simply matches nothing. That
-- check is the primary enforcement point (same pattern as
-- decide_probation/decide_creator_deboarding elsewhere in this
-- migration set); the absence of any INSERT/UPDATE grant on
-- pending_signups itself (see grants below) is the second,
-- independent layer.
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.decide_pending_signup(
  p_request_id uuid,
  p_approved boolean,
  p_role_id uuid DEFAULT NULL,
  p_department_id uuid DEFAULT NULL,
  p_manager_user_id uuid DEFAULT NULL,
  p_joined_at date DEFAULT NULL,
  p_employment_status text DEFAULT 'active',
  p_reason text DEFAULT NULL,
  p_extra_attributes jsonb DEFAULT NULL,
  p_designation_id uuid DEFAULT NULL
)
RETURNS workforce.pending_signups
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_actor_user_id uuid;
  v_signup workforce.pending_signups%ROWTYPE;
  v_has_team_column boolean;
  v_has_business_line_column boolean;
  v_target_role_name text;
BEGIN
  IF NOT workforce.can_manage_onboarding() THEN
    RAISE EXCEPTION 'Not authorized to review signup requests';
  END IF;

  v_actor_user_id := workforce.my_user_id();

  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  SELECT *
  INTO v_signup
  FROM workforce.pending_signups
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending signup request not found';
  END IF;

  IF v_signup.status <> 'pending' THEN
    RAISE EXCEPTION 'This request has already been decided';
  END IF;

  IF NOT p_approved THEN
    IF p_reason IS NULL OR btrim(p_reason) = '' THEN
      RAISE EXCEPTION 'A rejection reason is required';
    END IF;

    UPDATE workforce.pending_signups
    SET
      status = 'rejected',
      reviewed_at = now(),
      reviewed_by = v_actor_user_id,
      rejection_reason = btrim(p_reason)
    WHERE id = p_request_id
    RETURNING * INTO v_signup;

    RETURN v_signup;
  END IF;

  -- Approval path — every field below is something HR must supply
  -- before Workforce access is granted.
  IF p_role_id IS NULL THEN
    RAISE EXCEPTION 'A role is required to approve this request';
  END IF;

  IF p_department_id IS NULL THEN
    RAISE EXCEPTION 'A department is required to approve this request';
  END IF;

  IF p_joined_at IS NULL THEN
    RAISE EXCEPTION 'A joining date is required to approve this request';
  END IF;

  IF p_employment_status IS NULL
     OR p_employment_status NOT IN (
       'pending', 'active', 'on_leave',
       'offboarding', 'offboarded', 'terminated', 'cancelled'
     ) THEN
    RAISE EXCEPTION 'Employment status is invalid';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM global.roles WHERE id = p_role_id) THEN
    RAISE EXCEPTION 'Role not found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM global.departments WHERE id = p_department_id) THEN
    RAISE EXCEPTION 'Department not found';
  END IF;

  -- global.users.designation_id is NOT NULL with no default (confirmed
  -- live schema) — unlike team_id/business_line this is required, not
  -- optional, so it must be supplied and valid before the INSERT below.
  IF p_designation_id IS NULL THEN
    RAISE EXCEPTION 'A designation is required to approve this request';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM global.designations
    WHERE id = p_designation_id AND department_id = p_department_id
  ) THEN
    RAISE EXCEPTION 'Designation not found for the selected department';
  END IF;

  -- Tier check: can_manage_onboarding() above passes for Co-Founder, HR
  -- Manager, AND HR Executive — the lowest HR tier. Without this, an HR
  -- Executive could approve a signup with p_role_id set to Co-Founder (or
  -- any other HR/founder-tier role) and mint a peer or superior identity.
  -- Mirrors this repo's own precedent: probation's low-stakes
  -- submit_probation_recommendation() is open to all HR, but its high-stakes
  -- decide_probation() is gated behind can_finalize_probation() = is_admin()
  -- only (004_workforce_probation_deboarding.sql). Same split here: only an
  -- Admin may assign a role that itself carries HR/founder authority.
  SELECT lower(name) INTO v_target_role_name FROM global.roles WHERE id = p_role_id;

  IF v_target_role_name IN ('co-founder', 'hr manager', 'hr executive')
     AND NOT workforce.is_admin() THEN
    RAISE EXCEPTION 'Only an Admin may assign an HR/founder-tier role';
  END IF;

  INSERT INTO global.users (
    id,
    full_name,
    email,
    role_id,
    department_id,
    designation_id,
    manager_user_id,
    status,
    joined_at
  )
  VALUES (
    v_signup.auth_user_id,
    COALESCE(v_signup.full_name, v_signup.email),
    v_signup.email,
    p_role_id,
    p_department_id,
    p_designation_id,
    p_manager_user_id,
    'active',
    p_joined_at
  );

  INSERT INTO workforce.employment_details (
    user_id,
    employment_status,
    created_by
  )
  VALUES (
    v_signup.auth_user_id,
    p_employment_status,
    v_actor_user_id
  );

  -- Team / business line: only written if the live global.users
  -- schema actually has a matching column (see file header). Silently
  -- skipped otherwise — approval must not fail over an unconfirmed,
  -- optional field.
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'global' AND table_name = 'users' AND column_name = 'team_id'
  ) INTO v_has_team_column;

  IF v_has_team_column
     AND p_extra_attributes IS NOT NULL
     AND p_extra_attributes ? 'team_id' THEN
    EXECUTE format(
      'UPDATE global.users SET team_id = %L WHERE id = %L',
      (p_extra_attributes ->> 'team_id')::uuid,
      v_signup.auth_user_id
    );
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'global' AND table_name = 'users' AND column_name = 'business_line'
  ) INTO v_has_business_line_column;

  IF v_has_business_line_column
     AND p_extra_attributes IS NOT NULL
     AND p_extra_attributes ? 'business_line' THEN
    EXECUTE format(
      'UPDATE global.users SET business_line = %L WHERE id = %L',
      p_extra_attributes ->> 'business_line',
      v_signup.auth_user_id
    );
  END IF;

  UPDATE workforce.pending_signups
  SET
    status = 'approved',
    reviewed_at = now(),
    reviewed_by = v_actor_user_id,
    provisioned_user_id = v_signup.auth_user_id,
    extra_attributes = p_extra_attributes
  WHERE id = p_request_id
  RETURNING * INTO v_signup;

  RETURN v_signup;
END;
$$;


-- ============================================================
-- 7. GRANTS
-- ============================================================

GRANT USAGE ON SCHEMA workforce
TO authenticated, service_role;

GRANT SELECT
ON workforce.pending_signups
TO authenticated;

GRANT ALL PRIVILEGES
ON workforce.pending_signups
TO service_role;


REVOKE ALL
ON FUNCTION workforce.request_signup_verification()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.decide_pending_signup(
  uuid, boolean, uuid, uuid, uuid, date, text, text, jsonb, uuid
)
FROM PUBLIC;


GRANT EXECUTE
ON FUNCTION workforce.request_signup_verification()
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.decide_pending_signup(
  uuid, boolean, uuid, uuid, uuid, date, text, text, jsonb, uuid
)
TO authenticated, service_role;


COMMIT;
