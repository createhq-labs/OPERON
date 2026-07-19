BEGIN;

-- ============================================================
-- 008_WORKFORCE_EMPLOYEE_INVITATIONS.SQL
--
-- Adds:
--   workforce.employee_invitations
--   workforce.create_employee_invitation()
--   workforce.revoke_employee_invitation()
--   workforce.consume_employee_invitation()
--
-- Purpose:
--   Self-service signup (Google or password) is not supported. HR creates
--   an employee's full record — role, department, designation, manager,
--   joining date, employment status — BEFORE that person ever logs in.
--   On their first successful authentication (Google or password), the
--   app checks whether their email matches a pending invitation:
--     match    -> automatically create global.users (id = auth.users.id,
--                 the required identity rule) from what HR already
--                 entered — no separate "approve" step, HR already
--                 approved by creating the invitation.
--     no match -> access denied outright ("contact HR"), nothing written.
--   consume_employee_invitation() is the ONLY code path that writes to
--   global.users, and it only ever acts on the calling session's own
--   identity (auth.uid()) — it never accepts a target user id, so it
--   cannot be used to provision anyone but the caller.
--
-- SCHEMA BOUNDARY:
--   public.*    : untouched
--   global.*    : written to ONLY inside consume_employee_invitation(),
--                 and only when a matching invitation exists.
--   workforce.* : owns employee_invitations and the three functions below.
--
-- NOT BUILT HERE (explicitly out of scope): sending the invitation email.
-- An invited person can authenticate via "Continue with Google" with the
-- invited address (Google IS the account-creation step; this migration
-- only gates what happens after), or HR can use Supabase's own dashboard
-- "invite user" feature for password-based access. Note also that Google
-- OAuth will still create a Supabase auth.users row for anyone who clicks
-- the button, invited or not — that's inherent to Supabase-managed OAuth
-- and can't be prevented here; this design only guarantees such a row can
-- never gain a global.users identity without a matching invitation.
--
-- SCHEMA CONFIRMED (live global schema dump, see AUTH_RBAC_SECURITY_AUDIT.md):
--   global.users has NO team_id or business_line column — not modeled
--   here at all (no extra_attributes catch-all this time; add real columns
--   to employee_invitations directly if those fields are ever confirmed).
--   global.users.designation_id IS NOT NULL with no default — required,
--   not optional, see preflight + both functions below.
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
    WHERE table_schema = 'global' AND table_name = 'users' AND column_name = 'designation_id'
  ) THEN
    RAISE EXCEPTION 'global.users.designation_id does not exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'global' AND table_name = 'users' AND column_name = 'manager_user_id'
  ) THEN
    RAISE EXCEPTION 'global.users.manager_user_id does not exist';
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
-- 2. EMPLOYEE INVITATIONS TABLE
-- ============================================================

CREATE TABLE workforce.employee_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  email text NOT NULL CHECK (btrim(email) <> ''),
  full_name text,

  role_id uuid NOT NULL REFERENCES global.roles(id),
  department_id uuid NOT NULL REFERENCES global.departments(id),
  designation_id uuid NOT NULL REFERENCES global.designations(id),
  manager_user_id uuid REFERENCES global.users(id) ON DELETE SET NULL,
  joined_at date NOT NULL,
  employment_status text NOT NULL DEFAULT 'active',

  status text NOT NULL DEFAULT 'pending',

  created_by uuid NOT NULL REFERENCES global.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),

  consumed_at timestamptz,
  -- Set once consume_employee_invitation() links a session — always equal
  -- to the resulting global.users.id (the identity rule), kept explicit
  -- for audit clarity.
  linked_user_id uuid,

  revoked_at timestamptz,
  revoked_by uuid REFERENCES global.users(id) ON DELETE SET NULL,
  revoked_reason text,

  CONSTRAINT employee_invitations_status_check
  CHECK (
    status IN ('pending', 'consumed', 'revoked')
  ),

  CONSTRAINT employee_invitations_employment_status_check
  CHECK (
    employment_status IN (
      'pending', 'active', 'on_leave',
      'offboarding', 'offboarded', 'terminated', 'cancelled'
    )
  ),

  CONSTRAINT employee_invitations_consumed_pair_check
  CHECK (
    (status = 'consumed') = (consumed_at IS NOT NULL AND linked_user_id IS NOT NULL)
  ),

  CONSTRAINT employee_invitations_revoked_pair_check
  CHECK (
    (status = 'revoked') = (revoked_at IS NOT NULL AND revoked_by IS NOT NULL)
  )
);

