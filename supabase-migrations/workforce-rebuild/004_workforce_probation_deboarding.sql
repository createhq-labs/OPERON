BEGIN;

-- ============================================================
-- 004.1_WORKFORCE_PROBATION.SQL
--
-- Adds:
--   workforce.hr_probation
--   workforce.hr_probation_notes
--   workforce.hr_probation_status_history
--   workforce.hr_probation_reminder_log
--
-- Supports:
--   Automatic creation from completed onboarding
--   HR recommendation: confirm / extend / terminate
--   Co-Founder final decision
--   Immutable extension history
--   Reminder-event foundation
--
-- SCHEMA BOUNDARY:
--   public.*    : untouched
--   global.*    : read/reference only
--   workforce.* : all probation records and workflows
--
-- DATE RULE:
--   start_date = global.users.joined_at
--   end_date   = start_date + probation_duration_days
--   review_date = end_date
-- ============================================================


-- ============================================================
-- 1. PREFLIGHT
-- ============================================================

DO $$
BEGIN
  IF to_regclass('global.users') IS NULL THEN
    RAISE EXCEPTION 'Required table global.users does not exist';
  END IF;

  IF to_regclass('workforce.employment_details') IS NULL THEN
    RAISE EXCEPTION
      'workforce.employment_details is missing. Run migration 002 first.';
  END IF;

  IF to_regclass('workforce.hr_onboarding') IS NULL THEN
    RAISE EXCEPTION
      'workforce.hr_onboarding is missing. Run migration 002 first.';
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

  IF to_regprocedure('workforce.is_hr_manager()') IS NULL THEN
    RAISE EXCEPTION
      'workforce.is_hr_manager() is missing. Run migration 001 first.';
  END IF;

  IF to_regprocedure('workforce.is_creator()') IS NULL THEN
    RAISE EXCEPTION
      'workforce.is_creator() is missing. Run migration 001 first.';
  END IF;
END;
$$;


-- ============================================================
-- 2. PROBATION AUTHORIZATION HELPERS
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.can_manage_probation()
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


CREATE OR REPLACE FUNCTION workforce.can_view_probation_for(
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
    OR workforce.can_manage_probation()
  );
$$;


CREATE OR REPLACE FUNCTION workforce.can_submit_probation_recommendation()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
SELECT
  workforce.is_hr()
  OR workforce.is_admin();
$$;


CREATE OR REPLACE FUNCTION workforce.can_finalize_probation()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
SELECT workforce.is_admin();
$$;


-- ============================================================
-- 3. PROBATION TABLE
-- ============================================================

CREATE TABLE workforce.hr_probation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id uuid NOT NULL
    REFERENCES global.users(id)
    ON DELETE CASCADE,

  onboarding_id uuid
    REFERENCES workforce.hr_onboarding(id)
    ON DELETE SET NULL,

  previous_probation_id uuid
    REFERENCES workforce.hr_probation(id)
    ON DELETE RESTRICT,

  start_date date NOT NULL,
  end_date date NOT NULL,
  review_date date NOT NULL,

  probation_duration_days integer NOT NULL
    CHECK (probation_duration_days > 0),

  extension_duration_days integer,
  extension_reason text,

  status text NOT NULL DEFAULT 'active',

  recommendation text,
  recommendation_reason text,

  recommended_by uuid
    REFERENCES global.users(id)
    ON DELETE SET NULL,

  recommended_at timestamptz,

  final_decision text,
  final_decision_reason text,

  decided_by uuid
    REFERENCES global.users(id)
    ON DELETE SET NULL,

  decided_at timestamptz,

  created_by uuid NOT NULL
    REFERENCES global.users(id)
    ON DELETE RESTRICT,

  updated_by uuid
    REFERENCES global.users(id)
    ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hr_probation_date_order_check
  CHECK (
    start_date <= end_date
    AND review_date = end_date
  ),

  CONSTRAINT hr_probation_status_check
  CHECK (
    status IN (
      'active',
      'review_due',
      'recommendation_submitted',
      'extended',
      'confirmed',
      'terminated',
      'cancelled'
    )
  ),

  CONSTRAINT hr_probation_recommendation_check
  CHECK (
    recommendation IS NULL
    OR recommendation IN (
      'confirm',
      'extend',
      'terminate'
    )
  ),

  CONSTRAINT hr_probation_final_decision_check
  CHECK (
    final_decision IS NULL
    OR final_decision IN (
      'confirmed',
      'extended',
      'terminated',
      'cancelled'
    )
  ),

  CONSTRAINT hr_probation_extension_fields_check
  CHECK (
    (
      previous_probation_id IS NULL
      AND extension_duration_days IS NULL
      AND extension_reason IS NULL
    )
    OR
    (
      previous_probation_id IS NOT NULL
      AND extension_duration_days IS NOT NULL
      AND extension_duration_days > 0
      AND extension_reason IS NOT NULL
      AND btrim(extension_reason) <> ''
    )
  ),

  CONSTRAINT hr_probation_recommendation_state_check
  CHECK (
    (
      recommendation IS NULL
      AND recommendation_reason IS NULL
      AND recommended_by IS NULL
      AND recommended_at IS NULL
    )
    OR
    (
      recommendation IS NOT NULL
      AND recommendation_reason IS NOT NULL
      AND btrim(recommendation_reason) <> ''
      AND recommended_by IS NOT NULL
      AND recommended_at IS NOT NULL
    )
  ),

  CONSTRAINT hr_probation_decision_state_check
  CHECK (
    (
      final_decision IS NULL
      AND final_decision_reason IS NULL
      AND decided_by IS NULL
      AND decided_at IS NULL
    )
    OR
    (
      final_decision IS NOT NULL
      AND final_decision_reason IS NOT NULL
      AND btrim(final_decision_reason) <> ''
      AND decided_by IS NOT NULL
      AND decided_at IS NOT NULL
    )
  )
);


CREATE UNIQUE INDEX uq_hr_probation_one_open_per_user
ON workforce.hr_probation(user_id)
WHERE status IN (
  'active',
  'review_due',
  'recommendation_submitted'
);


CREATE INDEX idx_hr_probation_user
ON workforce.hr_probation(
  user_id,
  created_at DESC
);


CREATE INDEX idx_hr_probation_status
ON workforce.hr_probation(
  status,
  review_date
);


CREATE INDEX idx_hr_probation_review_date
ON workforce.hr_probation(
  review_date,
  status
)
WHERE status IN (
  'active',
  'review_due',
  'recommendation_submitted'
);


CREATE INDEX idx_hr_probation_previous
ON workforce.hr_probation(previous_probation_id)
WHERE previous_probation_id IS NOT NULL;


CREATE INDEX idx_hr_probation_onboarding
ON workforce.hr_probation(onboarding_id)
WHERE onboarding_id IS NOT NULL;


CREATE TRIGGER trg_hr_probation_updated_at
BEFORE UPDATE
ON workforce.hr_probation
FOR EACH ROW
EXECUTE FUNCTION workforce.set_updated_at();


-- ============================================================
-- 4. PROBATION NOTES
-- ============================================================

CREATE TABLE workforce.hr_probation_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  probation_id uuid NOT NULL
    REFERENCES workforce.hr_probation(id)
    ON DELETE CASCADE,

  note text NOT NULL
    CHECK (btrim(note) <> ''),

  note_type text NOT NULL DEFAULT 'general',

  created_by uuid NOT NULL
    REFERENCES global.users(id)
    ON DELETE RESTRICT,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hr_probation_notes_type_check
  CHECK (
    note_type IN (
      'general',
      'performance',
      'attendance',
      'conduct',
      'recommendation',
      'decision',
      'extension'
    )
  )
);


CREATE INDEX idx_hr_probation_notes_probation
ON workforce.hr_probation_notes(
  probation_id,
  created_at DESC
);


CREATE INDEX idx_hr_probation_notes_creator
ON workforce.hr_probation_notes(
  created_by,
  created_at DESC
);


-- ============================================================
-- 5. PROBATION STATUS HISTORY
-- ============================================================