-- Only one pending invitation per email at a time (case-insensitive) —
-- allows re-inviting the same address after a revoke or consume.
CREATE UNIQUE INDEX idx_employee_invitations_pending_email
ON workforce.employee_invitations (lower(email))
WHERE status = 'pending';

CREATE INDEX idx_employee_invitations_status
ON workforce.employee_invitations(status);


-- ============================================================
-- 3. RLS
-- ============================================================

ALTER TABLE workforce.employee_invitations
ENABLE ROW LEVEL SECURITY;

ALTER TABLE workforce.employee_invitations
FORCE ROW LEVEL SECURITY;

CREATE POLICY employee_invitations_select
ON workforce.employee_invitations
FOR SELECT
USING (
  workforce.can_manage_onboarding()
);

-- No INSERT policy — rows are only ever created by
-- create_employee_invitation().
-- No UPDATE policy — rows are only ever transitioned by
-- revoke_employee_invitation() or consume_employee_invitation().
-- No DELETE policy.


-- ============================================================
-- 4. CREATE EMPLOYEE INVITATION
--
-- The only place a role is ever assigned to a not-yet-provisioned person.
-- Gated on can_manage_onboarding() (Co-Founder/HR Manager/HR Executive),
-- with an additional admin-only check for assigning an HR/founder-tier
-- role itself — mirrors this repo's own precedent (probation's
-- recommend-vs-finalize split, can_finalize_probation() = is_admin()
-- only in 004_workforce_probation_deboarding.sql) and the same fix applied
-- to the previous pending-signup design's decide function.
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.create_employee_invitation(
  p_email text,
  p_full_name text,
  p_role_id uuid,
  p_department_id uuid,
  p_designation_id uuid,
  p_manager_user_id uuid,
  p_joined_at date,
  p_employment_status text DEFAULT 'active'
)
RETURNS workforce.employee_invitations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_actor_user_id uuid;
  v_target_role_name text;
  v_invite workforce.employee_invitations%ROWTYPE;