CREATE TABLE workforce.hr_probation_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  probation_id uuid NOT NULL
    REFERENCES workforce.hr_probation(id)
    ON DELETE CASCADE,

  old_status text,
  new_status text NOT NULL,

  changed_by uuid NOT NULL
    REFERENCES global.users(id)
    ON DELETE RESTRICT,

  change_note text,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hr_probation_history_old_status_check
  CHECK (
    old_status IS NULL
    OR old_status IN (
      'active',
      'review_due',
      'recommendation_submitted',
      'extended',
      'confirmed',
      'terminated',
      'cancelled'
    )
  ),

  CONSTRAINT hr_probation_history_new_status_check
  CHECK (
    new_status IN (
      'active',
      'review_due',
      'recommendation_submitted',
      'extended',
      'confirmed',
      'terminated',
      'cancelled'
    )
  )
);


CREATE INDEX idx_hr_probation_history_probation
ON workforce.hr_probation_status_history(
  probation_id,
  created_at DESC
);


CREATE INDEX idx_hr_probation_history_actor
ON workforce.hr_probation_status_history(
  changed_by,
  created_at DESC
);


-- ============================================================
-- 6. PROBATION REMINDER LOG
--
-- Prevents duplicate reminders when a scheduled job runs.
-- Actual Workforce notifications are added in migration 005.
-- ============================================================

CREATE TABLE workforce.hr_probation_reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  probation_id uuid NOT NULL
    REFERENCES workforce.hr_probation(id)
    ON DELETE CASCADE,

  reminder_type text NOT NULL,

  scheduled_for date NOT NULL,

  processed_at timestamptz NOT NULL DEFAULT now(),

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hr_probation_reminder_type_check
  CHECK (
    reminder_type IN (
      '30_days_before',
      '7_days_before',
      'review_date',
      'overdue'
    )
  ),

  UNIQUE (
    probation_id,
    reminder_type,
    scheduled_for
  )
);


CREATE INDEX idx_hr_probation_reminder_schedule
ON workforce.hr_probation_reminder_log(
  scheduled_for,
  reminder_type
);


-- ============================================================
-- 7. STATUS HISTORY TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.record_probation_status_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_actor_user_id uuid;
  v_note text;
BEGIN
  v_actor_user_id := COALESCE(
    workforce.my_user_id(),
    NEW.updated_by,
    NEW.decided_by,
    NEW.recommended_by,
    NEW.created_by
  );

  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION
      'Unable to resolve probation status-change actor';
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO workforce.hr_probation_status_history (
      probation_id,
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
      CASE
        WHEN NEW.previous_probation_id IS NULL
          THEN 'Probation created'
        ELSE 'Probation extension created'
      END
    );

  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    v_note :=
      CASE
        WHEN NEW.status = 'review_due'
          THEN 'Probation review is due'

        WHEN NEW.status = 'recommendation_submitted'
          THEN NEW.recommendation_reason

        WHEN NEW.status = 'extended'
          THEN NEW.final_decision_reason

        WHEN NEW.status = 'confirmed'
          THEN NEW.final_decision_reason

        WHEN NEW.status = 'terminated'
          THEN NEW.final_decision_reason

        WHEN NEW.status = 'cancelled'
          THEN NEW.final_decision_reason

        ELSE NULL
      END;

    INSERT INTO workforce.hr_probation_status_history (
      probation_id,
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
      v_note
    );
  END IF;

  RETURN NEW;
END;
$$;


CREATE TRIGGER trg_hr_probation_status_history
AFTER INSERT OR UPDATE OF status
ON workforce.hr_probation
FOR EACH ROW
EXECUTE FUNCTION workforce.record_probation_status_history();


-- ============================================================
-- 8. PROBATION IMMUTABILITY VALIDATION
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.validate_probation_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, workforce
AS $$
BEGIN
  IF OLD.status IN (
    'extended',
    'confirmed',
    'terminated',
    'cancelled'
  ) THEN
    RAISE EXCEPTION
      'Finalized probation records cannot be modified';
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Probation user cannot be changed';
  END IF;

  IF NEW.start_date IS DISTINCT FROM OLD.start_date THEN
    RAISE EXCEPTION
      'Probation start date cannot be changed';
  END IF;

  IF NEW.end_date IS DISTINCT FROM OLD.end_date THEN
    RAISE EXCEPTION
      'Probation end date cannot be changed';
  END IF;

  IF NEW.review_date IS DISTINCT FROM OLD.review_date THEN
    RAISE EXCEPTION
      'Probation review date cannot be changed';
  END IF;

  IF NEW.probation_duration_days
     IS DISTINCT FROM OLD.probation_duration_days THEN
    RAISE EXCEPTION
      'Probation duration cannot be changed';
  END IF;

  IF NEW.previous_probation_id
     IS DISTINCT FROM OLD.previous_probation_id THEN
    RAISE EXCEPTION
      'Previous probation link cannot be changed';
  END IF;

  RETURN NEW;
END;
$$;


CREATE TRIGGER trg_hr_probation_validate_update
BEFORE UPDATE
ON workforce.hr_probation
FOR EACH ROW
EXECUTE FUNCTION workforce.validate_probation_update();


-- ============================================================
-- 9. CREATE PROBATION
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.create_probation(
  p_user_id uuid,
  p_onboarding_id uuid,
  p_duration_days integer,
  p_created_by uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_joined_at date;
  v_probation_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Probation user is required';
  END IF;

  IF p_duration_days IS NULL
     OR p_duration_days <= 0 THEN
    RAISE EXCEPTION
      'Positive probation duration is required';
  END IF;

  IF p_created_by IS NULL THEN
    RAISE EXCEPTION
      'Probation creator is required';
  END IF;

  SELECT gu.joined_at
  INTO v_joined_at
  FROM global.users gu
  WHERE gu.id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Probation user does not exist';
  END IF;

  IF v_joined_at IS NULL THEN
    RAISE EXCEPTION
      'Joining date must be set before probation creation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM global.users gu
    JOIN global.roles gr
      ON gr.id = gu.role_id
    WHERE gu.id = p_user_id
      AND lower(gr.name::text) = 'creator'
  ) THEN
    RAISE EXCEPTION
      'Creators cannot have employee probation records';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM workforce.hr_probation hp
    WHERE hp.user_id = p_user_id
      AND hp.status IN (
        'active',
        'review_due',
        'recommendation_submitted'
      )
  ) THEN
    RAISE EXCEPTION
      'An open probation record already exists';
  END IF;

  INSERT INTO workforce.hr_probation (
    user_id,
    onboarding_id,
    previous_probation_id,
    start_date,
    end_date,
    review_date,
    probation_duration_days,
    status,
    created_by,
    updated_by
  )
  VALUES (
    p_user_id,
    p_onboarding_id,
    NULL,
    v_joined_at,
    v_joined_at + p_duration_days,
    v_joined_at + p_duration_days,
    p_duration_days,
    'active',
    p_created_by,
    p_created_by
  )
  RETURNING id
  INTO v_probation_id;

  RETURN v_probation_id;
END;
$$;


-- ============================================================
-- 10. ADD PROBATION NOTE
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.add_probation_note(
  p_probation_id uuid,
  p_note text,
  p_note_type text DEFAULT 'general'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_actor_user_id uuid;
  v_note_id uuid;
  v_user_id uuid;
BEGIN
  v_actor_user_id := workforce.my_user_id();

  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  IF p_note IS NULL
     OR btrim(p_note) = '' THEN
    RAISE EXCEPTION 'Probation note is required';
  END IF;

  IF p_note_type NOT IN (
    'general',
    'performance',
    'attendance',
    'conduct',
    'recommendation',
    'decision',
    'extension'
  ) THEN
    RAISE EXCEPTION 'Invalid probation note type';
  END IF;

  SELECT hp.user_id
  INTO v_user_id
  FROM workforce.hr_probation hp
  WHERE hp.id = p_probation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Probation record not found';
  END IF;

  IF NOT (
    workforce.can_manage_probation()
    OR workforce.is_direct_manager_of(v_user_id)
  ) THEN
    RAISE EXCEPTION
      'Not authorized to add this probation note';
  END IF;

  INSERT INTO workforce.hr_probation_notes (
    probation_id,
    note,
    note_type,
    created_by
  )
  VALUES (
    p_probation_id,
    btrim(p_note),
    p_note_type,
    v_actor_user_id
  )
  RETURNING id
  INTO v_note_id;

  RETURN v_note_id;
END;
$$;


-- ============================================================
-- 11. MARK REVIEW DUE
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.mark_probation_reviews_due()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, workforce
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE workforce.hr_probation
  SET
    status = 'review_due',
    updated_at = now()
  WHERE status = 'active'
    AND review_date <= CURRENT_DATE;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END;
$$;


-- ============================================================
-- 12. SUBMIT RECOMMENDATION
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.submit_probation_recommendation(
  p_probation_id uuid,
  p_recommendation text,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_actor_user_id uuid;
  v_probation workforce.hr_probation%ROWTYPE;
BEGIN
  IF NOT workforce.can_submit_probation_recommendation() THEN
    RAISE EXCEPTION
      'Not authorized to submit probation recommendations';
  END IF;

  v_actor_user_id := workforce.my_user_id();

  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  IF p_recommendation NOT IN (
    'confirm',
    'extend',
    'terminate'
  ) THEN
    RAISE EXCEPTION
      'Recommendation must be confirm, extend or terminate';
  END IF;

  IF p_reason IS NULL
     OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION
      'Recommendation reason is required';
  END IF;

  SELECT *
  INTO v_probation
  FROM workforce.hr_probation
  WHERE id = p_probation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Probation record not found';
  END IF;

  IF v_probation.status NOT IN (
    'active',
    'review_due'
  ) THEN
    RAISE EXCEPTION
      'Recommendation cannot be submitted for this probation status';
  END IF;

  UPDATE workforce.hr_probation
  SET
    recommendation = p_recommendation,
    recommendation_reason = btrim(p_reason),
    recommended_by = v_actor_user_id,
    recommended_at = now(),
    status = 'recommendation_submitted',
    updated_by = v_actor_user_id,
    updated_at = now()
  WHERE id = p_probation_id;

  INSERT INTO workforce.hr_probation_notes (
    probation_id,
    note,
    note_type,
    created_by
  )
  VALUES (
    p_probation_id,
    btrim(p_reason),
    'recommendation',
    v_actor_user_id
  );
END;
$$;


-- ============================================================
-- 13. FINAL DECISION
--
-- Only Co-Founder may finalize.
-- Extension creates a new linked probation row.
-- Termination-to-deboarding integration is completed in 004.2.
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.decide_probation(
  p_probation_id uuid,
  p_decision text,
  p_reason text,
  p_extension_duration_days integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_actor_user_id uuid;
  v_probation workforce.hr_probation%ROWTYPE;
  v_new_probation_id uuid;
  v_extension_start_date date;
BEGIN
  IF NOT workforce.can_finalize_probation() THEN
    RAISE EXCEPTION
      'Only Co-Founder may finalize probation decisions';
  END IF;

  v_actor_user_id := workforce.my_user_id();

  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  IF p_decision NOT IN (
    'confirmed',
    'extended',
    'terminated',
    'cancelled'
  ) THEN
    RAISE EXCEPTION
      'Decision must be confirmed, extended, terminated or cancelled';
  END IF;

  IF p_reason IS NULL
     OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Decision reason is required';
  END IF;

  IF p_decision = 'extended'
     AND (
       p_extension_duration_days IS NULL
       OR p_extension_duration_days <= 0
     ) THEN
    RAISE EXCEPTION
      'Positive extension duration is required';
  END IF;

  IF p_decision <> 'extended'
     AND p_extension_duration_days IS NOT NULL THEN
    RAISE EXCEPTION
      'Extension duration is only valid for an extension decision';
  END IF;

  SELECT *
  INTO v_probation
  FROM workforce.hr_probation
  WHERE id = p_probation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Probation record not found';
  END IF;

  IF v_probation.status <> 'recommendation_submitted' THEN
    RAISE EXCEPTION
      'A submitted recommendation is required before final decision';
  END IF;

  IF p_decision = 'extended'
     AND v_probation.recommendation <> 'extend' THEN
    RAISE EXCEPTION
      'Final extension requires an extension recommendation';
  END IF;

  IF p_decision = 'confirmed'
     AND v_probation.recommendation <> 'confirm' THEN
    RAISE EXCEPTION
      'Final confirmation requires a confirmation recommendation';
  END IF;

  IF p_decision = 'terminated'
     AND v_probation.recommendation <> 'terminate' THEN
    RAISE EXCEPTION
      'Final termination requires a termination recommendation';
  END IF;

  UPDATE workforce.hr_probation
  SET
    final_decision = p_decision,
    final_decision_reason = btrim(p_reason),
    decided_by = v_actor_user_id,
    decided_at = now(),
    status = p_decision,
    updated_by = v_actor_user_id,
    updated_at = now()
  WHERE id = p_probation_id;

  INSERT INTO workforce.hr_probation_notes (
    probation_id,
    note,
    note_type,
    created_by
  )
  VALUES (
    p_probation_id,
    btrim(p_reason),
    CASE
      WHEN p_decision = 'extended'
        THEN 'extension'
      ELSE 'decision'
    END,
    v_actor_user_id
  );

  IF p_decision = 'extended' THEN
    v_extension_start_date :=
      v_probation.end_date;

    INSERT INTO workforce.hr_probation (
      user_id,
      onboarding_id,
      previous_probation_id,
      start_date,
      end_date,
      review_date,
      probation_duration_days,
      extension_duration_days,
      extension_reason,
      status,
      created_by,
      updated_by
    )
    VALUES (
      v_probation.user_id,
      v_probation.onboarding_id,
      v_probation.id,
      v_extension_start_date,
      v_extension_start_date +
        p_extension_duration_days,
      v_extension_start_date +
        p_extension_duration_days,
      p_extension_duration_days,
      p_extension_duration_days,
      btrim(p_reason),
      'active',
      v_actor_user_id,
      v_actor_user_id
    )
    RETURNING id
    INTO v_new_probation_id;

    RETURN v_new_probation_id;
  END IF;

  IF p_decision = 'confirmed' THEN
    UPDATE workforce.employment_details
    SET
      probation_required = false,
      probation_duration_days = NULL,
      employment_status = 'active',
      updated_by = v_actor_user_id,
      updated_at = now()
    WHERE user_id = v_probation.user_id;
  END IF;

  IF p_decision = 'terminated' THEN
    UPDATE workforce.employment_details
    SET
      employment_status = 'terminated',
      updated_by = v_actor_user_id,
      updated_at = now()
    WHERE user_id = v_probation.user_id;

    -- Migration 004.2 will create employee deboarding here.
  END IF;

  RETURN NULL;
END;
$$;


-- ============================================================
-- 14. CANCEL PROBATION
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.cancel_probation(
  p_probation_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_actor_user_id uuid;
BEGIN
  IF NOT workforce.can_manage_probation() THEN
    RAISE EXCEPTION
      'Not authorized to cancel probation';
  END IF;

  v_actor_user_id := workforce.my_user_id();

  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  IF p_reason IS NULL
     OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION
      'Cancellation reason is required';
  END IF;

  UPDATE workforce.hr_probation
  SET
    final_decision = 'cancelled',
    final_decision_reason = btrim(p_reason),
    decided_by = v_actor_user_id,
    decided_at = now(),
    status = 'cancelled',
    updated_by = v_actor_user_id,
    updated_at = now()
  WHERE id = p_probation_id
    AND status IN (
      'active',
      'review_due',
      'recommendation_submitted'
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Open probation record not found';
  END IF;
END;
$$;


-- ============================================================
-- 15. REMINDER CANDIDATES
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.get_probation_reminder_candidates(
  p_reference_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  probation_id uuid,
  user_id uuid,
  reminder_type text,
  scheduled_for date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, workforce
AS $$
SELECT
  hp.id,
  hp.user_id,

  CASE
    WHEN hp.review_date - 30 = p_reference_date
      THEN '30_days_before'

    WHEN hp.review_date - 7 = p_reference_date
      THEN '7_days_before'

    WHEN hp.review_date = p_reference_date
      THEN 'review_date'

    WHEN hp.review_date < p_reference_date
      THEN 'overdue'
  END AS reminder_type,

  p_reference_date

FROM workforce.hr_probation hp

WHERE hp.status IN (
    'active',
    'review_due',
    'recommendation_submitted'
  )

  AND (
    hp.review_date - 30 = p_reference_date
    OR hp.review_date - 7 = p_reference_date
    OR hp.review_date = p_reference_date
    OR hp.review_date < p_reference_date
  )

  AND NOT EXISTS (
    SELECT 1
    FROM workforce.hr_probation_reminder_log prl
    WHERE prl.probation_id = hp.id
      AND prl.scheduled_for = p_reference_date
      AND prl.reminder_type =
        CASE
          WHEN hp.review_date - 30 = p_reference_date
            THEN '30_days_before'

          WHEN hp.review_date - 7 = p_reference_date
            THEN '7_days_before'

          WHEN hp.review_date = p_reference_date
            THEN 'review_date'

          WHEN hp.review_date < p_reference_date
            THEN 'overdue'
        END
  );
$$;


-- ============================================================
-- 16. RECORD PROCESSED REMINDER
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.record_probation_reminder(
  p_probation_id uuid,
  p_reminder_type text,
  p_scheduled_for date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, workforce
AS $$
BEGIN
  IF p_reminder_type NOT IN (
    '30_days_before',
    '7_days_before',
    'review_date',
    'overdue'
  ) THEN
    RAISE EXCEPTION
      'Invalid probation reminder type';
  END IF;

  INSERT INTO workforce.hr_probation_reminder_log (
    probation_id,
    reminder_type,
    scheduled_for
  )
  VALUES (
    p_probation_id,
    p_reminder_type,
    p_scheduled_for
  )
  ON CONFLICT (
    probation_id,
    reminder_type,
    scheduled_for
  )
  DO NOTHING;
END;
$$;


-- ============================================================
-- 17. EXTEND ONBOARDING COMPLETION
--
-- Replaces the function from migration 002 so that completing
-- onboarding creates probation automatically when required.
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
    RAISE EXCEPTION
      'Not authorized to complete onboarding';
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

  IF v_onboarding.status NOT IN (
    'draft',
    'in_progress'
  ) THEN
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

  IF v_onboarding.probation_required THEN
    PERFORM workforce.create_probation(
      v_onboarding.user_id,
      v_onboarding.id,
      v_onboarding.probation_duration_days,
      v_actor_user_id
    );
  END IF;

  UPDATE workforce.hr_onboarding
  SET
    status = 'completed',
    completed_by = v_actor_user_id,
    completed_at = now(),
    updated_by = v_actor_user_id,
    updated_at = now()
  WHERE id = p_onboarding_id;

  -- Notification generation is added in migration 005.
END;
$$;


-- ============================================================
-- 18. ENABLE AND FORCE RLS
-- ============================================================

ALTER TABLE workforce.hr_probation
ENABLE ROW LEVEL SECURITY;

ALTER TABLE workforce.hr_probation_notes
ENABLE ROW LEVEL SECURITY;

ALTER TABLE workforce.hr_probation_status_history
ENABLE ROW LEVEL SECURITY;

ALTER TABLE workforce.hr_probation_reminder_log
ENABLE ROW LEVEL SECURITY;


ALTER TABLE workforce.hr_probation
FORCE ROW LEVEL SECURITY;

ALTER TABLE workforce.hr_probation_notes
FORCE ROW LEVEL SECURITY;

ALTER TABLE workforce.hr_probation_status_history
FORCE ROW LEVEL SECURITY;

ALTER TABLE workforce.hr_probation_reminder_log
FORCE ROW LEVEL SECURITY;


-- ============================================================
-- 19. PROBATION POLICIES
-- ============================================================

CREATE POLICY hr_probation_select
ON workforce.hr_probation
FOR SELECT
USING (
  workforce.can_view_probation_for(user_id)
);


-- No direct INSERT policy.
-- Probation is created through controlled functions.


-- No direct UPDATE policy.
-- Recommendations and decisions use controlled functions.


-- No DELETE policy.


-- ============================================================
-- 20. PROBATION NOTE POLICIES
-- ============================================================

CREATE POLICY hr_probation_notes_select
ON workforce.hr_probation_notes
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM workforce.hr_probation hp
    WHERE hp.id = probation_id
      AND (
        workforce.can_manage_probation()
        OR workforce.is_direct_manager_of(hp.user_id)
      )
  )
);


-- Employees do not view internal probation notes.
-- Notes are inserted through add_probation_note().


-- No direct UPDATE or DELETE policy.


-- ============================================================
-- 21. PROBATION HISTORY POLICIES
-- ============================================================

CREATE POLICY hr_probation_status_history_select
ON workforce.hr_probation_status_history
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM workforce.hr_probation hp
    WHERE hp.id = probation_id
      AND workforce.can_view_probation_for(hp.user_id)
  )
);


-- No direct INSERT, UPDATE or DELETE policies.


-- ============================================================
-- 22. REMINDER LOG POLICIES
-- ============================================================

CREATE POLICY hr_probation_reminder_log_select
ON workforce.hr_probation_reminder_log
FOR SELECT
USING (
  workforce.can_manage_probation()
);


-- No direct INSERT, UPDATE or DELETE policies.


-- ============================================================
-- 23. PRIVILEGES
-- ============================================================

GRANT USAGE ON SCHEMA workforce
TO authenticated, service_role;


GRANT SELECT
ON workforce.hr_probation
TO authenticated;


GRANT SELECT
ON workforce.hr_probation_notes
TO authenticated;


GRANT SELECT
ON workforce.hr_probation_status_history
TO authenticated;


GRANT SELECT
ON workforce.hr_probation_reminder_log
TO authenticated;


GRANT ALL PRIVILEGES
ON workforce.hr_probation
TO service_role;

GRANT ALL PRIVILEGES
ON workforce.hr_probation_notes
TO service_role;

GRANT ALL PRIVILEGES
ON workforce.hr_probation_status_history
TO service_role;

GRANT ALL PRIVILEGES
ON workforce.hr_probation_reminder_log
TO service_role;


-- ============================================================
-- 24. FUNCTION SECURITY
-- ============================================================

REVOKE ALL
ON FUNCTION workforce.can_manage_probation()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.can_view_probation_for(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.can_submit_probation_recommendation()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.can_finalize_probation()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.record_probation_status_history()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.validate_probation_update()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.create_probation(
  uuid,
  uuid,
  integer,
  uuid
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.add_probation_note(
  uuid,
  text,
  text
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.mark_probation_reviews_due()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.submit_probation_recommendation(
  uuid,
  text,
  text
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.decide_probation(
  uuid,
  text,
  text,
  integer
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.cancel_probation(
  uuid,
  text
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.get_probation_reminder_candidates(date)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.record_probation_reminder(
  uuid,
  text,
  date
)
FROM PUBLIC;


GRANT EXECUTE
ON FUNCTION workforce.can_manage_probation()
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.can_view_probation_for(uuid)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.add_probation_note(
  uuid,
  text,
  text
)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.submit_probation_recommendation(
  uuid,
  text,
  text
)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.decide_probation(
  uuid,
  text,
  text,
  integer
)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.cancel_probation(
  uuid,
  text
)
TO authenticated, service_role;


-- Internal / scheduled functions.

GRANT EXECUTE
ON FUNCTION workforce.create_probation(
  uuid,
  uuid,
  integer,
  uuid
)
TO service_role;

GRANT EXECUTE
ON FUNCTION workforce.mark_probation_reviews_due()
TO service_role;

GRANT EXECUTE
ON FUNCTION workforce.get_probation_reminder_candidates(date)
TO service_role;

GRANT EXECUTE
ON FUNCTION workforce.record_probation_reminder(
  uuid,
  text,
  date
)
TO service_role;


COMMIT;
Post-execution checks

BEGIN;

-- ============================================================
-- 004.2_WORKFORCE_DEBOARDING.SQL
--
-- Adds:
--   workforce.hr_deboarding
--   workforce.hr_deboarding_checklist_items
--   workforce.hr_deboarding_checklist_audit
--   workforce.hr_deboarding_status_history
--
-- Employee workflow:
--   HR initiates
--   -> HR completes checklist
--   -> employee marked offboarded
--
-- Creator workflow:
--   Creator Acquisition initiates
--   -> authorized lead approves
--   -> lead completes checklist
--   -> HR notified later by migration 005
--   -> creator marked offboarded
--
-- SCHEMA BOUNDARY:
--   public.*    : untouched
--   global.*    : read/reference only
--   workforce.* : all deboarding records
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

  IF to_regclass('workforce.employment_details') IS NULL THEN
    RAISE EXCEPTION
      'workforce.employment_details is missing. Run migration 002 first.';
  END IF;

  IF to_regclass('workforce.hr_probation') IS NULL THEN
    RAISE EXCEPTION
      'workforce.hr_probation is missing. Run migration 004.1 first.';
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

  IF to_regprocedure('workforce.is_creator_acquisition()') IS NULL THEN
    RAISE EXCEPTION
      'workforce.is_creator_acquisition() is missing.';
  END IF;

  IF to_regprocedure('workforce.is_content_lead()') IS NULL THEN
    RAISE EXCEPTION
      'workforce.is_content_lead() is missing.';
  END IF;
END;
$$;


-- ============================================================
-- 2. AUTHORIZATION HELPERS
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.can_manage_employee_deboarding()
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


CREATE OR REPLACE FUNCTION workforce.can_initiate_creator_deboarding()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
SELECT
  workforce.is_admin()
  OR workforce.is_creator_acquisition();
$$;


CREATE OR REPLACE FUNCTION workforce.can_approve_creator_deboarding()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
SELECT
  workforce.is_admin()
  OR workforce.is_content_lead();
$$;


CREATE OR REPLACE FUNCTION workforce.can_view_deboarding()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
SELECT
  workforce.is_admin()
  OR workforce.is_hr()
  OR workforce.is_creator_acquisition()
  OR workforce.is_content_lead();
$$;


CREATE OR REPLACE FUNCTION workforce.get_user_role_name_for_deboarding(
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
  AND gr.status = true
LIMIT 1;
$$;


-- ============================================================
-- 3. DEBOARDING
-- ============================================================

CREATE TABLE workforce.hr_deboarding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id uuid NOT NULL
    REFERENCES global.users(id)
    ON DELETE RESTRICT,

  deboarding_type text NOT NULL,

  source_type text NOT NULL DEFAULT 'manual',

  source_entity_id uuid,

  status text NOT NULL DEFAULT 'draft',

  reason text NOT NULL
    CHECK (btrim(reason) <> ''),

  initiated_by uuid NOT NULL
    REFERENCES global.users(id)
    ON DELETE RESTRICT,

  initiated_at timestamptz NOT NULL DEFAULT now(),

  approved_by uuid
    REFERENCES global.users(id)
    ON DELETE SET NULL,

  approved_at timestamptz,

  rejected_by uuid
    REFERENCES global.users(id)
    ON DELETE SET NULL,

  rejected_at timestamptz,

  rejection_reason text,

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

  CONSTRAINT hr_deboarding_type_check
  CHECK (
    deboarding_type IN (
      'employee',
      'creator'
    )
  ),

  CONSTRAINT hr_deboarding_source_check
  CHECK (
    source_type IN (
      'manual',
      'probation_termination'
    )
  ),

  CONSTRAINT hr_deboarding_status_check
  CHECK (
    status IN (
      'draft',
      'pending_approval',
      'approved',
      'checklist_in_progress',
      'completed',
      'rejected',
      'cancelled'
    )
  ),

  CONSTRAINT hr_deboarding_approval_state_check
  CHECK (
    (
      approved_by IS NULL
      AND approved_at IS NULL
    )
    OR
    (
      approved_by IS NOT NULL
      AND approved_at IS NOT NULL
    )
  ),

  CONSTRAINT hr_deboarding_rejection_state_check
  CHECK (
    (
      rejected_by IS NULL
      AND rejected_at IS NULL
      AND rejection_reason IS NULL
    )
    OR
    (
      rejected_by IS NOT NULL
      AND rejected_at IS NOT NULL
      AND rejection_reason IS NOT NULL
      AND btrim(rejection_reason) <> ''
    )
  ),

  CONSTRAINT hr_deboarding_completion_state_check
  CHECK (
    (
      completed_by IS NULL
      AND completed_at IS NULL
    )
    OR
    (
      completed_by IS NOT NULL
      AND completed_at IS NOT NULL
    )
  ),

  CONSTRAINT hr_deboarding_cancellation_state_check
  CHECK (
    (
      cancelled_by IS NULL
      AND cancelled_at IS NULL
      AND cancellation_reason IS NULL
    )
    OR
    (
      cancelled_by IS NOT NULL
      AND cancelled_at IS NOT NULL
      AND cancellation_reason IS NOT NULL
      AND btrim(cancellation_reason) <> ''
    )
  )
);


CREATE UNIQUE INDEX uq_hr_deboarding_one_open_per_user
ON workforce.hr_deboarding(user_id)
WHERE status IN (
  'draft',
  'pending_approval',
  'approved',
  'checklist_in_progress'
);


CREATE INDEX idx_hr_deboarding_user
ON workforce.hr_deboarding(
  user_id,
  created_at DESC
);


CREATE INDEX idx_hr_deboarding_status
ON workforce.hr_deboarding(
  status,
  deboarding_type,
  created_at DESC
);


CREATE INDEX idx_hr_deboarding_source
ON workforce.hr_deboarding(
  source_type,
  source_entity_id
)
WHERE source_entity_id IS NOT NULL;


CREATE TRIGGER trg_hr_deboarding_updated_at
BEFORE UPDATE
ON workforce.hr_deboarding
FOR EACH ROW
EXECUTE FUNCTION workforce.set_updated_at();


-- ============================================================
-- 4. CHECKLIST ITEMS
-- ============================================================

CREATE TABLE workforce.hr_deboarding_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  deboarding_id uuid NOT NULL
    REFERENCES workforce.hr_deboarding(id)
    ON DELETE CASCADE,

  item_key text NOT NULL,

  label text NOT NULL
    CHECK (btrim(label) <> ''),

  sort_order integer NOT NULL DEFAULT 0,

  is_required boolean NOT NULL DEFAULT true,

  is_completed boolean NOT NULL DEFAULT false,

  completed_by uuid
    REFERENCES global.users(id)
    ON DELETE SET NULL,

  completed_at timestamptz,

  note text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hr_deboarding_checklist_completion_check
  CHECK (
    (
      is_completed = false
      AND completed_by IS NULL
      AND completed_at IS NULL
    )
    OR
    (
      is_completed = true
      AND completed_by IS NOT NULL
      AND completed_at IS NOT NULL
    )
  ),

  UNIQUE (deboarding_id, item_key)
);


CREATE INDEX idx_hr_deboarding_checklist_deboarding
ON workforce.hr_deboarding_checklist_items(
  deboarding_id,
  sort_order
);


CREATE TRIGGER trg_hr_deboarding_checklist_updated_at
BEFORE UPDATE
ON workforce.hr_deboarding_checklist_items
FOR EACH ROW
EXECUTE FUNCTION workforce.set_updated_at();


-- ============================================================
-- 5. CHECKLIST AUDIT
-- ============================================================

CREATE TABLE workforce.hr_deboarding_checklist_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  checklist_item_id uuid NOT NULL
    REFERENCES workforce.hr_deboarding_checklist_items(id)
    ON DELETE RESTRICT,

  deboarding_id uuid NOT NULL
    REFERENCES workforce.hr_deboarding(id)
    ON DELETE RESTRICT,

  old_is_completed boolean,

  new_is_completed boolean NOT NULL,

  old_completed_by uuid
    REFERENCES global.users(id)
    ON DELETE SET NULL,

  new_completed_by uuid
    REFERENCES global.users(id)
    ON DELETE SET NULL,

  old_completed_at timestamptz,
  new_completed_at timestamptz,

  old_note text,
  new_note text,

  changed_by uuid NOT NULL
    REFERENCES global.users(id)
    ON DELETE RESTRICT,

  changed_at timestamptz NOT NULL DEFAULT now()
);


CREATE INDEX idx_hr_deboarding_checklist_audit_item
ON workforce.hr_deboarding_checklist_audit(
  checklist_item_id,
  changed_at DESC
);


CREATE INDEX idx_hr_deboarding_checklist_audit_deboarding
ON workforce.hr_deboarding_checklist_audit(
  deboarding_id,
  changed_at DESC
);


-- ============================================================
-- 6. STATUS HISTORY
-- ============================================================

CREATE TABLE workforce.hr_deboarding_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  deboarding_id uuid NOT NULL
    REFERENCES workforce.hr_deboarding(id)
    ON DELETE CASCADE,

  old_status text,

  new_status text NOT NULL,

  changed_by uuid NOT NULL
    REFERENCES global.users(id)
    ON DELETE RESTRICT,

  change_note text,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hr_deboarding_history_old_status_check
  CHECK (
    old_status IS NULL
    OR old_status IN (
      'draft',
      'pending_approval',
      'approved',
      'checklist_in_progress',
      'completed',
      'rejected',
      'cancelled'
    )
  ),

  CONSTRAINT hr_deboarding_history_new_status_check
  CHECK (
    new_status IN (
      'draft',
      'pending_approval',
      'approved',
      'checklist_in_progress',
      'completed',
      'rejected',
      'cancelled'
    )
  )
);


CREATE INDEX idx_hr_deboarding_history_deboarding
ON workforce.hr_deboarding_status_history(
  deboarding_id,
  created_at DESC
);


-- ============================================================
-- 7. STATUS HISTORY TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.record_deboarding_status_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_actor uuid;
  v_note text;
BEGIN
  v_actor := COALESCE(
    workforce.my_user_id(),
    NEW.completed_by,
    NEW.approved_by,
    NEW.rejected_by,
    NEW.cancelled_by,
    NEW.initiated_by
  );

  IF v_actor IS NULL THEN
    RAISE EXCEPTION
      'Unable to resolve deboarding status actor';
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO workforce.hr_deboarding_status_history (
      deboarding_id,
      old_status,
      new_status,
      changed_by,
      change_note
    )
    VALUES (
      NEW.id,
      NULL,
      NEW.status,
      v_actor,
      'Deboarding created'
    );

  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    v_note :=
      CASE
        WHEN NEW.status = 'pending_approval'
          THEN 'Creator deboarding submitted for lead approval'

        WHEN NEW.status = 'approved'
          THEN 'Deboarding approved'

        WHEN NEW.status = 'checklist_in_progress'
          THEN 'Deboarding checklist started'

        WHEN NEW.status = 'completed'
          THEN 'Deboarding completed'

        WHEN NEW.status = 'rejected'
          THEN NEW.rejection_reason

        WHEN NEW.status = 'cancelled'
          THEN NEW.cancellation_reason

        ELSE NULL
      END;

    INSERT INTO workforce.hr_deboarding_status_history (
      deboarding_id,
      old_status,
      new_status,
      changed_by,
      change_note
    )
    VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      v_actor,
      v_note
    );
  END IF;

  RETURN NEW;
END;
$$;


CREATE TRIGGER trg_hr_deboarding_status_history
AFTER INSERT OR UPDATE OF status
ON workforce.hr_deboarding
FOR EACH ROW
EXECUTE FUNCTION workforce.record_deboarding_status_history();


-- ============================================================
-- 8. CHECKLIST AUDIT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.audit_deboarding_checklist_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_actor uuid;
BEGIN
  v_actor := COALESCE(
    workforce.my_user_id(),
    NEW.completed_by,
    OLD.completed_by
  );

  IF v_actor IS NULL THEN
    RAISE EXCEPTION
      'Unable to resolve checklist audit actor';
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO workforce.hr_deboarding_checklist_audit (
      checklist_item_id,
      deboarding_id,
      old_is_completed,
      new_is_completed,
      old_completed_by,
      new_completed_by,
      old_completed_at,
      new_completed_at,
      old_note,
      new_note,
      changed_by
    )
    VALUES (
      NEW.id,
      NEW.deboarding_id,
      NULL,
      NEW.is_completed,
      NULL,
      NEW.completed_by,
      NULL,
      NEW.completed_at,
      NULL,
      NEW.note,
      v_actor
    );

  ELSIF
    OLD.is_completed IS DISTINCT FROM NEW.is_completed
    OR OLD.completed_by IS DISTINCT FROM NEW.completed_by
    OR OLD.completed_at IS DISTINCT FROM NEW.completed_at
    OR OLD.note IS DISTINCT FROM NEW.note
  THEN
    INSERT INTO workforce.hr_deboarding_checklist_audit (
      checklist_item_id,
      deboarding_id,
      old_is_completed,
      new_is_completed,
      old_completed_by,
      new_completed_by,
      old_completed_at,
      new_completed_at,
      old_note,
      new_note,
      changed_by
    )
    VALUES (
      NEW.id,
      NEW.deboarding_id,
      OLD.is_completed,
      NEW.is_completed,
      OLD.completed_by,
      NEW.completed_by,
      OLD.completed_at,
      NEW.completed_at,
      OLD.note,
      NEW.note,
      v_actor
    );
  END IF;

  RETURN NEW;
END;
$$;


CREATE TRIGGER trg_hr_deboarding_checklist_audit
AFTER INSERT OR UPDATE
ON workforce.hr_deboarding_checklist_items
FOR EACH ROW
EXECUTE FUNCTION workforce.audit_deboarding_checklist_item();


-- ============================================================
-- 9. DEFAULT CHECKLIST CREATION
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.create_default_deboarding_checklist(
  p_deboarding_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, workforce
AS $$
BEGIN
  INSERT INTO workforce.hr_deboarding_checklist_items (
    deboarding_id,
    item_key,
    label,
    sort_order,
    is_required
  )
  VALUES
    (
      p_deboarding_id,
      'groups_access_removed',
      'Groups access removed',
      10,
      true
    ),
    (
      p_deboarding_id,
      'document_access_removed',
      'Document access removed',
      20,
      true
    ),
    (
      p_deboarding_id,
      'email_access_removed',
      'Email access removed',
      30,
      true
    ),
    (
      p_deboarding_id,
      'drive_access_removed',
      'Drive access removed',
      40,
      true
    ),
    (
      p_deboarding_id,
      'company_accounts_removed',
      'Company accounts removed',
      50,
      true
    ),
    (
      p_deboarding_id,
      'assets_data_returned',
      'Assets/data returned',
      60,
      true
    )
  ON CONFLICT (deboarding_id, item_key)
  DO NOTHING;
END;
$$;


-- ============================================================
-- 10. INITIATE EMPLOYEE DEBOARDING
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.initiate_employee_deboarding(
  p_user_id uuid,
  p_reason text,
  p_source_type text DEFAULT 'manual',
  p_source_entity_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_actor uuid;
  v_role_name text;
  v_id uuid;
BEGIN
  IF NOT workforce.can_manage_employee_deboarding() THEN
    RAISE EXCEPTION
      'Not authorized to initiate employee deboarding';
  END IF;

  v_actor := workforce.my_user_id();

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  IF p_reason IS NULL
     OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Deboarding reason is required';
  END IF;

  IF p_source_type NOT IN (
    'manual',
    'probation_termination'
  ) THEN
    RAISE EXCEPTION 'Invalid deboarding source type';
  END IF;

  v_role_name :=
    workforce.get_user_role_name_for_deboarding(p_user_id);

  IF v_role_name IS NULL THEN
    RAISE EXCEPTION 'User or active role not found';
  END IF;

  IF v_role_name = 'creator' THEN
    RAISE EXCEPTION
      'Use creator deboarding workflow for Creator users';
  END IF;

  INSERT INTO workforce.hr_deboarding (
    user_id,
    deboarding_type,
    source_type,
    source_entity_id,
    status,
    reason,
    initiated_by,
    approved_by,
    approved_at
  )
  VALUES (
    p_user_id,
    'employee',
    p_source_type,
    p_source_entity_id,
    'approved',
    btrim(p_reason),
    v_actor,
    v_actor,
    now()
  )
  RETURNING id
  INTO v_id;

  PERFORM workforce.create_default_deboarding_checklist(v_id);

  UPDATE workforce.employment_details
  SET
    employment_status = 'offboarding',
    updated_by = v_actor,
    updated_at = now()
  WHERE user_id = p_user_id;

  RETURN v_id;
END;
$$;


-- ============================================================
-- 11. INITIATE CREATOR DEBOARDING
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.initiate_creator_deboarding(
  p_user_id uuid,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_actor uuid;
  v_role_name text;
  v_id uuid;
BEGIN
  IF NOT workforce.can_initiate_creator_deboarding() THEN
    RAISE EXCEPTION
      'Not authorized to initiate Creator deboarding';
  END IF;

  v_actor := workforce.my_user_id();

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  IF p_reason IS NULL
     OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Deboarding reason is required';
  END IF;

  v_role_name :=
    workforce.get_user_role_name_for_deboarding(p_user_id);

  IF v_role_name <> 'creator' THEN
    RAISE EXCEPTION
      'Creator deboarding requires a Creator user';
  END IF;

  INSERT INTO workforce.hr_deboarding (
    user_id,
    deboarding_type,
    source_type,
    status,
    reason,
    initiated_by
  )
  VALUES (
    p_user_id,
    'creator',
    'manual',
    'pending_approval',
    btrim(p_reason),
    v_actor
  )
  RETURNING id
  INTO v_id;

  PERFORM workforce.create_default_deboarding_checklist(v_id);

  RETURN v_id;
END;
$$;


-- ============================================================
-- 12. APPROVE OR REJECT CREATOR DEBOARDING
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.decide_creator_deboarding(
  p_deboarding_id uuid,
  p_decision text,
  p_reason text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_actor uuid;
  v_record workforce.hr_deboarding%ROWTYPE;
BEGIN
  IF NOT workforce.can_approve_creator_deboarding() THEN
    RAISE EXCEPTION
      'Not authorized to approve Creator deboarding';
  END IF;

  v_actor := workforce.my_user_id();

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
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
  INTO v_record
  FROM workforce.hr_deboarding
  WHERE id = p_deboarding_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deboarding record not found';
  END IF;

  IF v_record.deboarding_type <> 'creator' THEN
    RAISE EXCEPTION
      'This function only handles Creator deboarding';
  END IF;

  IF v_record.status <> 'pending_approval' THEN
    RAISE EXCEPTION
      'Creator deboarding is not awaiting approval';
  END IF;

  IF p_decision = 'rejected' THEN
    UPDATE workforce.hr_deboarding
    SET
      status = 'rejected',
      rejected_by = v_actor,
      rejected_at = now(),
      rejection_reason = btrim(p_reason),
      updated_at = now()
    WHERE id = p_deboarding_id;

    RETURN 'rejected';
  END IF;

  UPDATE workforce.hr_deboarding
  SET
    status = 'approved',
    approved_by = v_actor,
    approved_at = now(),
    updated_at = now()
  WHERE id = p_deboarding_id;

  RETURN 'approved';
END;
$$;


-- ============================================================
-- 13. START CHECKLIST
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.start_deboarding_checklist(
  p_deboarding_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, workforce
AS $$
DECLARE
  v_record workforce.hr_deboarding%ROWTYPE;
BEGIN
  SELECT *
  INTO v_record
  FROM workforce.hr_deboarding
  WHERE id = p_deboarding_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deboarding record not found';
  END IF;

  IF v_record.status <> 'approved' THEN
    RAISE EXCEPTION
      'Only approved deboarding may start checklist work';
  END IF;

  IF v_record.deboarding_type = 'employee'
     AND NOT workforce.can_manage_employee_deboarding() THEN
    RAISE EXCEPTION
      'Not authorized to manage employee deboarding';
  END IF;

  IF v_record.deboarding_type = 'creator'
     AND NOT workforce.can_approve_creator_deboarding() THEN
    RAISE EXCEPTION
      'Not authorized to manage Creator checklist';
  END IF;

  UPDATE workforce.hr_deboarding
  SET
    status = 'checklist_in_progress',
    updated_at = now()
  WHERE id = p_deboarding_id;
END;
$$;


-- ============================================================
-- 14. UPDATE CHECKLIST ITEM
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.set_deboarding_checklist_item(
  p_checklist_item_id uuid,
  p_is_completed boolean,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_actor uuid;
  v_deboarding workforce.hr_deboarding%ROWTYPE;
BEGIN
  v_actor := workforce.my_user_id();

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  SELECT hd.*
  INTO v_deboarding
  FROM workforce.hr_deboarding_checklist_items ci
  JOIN workforce.hr_deboarding hd
    ON hd.id = ci.deboarding_id
  WHERE ci.id = p_checklist_item_id
  FOR UPDATE OF ci;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checklist item not found';
  END IF;

  IF v_deboarding.status NOT IN (
    'approved',
    'checklist_in_progress'
  ) THEN
    RAISE EXCEPTION
      'Checklist cannot be changed in current deboarding status';
  END IF;

  IF v_deboarding.deboarding_type = 'employee'
     AND NOT workforce.can_manage_employee_deboarding() THEN
    RAISE EXCEPTION
      'Not authorized to update employee checklist';
  END IF;

  IF v_deboarding.deboarding_type = 'creator'
     AND NOT workforce.can_approve_creator_deboarding() THEN
    RAISE EXCEPTION
      'Not authorized to update Creator checklist';
  END IF;

  UPDATE workforce.hr_deboarding_checklist_items
  SET
    is_completed = p_is_completed,
    completed_by =
      CASE WHEN p_is_completed THEN v_actor ELSE NULL END,
    completed_at =
      CASE WHEN p_is_completed THEN now() ELSE NULL END,
    note = p_note,
    updated_at = now()
  WHERE id = p_checklist_item_id;

  UPDATE workforce.hr_deboarding
  SET
    status = 'checklist_in_progress',
    updated_at = now()
  WHERE id = v_deboarding.id
    AND status = 'approved';
END;
$$;


-- ============================================================
-- 15. COMPLETE DEBOARDING
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.complete_deboarding(
  p_deboarding_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_actor uuid;
  v_record workforce.hr_deboarding%ROWTYPE;
BEGIN
  v_actor := workforce.my_user_id();

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  SELECT *
  INTO v_record
  FROM workforce.hr_deboarding
  WHERE id = p_deboarding_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deboarding record not found';
  END IF;

  IF v_record.status NOT IN (
    'approved',
    'checklist_in_progress'
  ) THEN
    RAISE EXCEPTION
      'Deboarding is not ready for completion';
  END IF;

  IF v_record.deboarding_type = 'employee'
     AND NOT workforce.can_manage_employee_deboarding() THEN
    RAISE EXCEPTION
      'Not authorized to complete employee deboarding';
  END IF;

  IF v_record.deboarding_type = 'creator'
     AND NOT workforce.can_approve_creator_deboarding() THEN
    RAISE EXCEPTION
      'Not authorized to complete Creator deboarding';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM workforce.hr_deboarding_checklist_items ci
    WHERE ci.deboarding_id = p_deboarding_id
      AND ci.is_required = true
      AND ci.is_completed = false
  ) THEN
    RAISE EXCEPTION
      'All required checklist items must be completed';
  END IF;

  UPDATE workforce.hr_deboarding
  SET
    status = 'completed',
    completed_by = v_actor,
    completed_at = now(),
    updated_at = now()
  WHERE id = p_deboarding_id;

  INSERT INTO workforce.employment_details (
    user_id,
    probation_required,
    probation_duration_days,
    employment_status,
    created_by,
    updated_by
  )
  VALUES (
    v_record.user_id,
    false,
    NULL,
    'offboarded',
    v_actor,
    v_actor
  )
  ON CONFLICT (user_id)
  DO UPDATE SET
    employment_status = 'offboarded',
    probation_required = false,
    probation_duration_days = NULL,
    updated_by = v_actor,
    updated_at = now();

  -- Do not modify global.users.status here.
  -- Do not modify Finance data.
  -- Notification integration is added in migration 005.
END;
$$;


-- ============================================================
-- 16. CANCEL DEBOARDING
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.cancel_deboarding(
  p_deboarding_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_actor uuid;
  v_record workforce.hr_deboarding%ROWTYPE;
BEGIN
  v_actor := workforce.my_user_id();

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  IF p_reason IS NULL
     OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Cancellation reason is required';
  END IF;

  SELECT *
  INTO v_record
  FROM workforce.hr_deboarding
  WHERE id = p_deboarding_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deboarding record not found';
  END IF;

  IF v_record.status NOT IN (
    'draft',
    'pending_approval',
    'approved',
    'checklist_in_progress'
  ) THEN
    RAISE EXCEPTION
      'Finalized deboarding cannot be cancelled';
  END IF;

  IF v_record.deboarding_type = 'employee'
     AND NOT workforce.can_manage_employee_deboarding() THEN
    RAISE EXCEPTION
      'Not authorized to cancel employee deboarding';
  END IF;

  IF v_record.deboarding_type = 'creator'
     AND NOT (
       workforce.can_initiate_creator_deboarding()
       OR workforce.can_approve_creator_deboarding()
     ) THEN
    RAISE EXCEPTION
      'Not authorized to cancel Creator deboarding';
  END IF;

  UPDATE workforce.hr_deboarding
  SET
    status = 'cancelled',
    cancelled_by = v_actor,
    cancelled_at = now(),
    cancellation_reason = btrim(p_reason),
    updated_at = now()
  WHERE id = p_deboarding_id;

  UPDATE workforce.employment_details
  SET
    employment_status = 'active',
    updated_by = v_actor,
    updated_at = now()
  WHERE user_id = v_record.user_id
    AND employment_status = 'offboarding';
END;
$$;


-- ============================================================
-- 17. PROBATION TERMINATION INTEGRATION
--
-- Replaces 004.1 decision function so terminated probation
-- automatically creates employee deboarding.
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.decide_probation(
  p_probation_id uuid,
  p_decision text,
  p_reason text,
  p_extension_duration_days integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_actor uuid;
  v_probation workforce.hr_probation%ROWTYPE;
  v_new_probation_id uuid;
  v_deboarding_id uuid;
  v_extension_start_date date;
BEGIN
  IF NOT workforce.can_finalize_probation() THEN
    RAISE EXCEPTION
      'Only Co-Founder may finalize probation decisions';
  END IF;

  v_actor := workforce.my_user_id();

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  IF p_decision NOT IN (
    'confirmed',
    'extended',
    'terminated',
    'cancelled'
  ) THEN
    RAISE EXCEPTION 'Invalid probation decision';
  END IF;

  IF p_reason IS NULL
     OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Decision reason is required';
  END IF;

  IF p_decision = 'extended'
     AND (
       p_extension_duration_days IS NULL
       OR p_extension_duration_days <= 0
     ) THEN
    RAISE EXCEPTION
      'Positive extension duration is required';
  END IF;

  IF p_decision <> 'extended'
     AND p_extension_duration_days IS NOT NULL THEN
    RAISE EXCEPTION
      'Extension duration is only valid for extension';
  END IF;

  SELECT *
  INTO v_probation
  FROM workforce.hr_probation
  WHERE id = p_probation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Probation record not found';
  END IF;

  IF v_probation.status <> 'recommendation_submitted' THEN
    RAISE EXCEPTION
      'Submitted recommendation is required';
  END IF;

  UPDATE workforce.hr_probation
  SET
    final_decision = p_decision,
    final_decision_reason = btrim(p_reason),
    decided_by = v_actor,
    decided_at = now(),
    status = p_decision,
    updated_by = v_actor,
    updated_at = now()
  WHERE id = p_probation_id;

  INSERT INTO workforce.hr_probation_notes (
    probation_id,
    note,
    note_type,
    created_by
  )
  VALUES (
    p_probation_id,
    btrim(p_reason),
    CASE
      WHEN p_decision = 'extended'
        THEN 'extension'
      ELSE 'decision'
    END,
    v_actor
  );

  IF p_decision = 'extended' THEN
    v_extension_start_date := v_probation.end_date;

    INSERT INTO workforce.hr_probation (
      user_id,
      onboarding_id,
      previous_probation_id,
      start_date,
      end_date,
      review_date,
      probation_duration_days,
      extension_duration_days,
      extension_reason,
      status,
      created_by,
      updated_by
    )
    VALUES (
      v_probation.user_id,
      v_probation.onboarding_id,
      v_probation.id,
      v_extension_start_date,
      v_extension_start_date +
        p_extension_duration_days,
      v_extension_start_date +
        p_extension_duration_days,
      p_extension_duration_days,
      p_extension_duration_days,
      btrim(p_reason),
      'active',
      v_actor,
      v_actor
    )
    RETURNING id
    INTO v_new_probation_id;

    RETURN v_new_probation_id;
  END IF;

  IF p_decision = 'confirmed' THEN
    UPDATE workforce.employment_details
    SET
      probation_required = false,
      probation_duration_days = NULL,
      employment_status = 'active',
      updated_by = v_actor,
      updated_at = now()
    WHERE user_id = v_probation.user_id;
  END IF;

  IF p_decision = 'terminated' THEN
    UPDATE workforce.employment_details
    SET
      employment_status = 'offboarding',
      updated_by = v_actor,
      updated_at = now()
    WHERE user_id = v_probation.user_id;

    v_deboarding_id :=
      workforce.initiate_employee_deboarding(
        v_probation.user_id,
        'Probation terminated: ' || btrim(p_reason),
        'probation_termination',
        p_probation_id
      );

    RETURN v_deboarding_id;
  END IF;

  RETURN NULL;
END;
$$;


-- ============================================================
-- 18. ENABLE AND FORCE RLS
-- ============================================================

ALTER TABLE workforce.hr_deboarding
ENABLE ROW LEVEL SECURITY;

ALTER TABLE workforce.hr_deboarding_checklist_items
ENABLE ROW LEVEL SECURITY;

ALTER TABLE workforce.hr_deboarding_checklist_audit
ENABLE ROW LEVEL SECURITY;

ALTER TABLE workforce.hr_deboarding_status_history
ENABLE ROW LEVEL SECURITY;


ALTER TABLE workforce.hr_deboarding
FORCE ROW LEVEL SECURITY;

ALTER TABLE workforce.hr_deboarding_checklist_items
FORCE ROW LEVEL SECURITY;

ALTER TABLE workforce.hr_deboarding_checklist_audit
FORCE ROW LEVEL SECURITY;

ALTER TABLE workforce.hr_deboarding_status_history
FORCE ROW LEVEL SECURITY;


-- ============================================================
-- 19. RLS POLICIES
-- ============================================================

CREATE POLICY hr_deboarding_select
ON workforce.hr_deboarding
FOR SELECT
USING (
  workforce.can_view_deboarding()
);


CREATE POLICY hr_deboarding_checklist_items_select
ON workforce.hr_deboarding_checklist_items
FOR SELECT
USING (
  workforce.can_view_deboarding()
);


CREATE POLICY hr_deboarding_checklist_audit_select
ON workforce.hr_deboarding_checklist_audit
FOR SELECT
USING (
  workforce.is_admin()
  OR workforce.is_hr()
);


CREATE POLICY hr_deboarding_status_history_select
ON workforce.hr_deboarding_status_history
FOR SELECT
USING (
  workforce.can_view_deboarding()
);


-- No direct INSERT, UPDATE or DELETE policies.
-- All writes occur through controlled functions.


-- ============================================================
-- 20. PRIVILEGES
-- ============================================================

GRANT USAGE ON SCHEMA workforce
TO authenticated, service_role;


GRANT SELECT
ON workforce.hr_deboarding
TO authenticated;

GRANT SELECT
ON workforce.hr_deboarding_checklist_items
TO authenticated;

GRANT SELECT
ON workforce.hr_deboarding_checklist_audit
TO authenticated;

GRANT SELECT
ON workforce.hr_deboarding_status_history
TO authenticated;


GRANT ALL PRIVILEGES
ON workforce.hr_deboarding
TO service_role;

GRANT ALL PRIVILEGES
ON workforce.hr_deboarding_checklist_items
TO service_role;

GRANT ALL PRIVILEGES
ON workforce.hr_deboarding_checklist_audit
TO service_role;

GRANT ALL PRIVILEGES
ON workforce.hr_deboarding_status_history
TO service_role;


-- ============================================================
-- 21. FUNCTION SECURITY
-- ============================================================

REVOKE ALL
ON FUNCTION workforce.can_manage_employee_deboarding()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.can_initiate_creator_deboarding()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.can_approve_creator_deboarding()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.can_view_deboarding()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.get_user_role_name_for_deboarding(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.record_deboarding_status_history()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.audit_deboarding_checklist_item()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.create_default_deboarding_checklist(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.initiate_employee_deboarding(
  uuid,
  text,
  text,
  uuid
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.initiate_creator_deboarding(
  uuid,
  text
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.decide_creator_deboarding(
  uuid,
  text,
  text
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.start_deboarding_checklist(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.set_deboarding_checklist_item(
  uuid,
  boolean,
  text
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.complete_deboarding(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.cancel_deboarding(
  uuid,
  text
)
FROM PUBLIC;


GRANT EXECUTE
ON FUNCTION workforce.can_manage_employee_deboarding()
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.can_initiate_creator_deboarding()
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.can_approve_creator_deboarding()
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.can_view_deboarding()
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.initiate_employee_deboarding(
  uuid,
  text,
  text,
  uuid
)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.initiate_creator_deboarding(
  uuid,
  text
)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.decide_creator_deboarding(
  uuid,
  text,
  text
)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.start_deboarding_checklist(uuid)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.set_deboarding_checklist_item(
  uuid,
  boolean,
  text
)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.complete_deboarding(uuid)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.cancel_deboarding(
  uuid,
  text
)
TO authenticated, service_role;


GRANT EXECUTE
ON FUNCTION workforce.get_user_role_name_for_deboarding(uuid)
TO service_role;

GRANT EXECUTE
ON FUNCTION workforce.create_default_deboarding_checklist(uuid)
TO service_role;


COMMIT;
Post-execution checks