BEGIN
  IF NOT workforce.can_manage_onboarding() THEN
    RAISE EXCEPTION 'Not authorized to create employee invitations';
  END IF;

  v_actor_user_id := workforce.my_user_id();

  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  IF p_email IS NULL OR btrim(p_email) = '' THEN
    RAISE EXCEPTION 'An email is required';
  END IF;

  IF p_role_id IS NULL THEN
    RAISE EXCEPTION 'A role is required';
  END IF;

  IF p_department_id IS NULL THEN
    RAISE EXCEPTION 'A department is required';
  END IF;

  IF p_designation_id IS NULL THEN
    RAISE EXCEPTION 'A designation is required';
  END IF;

  IF p_joined_at IS NULL THEN
    RAISE EXCEPTION 'A joining date is required';
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

  IF NOT EXISTS (
    SELECT 1 FROM global.designations
    WHERE id = p_designation_id AND department_id = p_department_id
  ) THEN
    RAISE EXCEPTION 'Designation not found for the selected department';
  END IF;

  -- Tier check: can_manage_onboarding() above passes for Co-Founder, HR
  -- Manager, AND HR Executive — the lowest HR tier. Without this, an HR
  -- Executive could invite someone straight into the Co-Founder role.
  SELECT lower(name) INTO v_target_role_name FROM global.roles WHERE id = p_role_id;

  IF v_target_role_name IN ('co-founder', 'hr manager', 'hr executive')
     AND NOT workforce.is_admin() THEN
    RAISE EXCEPTION 'Only an Admin may assign an HR/founder-tier role';
  END IF;

  IF EXISTS (
    SELECT 1 FROM workforce.employee_invitations
    WHERE lower(email) = lower(p_email) AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'A pending invitation already exists for this email — revoke it first to change the details';
  END IF;

  IF EXISTS (
    SELECT 1 FROM global.users WHERE lower(email) = lower(p_email) AND lower(status::text) = 'active'
  ) THEN
    RAISE EXCEPTION 'This email is already a provisioned Workforce account';
  END IF;

  INSERT INTO workforce.employee_invitations (
    email,
    full_name,
    role_id,
    department_id,
    designation_id,
    manager_user_id,
    joined_at,
    employment_status,
    created_by
  )
  VALUES (
    btrim(p_email),
    NULLIF(btrim(COALESCE(p_full_name, '')), ''),
    p_role_id,
    p_department_id,
    p_designation_id,
    p_manager_user_id,
    p_joined_at,
    p_employment_status,
    v_actor_user_id
  )
  RETURNING * INTO v_invite;

  RETURN v_invite;
END;
$$;


-- ============================================================
-- 5. REVOKE EMPLOYEE INVITATION
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.revoke_employee_invitation(
  p_invitation_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS workforce.employee_invitations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_actor_user_id uuid;
  v_invite workforce.employee_invitations%ROWTYPE;
BEGIN
  IF NOT workforce.can_manage_onboarding() THEN
    RAISE EXCEPTION 'Not authorized to revoke employee invitations';
  END IF;

  v_actor_user_id := workforce.my_user_id();

  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  SELECT * INTO v_invite
  FROM workforce.employee_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;

  IF v_invite.status <> 'pending' THEN
    RAISE EXCEPTION 'Only a pending invitation can be revoked';
  END IF;

  UPDATE workforce.employee_invitations
  SET
    status = 'revoked',
    revoked_at = now(),
    revoked_by = v_actor_user_id,
    revoked_reason = NULLIF(btrim(COALESCE(p_reason, '')), '')
  WHERE id = p_invitation_id
  RETURNING * INTO v_invite;

  RETURN v_invite;
END;
$$;


-- ============================================================
-- 6. CONSUME EMPLOYEE INVITATION
--
-- The ONLY code path anywhere that writes to global.users. Callable by any
-- authenticated user, but it only ever acts on auth.uid()'s own identity —
-- it takes no target-user parameter, so it can never be used to provision
-- (or overwrite) anyone else. Idempotent: if the caller already has a
-- global.users row, it's a no-op success.
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.consume_employee_invitation()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce, auth
AS $$
DECLARE
  v_auth_user_id uuid;
  v_email text;
  v_auth_full_name text;
  v_invite workforce.employee_invitations%ROWTYPE;
BEGIN
  v_auth_user_id := auth.uid();

  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'No authenticated session';
  END IF;

  IF EXISTS (SELECT 1 FROM global.users WHERE id = v_auth_user_id) THEN
    RETURN true;
  END IF;

  SELECT
    au.email,
    COALESCE(
      au.raw_user_meta_data ->> 'full_name',
      au.raw_user_meta_data ->> 'name'
    )
  INTO v_email, v_auth_full_name
  FROM auth.users au
  WHERE au.id = v_auth_user_id;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Auth account not found';
  END IF;

  SELECT * INTO v_invite
  FROM workforce.employee_invitations
  WHERE lower(email) = lower(v_email) AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
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
    v_auth_user_id,
    COALESCE(v_auth_full_name, v_invite.full_name, v_email),
    v_email,
    v_invite.role_id,
    v_invite.department_id,
    v_invite.designation_id,
    v_invite.manager_user_id,
    'active',
    v_invite.joined_at
  );

  INSERT INTO workforce.employment_details (
    user_id,
    employment_status,
    created_by
  )
  VALUES (
    v_auth_user_id,
    v_invite.employment_status,
    v_invite.created_by
  );

  UPDATE workforce.employee_invitations
  SET
    status = 'consumed',
    consumed_at = now(),
    linked_user_id = v_auth_user_id
  WHERE id = v_invite.id;

  RETURN true;
END;
$$;


-- ============================================================
-- 7. GRANTS
-- ============================================================

GRANT USAGE ON SCHEMA workforce
TO authenticated, service_role;

GRANT SELECT
ON workforce.employee_invitations
TO authenticated;

GRANT ALL PRIVILEGES
ON workforce.employee_invitations
TO service_role;


REVOKE ALL
ON FUNCTION workforce.create_employee_invitation(
  text, text, uuid, uuid, uuid, uuid, date, text
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.revoke_employee_invitation(uuid, text)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.consume_employee_invitation()
FROM PUBLIC;


GRANT EXECUTE
ON FUNCTION workforce.create_employee_invitation(
  text, text, uuid, uuid, uuid, uuid, date, text
)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.revoke_employee_invitation(uuid, text)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.consume_employee_invitation()
TO authenticated, service_role;


COMMIT;
