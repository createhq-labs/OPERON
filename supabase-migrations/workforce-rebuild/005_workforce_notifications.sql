BEGIN;

-- ============================================================
-- 005_WORKFORCE_NOTIFICATIONS.SQL
--
-- Adds:
--   workforce.notifications
--   workforce.notification_recipients
--
-- Notifications:
--   Append-only
--
-- Recipient state:
--   Users see only their own recipient rows
--   Users may only mark their own rows read/unread
--
-- SCHEMA BOUNDARY:
--   public.*    : untouched
--   global.*    : read/reference only
--   workforce.* : notification data and workflow hooks
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

  IF to_regclass('workforce.hr_onboarding') IS NULL THEN
    RAISE EXCEPTION
      'workforce.hr_onboarding is missing. Run migration 002 first.';
  END IF;

  IF to_regclass('workforce.hr_leave_requests') IS NULL THEN
    RAISE EXCEPTION
      'workforce.hr_leave_requests is missing. Run migration 003.2 first.';
  END IF;

  IF to_regclass('workforce.hr_probation') IS NULL THEN
    RAISE EXCEPTION
      'workforce.hr_probation is missing. Run migration 004.1 first.';
  END IF;

  IF to_regclass('workforce.hr_deboarding') IS NULL THEN
    RAISE EXCEPTION
      'workforce.hr_deboarding is missing. Run migration 004.2 first.';
  END IF;

  IF to_regclass('workforce.documents') IS NULL THEN
    RAISE EXCEPTION
      'workforce.documents is missing. Run migration 001 first.';
  END IF;

  IF to_regclass('workforce.resources') IS NULL THEN
    RAISE EXCEPTION
      'workforce.resources is missing. Run migration 001 first.';
  END IF;

  IF to_regprocedure('workforce.my_user_id()') IS NULL THEN
    RAISE EXCEPTION
      'workforce.my_user_id() is missing. Run migration 001 first.';
  END IF;

  IF to_regprocedure('workforce.my_role_name()') IS NULL THEN
    RAISE EXCEPTION
      'workforce.my_role_name() is missing. Run migration 001 first.';
  END IF;

  IF to_regprocedure('workforce.is_admin()') IS NULL THEN
    RAISE EXCEPTION
      'workforce.is_admin() is missing. Run migration 001 first.';
  END IF;

  IF to_regprocedure('workforce.is_hr()') IS NULL THEN
    RAISE EXCEPTION
      'workforce.is_hr() is missing. Run migration 001 first.';
  END IF;

  IF to_regprocedure('workforce.can_manage_content()') IS NULL THEN
    RAISE EXCEPTION
      'workforce.can_manage_content() is missing. Run migration 001 first.';
  END IF;
END;
$$;


-- ============================================================
-- 2. NOTIFICATIONS
-- ============================================================

CREATE TABLE workforce.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  notification_type text NOT NULL,

  title text NOT NULL
    CHECK (btrim(title) <> ''),

  message text NOT NULL
    CHECK (btrim(message) <> ''),

  actor_user_id uuid
    REFERENCES global.users(id)
    ON DELETE SET NULL,

  entity_type text,

  entity_id uuid,

  target_path text,

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),

  expires_at timestamptz,

  CONSTRAINT notifications_type_check
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
      'resource_published'
    )
  ),

  CONSTRAINT notifications_entity_pair_check
  CHECK (
    (
      entity_type IS NULL
      AND entity_id IS NULL
    )
    OR
    (
      entity_type IS NOT NULL
      AND btrim(entity_type) <> ''
      AND entity_id IS NOT NULL
    )
  ),

  CONSTRAINT notifications_expiry_check
  CHECK (
    expires_at IS NULL
    OR expires_at > created_at
  )
);


CREATE INDEX idx_notifications_type_created
ON workforce.notifications(
  notification_type,
  created_at DESC
);


CREATE INDEX idx_notifications_entity
ON workforce.notifications(
  entity_type,
  entity_id,
  created_at DESC
)
WHERE entity_type IS NOT NULL
  AND entity_id IS NOT NULL;


CREATE INDEX idx_notifications_created
ON workforce.notifications(created_at DESC);


CREATE INDEX idx_notifications_expires
ON workforce.notifications(expires_at)
WHERE expires_at IS NOT NULL;


-- ============================================================
-- 3. NOTIFICATION RECIPIENTS
-- ============================================================

CREATE TABLE workforce.notification_recipients (
  notification_id uuid NOT NULL
    REFERENCES workforce.notifications(id)
    ON DELETE CASCADE,

  recipient_user_id uuid NOT NULL
    REFERENCES global.users(id)
    ON DELETE CASCADE,

  read_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (
    notification_id,
    recipient_user_id
  )
);


CREATE INDEX idx_notification_recipients_user_unread
ON workforce.notification_recipients(
  recipient_user_id,
  created_at DESC
)
WHERE read_at IS NULL;


CREATE INDEX idx_notification_recipients_user_created
ON workforce.notification_recipients(
  recipient_user_id,
  created_at DESC
);


-- ============================================================
-- 4. RECIPIENT RESOLUTION HELPERS
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.active_user_ids_for_roles(
  p_role_names text[]
)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global
AS $$
SELECT COALESCE(
  array_agg(DISTINCT gu.id),
  ARRAY[]::uuid[]
)
FROM global.users gu
JOIN global.roles gr
  ON gr.id = gu.role_id
WHERE lower(gu.status::text) = 'active'
  AND gr.status = true
  AND lower(gr.name::text) = ANY (
    SELECT lower(btrim(role_name))
    FROM unnest(p_role_names) AS role_name
  );
$$;


CREATE OR REPLACE FUNCTION workforce.active_user_ids_for_role_ids(
  p_role_ids uuid[]
)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global
AS $$
SELECT COALESCE(
  array_agg(DISTINCT gu.id),
  ARRAY[]::uuid[]
)
FROM global.users gu
JOIN global.roles gr
  ON gr.id = gu.role_id
WHERE lower(gu.status::text) = 'active'
  AND gr.status = true
  AND gu.role_id = ANY(COALESCE(p_role_ids, ARRAY[]::uuid[]));
$$;


CREATE OR REPLACE FUNCTION workforce.active_user_ids_for_departments(
  p_department_ids uuid[]
)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global
AS $$
SELECT COALESCE(
  array_agg(DISTINCT gu.id),
  ARRAY[]::uuid[]
)
FROM global.users gu
WHERE lower(gu.status::text) = 'active'
  AND gu.department_id = ANY(
    COALESCE(p_department_ids, ARRAY[]::uuid[])
  );
$$;


CREATE OR REPLACE FUNCTION workforce.all_active_user_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global
AS $$
SELECT COALESCE(
  array_agg(gu.id),
  ARRAY[]::uuid[]
)
FROM global.users gu
WHERE lower(gu.status::text) = 'active';
$$;


-- ============================================================
-- 5. INTERNAL NOTIFICATION CREATION
--
-- This function is not executable directly by authenticated
-- users. Workflow triggers and controlled publication functions
-- call it.
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.create_notification(
  p_notification_type text,
  p_title text,
  p_message text,
  p_actor_user_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_target_path text,
  p_metadata jsonb,
  p_recipient_user_ids uuid[],
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_notification_id uuid;
  v_recipient_user_id uuid;
BEGIN
  IF p_title IS NULL
     OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'Notification title is required';
  END IF;

  IF p_message IS NULL
     OR btrim(p_message) = '' THEN
    RAISE EXCEPTION 'Notification message is required';
  END IF;

  IF COALESCE(
    array_length(p_recipient_user_ids, 1),
    0
  ) = 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO workforce.notifications (
    notification_type,
    title,
    message,
    actor_user_id,
    entity_type,
    entity_id,
    target_path,
    metadata,
    expires_at
  )
  VALUES (
    p_notification_type,
    btrim(p_title),
    btrim(p_message),
    p_actor_user_id,
    p_entity_type,
    p_entity_id,
    p_target_path,
    COALESCE(p_metadata, '{}'::jsonb),
    p_expires_at
  )
  RETURNING id
  INTO v_notification_id;

  FOREACH v_recipient_user_id IN ARRAY p_recipient_user_ids
  LOOP
    IF v_recipient_user_id IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM global.users gu
         WHERE gu.id = v_recipient_user_id
           AND lower(gu.status::text) = 'active'
       )
    THEN
      INSERT INTO workforce.notification_recipients (
        notification_id,
        recipient_user_id
      )
      VALUES (
        v_notification_id,
        v_recipient_user_id
      )
      ON CONFLICT (
        notification_id,
        recipient_user_id
      )
      DO NOTHING;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM workforce.notification_recipients nr
    WHERE nr.notification_id = v_notification_id
  ) THEN
    DELETE FROM workforce.notifications
    WHERE id = v_notification_id;

    RETURN NULL;
  END IF;

  RETURN v_notification_id;
END;
$$;


-- ============================================================
-- 6. USER READ-STATE FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.mark_notification_read(
  p_notification_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, workforce
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := workforce.my_user_id();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  UPDATE workforce.notification_recipients
  SET read_at = COALESCE(read_at, now())
  WHERE notification_id = p_notification_id
    AND recipient_user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Notification recipient record not found';
  END IF;
END;
$$;


CREATE OR REPLACE FUNCTION workforce.mark_notification_unread(
  p_notification_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, workforce
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := workforce.my_user_id();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  UPDATE workforce.notification_recipients
  SET read_at = NULL
  WHERE notification_id = p_notification_id
    AND recipient_user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Notification recipient record not found';
  END IF;
END;
$$;


CREATE OR REPLACE FUNCTION workforce.mark_all_notifications_read()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, workforce
AS $$
DECLARE
  v_user_id uuid;
  v_count integer;
BEGIN
  v_user_id := workforce.my_user_id();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Active Global user not found';
  END IF;

  UPDATE workforce.notification_recipients
  SET read_at = now()
  WHERE recipient_user_id = v_user_id
    AND read_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END;
$$;


CREATE OR REPLACE FUNCTION workforce.my_unread_notification_count()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, workforce
AS $$
SELECT COUNT(*)
FROM workforce.notification_recipients nr
JOIN workforce.notifications n
  ON n.id = nr.notification_id
WHERE nr.recipient_user_id = workforce.my_user_id()
  AND nr.read_at IS NULL
  AND (
    n.expires_at IS NULL
    OR n.expires_at > now()
  );
$$;


-- ============================================================
-- 7. ONBOARDING NOTIFICATION HOOK
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.notify_onboarding_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, workforce
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status
     AND NEW.status = 'completed' THEN

    PERFORM workforce.create_notification(
      'onboarding_completed',
      'Onboarding completed',
      'Your Workforce onboarding has been completed.',
      NEW.completed_by,
      'hr_onboarding',
      NEW.id,
      '/workforce/profile',
      jsonb_build_object(
        'user_id', NEW.user_id,
        'completed_at', NEW.completed_at
      ),
      ARRAY[NEW.user_id],
      NULL
    );
  END IF;

  RETURN NEW;
END;
$$;


CREATE TRIGGER trg_notify_onboarding_status_change
AFTER UPDATE OF status
ON workforce.hr_onboarding
FOR EACH ROW
EXECUTE FUNCTION workforce.notify_onboarding_status_change();


-- ============================================================
-- 8. LEAVE / WFH NOTIFICATION HOOK
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.notify_leave_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, workforce
AS $$
DECLARE
  v_notification_type text;
  v_title text;
  v_message text;
  v_recipients uuid[];
  v_latest_stage text;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'pending_manager' THEN
    v_notification_type := 'leave_wfh_submitted';
    v_title := 'Leave/WFH request submitted';
    v_message :=
      'A Leave/WFH request requires your manager approval.';
    v_recipients := ARRAY[NEW.current_approver_user_id];

  ELSIF NEW.status = 'manager_approved' THEN
    v_notification_type := 'manager_approved';
    v_title := 'Manager approved request';
    v_message :=
      'Your manager approved your Leave/WFH request.';
    v_recipients := ARRAY[NEW.requester_user_id];

  ELSIF NEW.status = 'pending_hr' THEN
    v_notification_type := 'leave_wfh_submitted';
    v_title := 'Leave/WFH request requires final approval';
    v_message :=
      'A Leave/WFH request requires your final approval.';
    v_recipients := ARRAY[NEW.current_approver_user_id];

  ELSIF NEW.status = 'approved' THEN
    v_notification_type := 'hr_approved';
    v_title := 'Leave/WFH request approved';
    v_message :=
      'Your Leave/WFH request has been approved.';
    v_recipients := ARRAY[NEW.requester_user_id];

  ELSIF NEW.status = 'rejected' THEN
    SELECT ld.decision_stage
    INTO v_latest_stage
    FROM workforce.hr_leave_decisions ld
    WHERE ld.request_id = NEW.id
      AND ld.decision = 'rejected'
    ORDER BY ld.created_at DESC
    LIMIT 1;

    IF v_latest_stage = 'manager' THEN
      v_notification_type := 'manager_rejected';
      v_title := 'Manager rejected request';
      v_message :=
        'Your manager rejected your Leave/WFH request.';
    ELSE
      v_notification_type := 'hr_rejected';
      v_title := 'Leave/WFH request rejected';
      v_message :=
        'Your Leave/WFH request was rejected during final approval.';
    END IF;

    v_recipients := ARRAY[NEW.requester_user_id];

  ELSIF NEW.status = 'cancelled' THEN
    v_notification_type := 'leave_wfh_cancelled';
    v_title := 'Leave/WFH request cancelled';
    v_message :=
      'The Leave/WFH request has been cancelled.';

    v_recipients := ARRAY(
      SELECT DISTINCT recipient_id
      FROM unnest(
        ARRAY[
          NEW.requester_user_id,
          OLD.current_approver_user_id
        ]
      ) AS recipient_id
      WHERE recipient_id IS NOT NULL
    );

  ELSE
    RETURN NEW;
  END IF;

  PERFORM workforce.create_notification(
    v_notification_type,
    v_title,
    v_message,
    workforce.my_user_id(),
    'hr_leave_request',
    NEW.id,
    '/workforce/leave/' || NEW.id::text,
    jsonb_build_object(
      'requester_user_id', NEW.requester_user_id,
      'request_type', NEW.request_type,
      'date_from', NEW.date_from,
      'date_to', NEW.date_to,
      'status', NEW.status
    ),
    v_recipients,
    NULL
  );

  RETURN NEW;
END;
$$;


CREATE TRIGGER trg_notify_leave_status_change
AFTER UPDATE OF status
ON workforce.hr_leave_requests
FOR EACH ROW
EXECUTE FUNCTION workforce.notify_leave_status_change();


-- ============================================================
-- 9. PROBATION NOTIFICATION HOOK
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.notify_probation_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, workforce
AS $$
DECLARE
  v_hr_recipients uuid[];
  v_admin_recipients uuid[];
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'recommendation_submitted' THEN
    v_admin_recipients :=
      workforce.active_user_ids_for_roles(
        ARRAY['Co-Founder']
      );

    PERFORM workforce.create_notification(
      'probation_recommendation_submitted',
      'Probation recommendation submitted',
      'A probation recommendation requires a final decision.',
      NEW.recommended_by,
      'hr_probation',
      NEW.id,
      '/workforce/probation/' || NEW.id::text,
      jsonb_build_object(
        'user_id', NEW.user_id,
        'recommendation', NEW.recommendation,
        'review_date', NEW.review_date
      ),
      v_admin_recipients,
      NULL
    );

  ELSIF NEW.status IN (
    'confirmed',
    'extended',
    'terminated',
    'cancelled'
  ) THEN
    v_hr_recipients :=
      workforce.active_user_ids_for_roles(
        ARRAY[
          'HR Manager',
          'HR Executive'
        ]
      );

    PERFORM workforce.create_notification(
      'probation_decision_completed',
      'Probation decision completed',
      'A final probation decision has been recorded.',
      NEW.decided_by,
      'hr_probation',
      NEW.id,
      '/workforce/probation/' || NEW.id::text,
      jsonb_build_object(
        'user_id', NEW.user_id,
        'decision', NEW.final_decision,
        'status', NEW.status
      ),
      array_cat(
        ARRAY[NEW.user_id],
        v_hr_recipients
      ),
      NULL
    );
  END IF;

  RETURN NEW;
END;
$$;


CREATE TRIGGER trg_notify_probation_status_change
AFTER UPDATE OF status
ON workforce.hr_probation
FOR EACH ROW
EXECUTE FUNCTION workforce.notify_probation_status_change();


-- ============================================================
-- 10. PROBATION REMINDER PROCESSOR
--
-- Intended for service-role / scheduled execution.
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.process_probation_reminders(
  p_reference_date date DEFAULT CURRENT_DATE
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, workforce
AS $$
DECLARE
  v_candidate record;
  v_hr_recipients uuid[];
  v_notification_type text;
  v_title text;
  v_message text;
  v_count integer := 0;
BEGIN
  v_hr_recipients :=
    workforce.active_user_ids_for_roles(
      ARRAY[
        'HR Manager',
        'HR Executive'
      ]
    );

  FOR v_candidate IN
    SELECT *
    FROM workforce.get_probation_reminder_candidates(
      p_reference_date
    )
  LOOP
    v_notification_type :=
      CASE v_candidate.reminder_type
        WHEN '30_days_before'
          THEN 'probation_30_days_before'

        WHEN '7_days_before'
          THEN 'probation_7_days_before'

        WHEN 'review_date'
          THEN 'probation_review_date'

        WHEN 'overdue'
          THEN 'probation_overdue'
      END;

    v_title :=
      CASE v_candidate.reminder_type
        WHEN '30_days_before'
          THEN 'Probation review due in 30 days'

        WHEN '7_days_before'
          THEN 'Probation review due in 7 days'

        WHEN 'review_date'
          THEN 'Probation review is due today'

        WHEN 'overdue'
          THEN 'Probation review is overdue'
      END;

    v_message :=
      CASE v_candidate.reminder_type
        WHEN '30_days_before'
          THEN 'A probation review is due in 30 days.'

        WHEN '7_days_before'
          THEN 'A probation review is due in 7 days.'

        WHEN 'review_date'
          THEN 'A probation review is due today.'

        WHEN 'overdue'
          THEN 'A probation review is overdue.'
      END;

    PERFORM workforce.create_notification(
      v_notification_type,
      v_title,
      v_message,
      NULL,
      'hr_probation',
      v_candidate.probation_id,
      '/workforce/probation/' ||
        v_candidate.probation_id::text,
      jsonb_build_object(
        'user_id', v_candidate.user_id,
        'reminder_type', v_candidate.reminder_type,
        'scheduled_for', v_candidate.scheduled_for
      ),
      v_hr_recipients,
      NULL
    );

    PERFORM workforce.record_probation_reminder(
      v_candidate.probation_id,
      v_candidate.reminder_type,
      v_candidate.scheduled_for
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;


-- ============================================================
-- 11. DEBOARDING NOTIFICATION HOOK
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.notify_deboarding_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, workforce
AS $$
DECLARE
  v_recipients uuid[];
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF NEW.deboarding_type = 'creator'
     AND NEW.status = 'pending_approval' THEN

    v_recipients :=
      workforce.active_user_ids_for_roles(
        ARRAY[
          'Category Lead',
          'IM Team Lead'
        ]
      );

    PERFORM workforce.create_notification(
      'creator_deboarding_requested',
      'Creator deboarding requested',
      'A Creator deboarding request requires lead approval.',
      NEW.initiated_by,
      'hr_deboarding',
      NEW.id,
      '/workforce/deboarding/' || NEW.id::text,
      jsonb_build_object(
        'user_id', NEW.user_id,
        'status', NEW.status
      ),
      v_recipients,
      NULL
    );

  ELSIF NEW.deboarding_type = 'creator'
        AND NEW.status = 'approved' THEN

    v_recipients :=
      workforce.active_user_ids_for_roles(
        ARRAY[
          'HR Manager',
          'HR Executive'
        ]
      );

    PERFORM workforce.create_notification(
      'creator_deboarding_approved',
      'Creator deboarding approved',
      'A Creator deboarding request has been approved.',
      NEW.approved_by,
      'hr_deboarding',
      NEW.id,
      '/workforce/deboarding/' || NEW.id::text,
      jsonb_build_object(
        'user_id', NEW.user_id,
        'approved_at', NEW.approved_at
      ),
      v_recipients,
      NULL
    );

  ELSIF NEW.deboarding_type = 'creator'
        AND NEW.status = 'rejected' THEN

    PERFORM workforce.create_notification(
      'creator_deboarding_rejected',
      'Creator deboarding rejected',
      'The Creator deboarding request was rejected.',
      NEW.rejected_by,
      'hr_deboarding',
      NEW.id,
      '/workforce/deboarding/' || NEW.id::text,
      jsonb_build_object(
        'user_id', NEW.user_id,
        'rejection_reason', NEW.rejection_reason
      ),
      ARRAY[NEW.initiated_by],
      NULL
    );

  ELSIF NEW.status = 'completed' THEN
    v_recipients :=
      workforce.active_user_ids_for_roles(
        ARRAY[
          'HR Manager',
          'HR Executive'
        ]
      );

    PERFORM workforce.create_notification(
      'deboarding_checklist_completed',
      'Deboarding completed',
      'A deboarding checklist has been completed.',
      NEW.completed_by,
      'hr_deboarding',
      NEW.id,
      '/workforce/deboarding/' || NEW.id::text,
      jsonb_build_object(
        'user_id', NEW.user_id,
        'deboarding_type', NEW.deboarding_type,
        'completed_at', NEW.completed_at
      ),
      v_recipients,
      NULL
    );
  END IF;

  RETURN NEW;
END;
$$;


CREATE TRIGGER trg_notify_deboarding_status_change
AFTER UPDATE OF status
ON workforce.hr_deboarding
FOR EACH ROW
EXECUTE FUNCTION workforce.notify_deboarding_status_change();


-- ============================================================
-- 12. DOCUMENT RECIPIENT RESOLUTION
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.document_notification_recipients(
  p_document_id uuid
)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_document workforce.documents%ROWTYPE;
  v_recipients uuid[];
  v_role_ids uuid[];
  v_department_ids uuid[];
BEGIN
  SELECT *
  INTO v_document
  FROM workforce.documents
  WHERE id = p_document_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found';
  END IF;

  IF v_document.visibility_scope = 'global' THEN
    v_recipients := workforce.all_active_user_ids();

  ELSIF v_document.visibility_scope = 'role' THEN
    SELECT COALESCE(
      array_agg(dar.role_id),
      ARRAY[]::uuid[]
    )
    INTO v_role_ids
    FROM workforce.document_allowed_roles dar
    WHERE dar.document_id = p_document_id;

    v_recipients :=
      workforce.active_user_ids_for_role_ids(v_role_ids);

  ELSIF v_document.visibility_scope = 'team' THEN
    SELECT COALESCE(
      array_agg(dad.department_id),
      ARRAY[]::uuid[]
    )
    INTO v_department_ids
    FROM workforce.document_allowed_departments dad
    WHERE dad.document_id = p_document_id;

    v_recipients :=
      workforce.active_user_ids_for_departments(
        v_department_ids
      );

  ELSIF v_document.visibility_scope = 'private' THEN
    SELECT COALESCE(
      array_agg(dau.user_id),
      ARRAY[]::uuid[]
    )
    INTO v_recipients
    FROM workforce.document_assigned_users dau
    WHERE dau.document_id = p_document_id;
  END IF;

  RETURN COALESCE(v_recipients, ARRAY[]::uuid[]);
END;
$$;


-- ============================================================
-- 13. RESOURCE RECIPIENT RESOLUTION
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.resource_notification_recipients(
  p_resource_id uuid
)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, global, workforce
AS $$
DECLARE
  v_resource workforce.resources%ROWTYPE;
  v_recipients uuid[];
  v_role_ids uuid[];
  v_department_ids uuid[];
BEGIN
  SELECT *
  INTO v_resource
  FROM workforce.resources
  WHERE id = p_resource_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Resource not found';
  END IF;

  IF v_resource.visibility_scope = 'global' THEN
    v_recipients := workforce.all_active_user_ids();

  ELSIF v_resource.visibility_scope = 'role' THEN
    SELECT COALESCE(
      array_agg(rar.role_id),
      ARRAY[]::uuid[]
    )
    INTO v_role_ids
    FROM workforce.resource_allowed_roles rar
    WHERE rar.resource_id = p_resource_id;

    v_recipients :=
      workforce.active_user_ids_for_role_ids(v_role_ids);

  ELSIF v_resource.visibility_scope = 'team' THEN
    SELECT COALESCE(
      array_agg(rad.department_id),
      ARRAY[]::uuid[]
    )
    INTO v_department_ids
    FROM workforce.resource_allowed_departments rad
    WHERE rad.resource_id = p_resource_id;

    v_recipients :=
      workforce.active_user_ids_for_departments(
        v_department_ids
      );
  END IF;

  RETURN COALESCE(v_recipients, ARRAY[]::uuid[]);
END;
$$;


-- ============================================================
-- 14. DOCUMENT PUBLICATION NOTIFICATION
--
-- Migration 006 should call this after rendered publication.
-- ============================================================

CREATE OR REPLACE FUNCTION workforce.notify_document_published(
  p_document_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, workforce
AS $$
DECLARE
  v_actor uuid;
  v_document workforce.documents%ROWTYPE;
  v_recipients uuid[];
BEGIN
  IF NOT workforce.can_manage_content() THEN
    RAISE EXCEPTION
      'Not authorized to publish document notifications';
  END IF;

  v_actor := workforce.my_user_id();

  SELECT *
  INTO v_document
  FROM workforce.documents
  WHERE id = p_document_id
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active document not found';
  END IF;

  v_recipients :=
    workforce.document_notification_recipients(
      p_document_id
    );

  RETURN workforce.create_notification(
    'document_published',
    'New document published',
    v_document.title || ' is now available.',
    v_actor,
    'document',
    p_document_id,
    '/documents/' || p_document_id::text,
    jsonb_build_object(
      'title', v_document.title,
      'current_version', v_document.current_version
    ),
    v_recipients,
    NULL
  );
END;
$$;


CREATE OR REPLACE FUNCTION workforce.notify_document_version_published(
  p_document_version_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, workforce
AS $$
DECLARE
  v_actor uuid;
  v_document_id uuid;
  v_document_title text;
  v_version_number integer;
  v_requires_acknowledgement boolean;
  v_recipients uuid[];
  v_notification_type text;
  v_title text;
  v_message text;
BEGIN
  IF NOT workforce.can_manage_content() THEN
    RAISE EXCEPTION
      'Not authorized to publish version notifications';
  END IF;

  v_actor := workforce.my_user_id();

  SELECT
    d.id,
    d.title,
    dv.version_number,
    d.requires_acknowledgement
  INTO
    v_document_id,
    v_document_title,
    v_version_number,
    v_requires_acknowledgement
  FROM workforce.document_versions dv
  JOIN workforce.documents d
    ON d.id = dv.document_id
  WHERE dv.id = p_document_version_id
    AND d.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Active document version not found';
  END IF;

  v_recipients :=
    workforce.document_notification_recipients(
      v_document_id
    );

  IF v_requires_acknowledgement THEN
    v_notification_type :=
      'mandatory_acknowledgement_required';

    v_title := 'Document acknowledgement required';

    v_message :=
      'A new version of ' ||
      v_document_title ||
      ' requires your acknowledgement.';
  ELSE
    v_notification_type :=
      'document_version_published';

    v_title := 'New document version published';

    v_message :=
      'A new version of ' ||
      v_document_title ||
      ' is now available.';
  END IF;

  RETURN workforce.create_notification(
    v_notification_type,
    v_title,
    v_message,
    v_actor,
    'document_version',
    p_document_version_id,
    '/documents/' ||
      v_document_id::text ||
      '/versions/' ||
      p_document_version_id::text,
    jsonb_build_object(
      'document_id', v_document_id,
      'document_title', v_document_title,
      'version_number', v_version_number,
      'requires_acknowledgement',
        v_requires_acknowledgement
    ),
    v_recipients,
    NULL
  );
END;
$$;


CREATE OR REPLACE FUNCTION workforce.notify_resource_published(
  p_resource_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, workforce
AS $$
DECLARE
  v_actor uuid;
  v_resource workforce.resources%ROWTYPE;
  v_recipients uuid[];
BEGIN
  IF NOT workforce.can_manage_content() THEN
    RAISE EXCEPTION
      'Not authorized to publish resource notifications';
  END IF;

  v_actor := workforce.my_user_id();

  SELECT *
  INTO v_resource
  FROM workforce.resources
  WHERE id = p_resource_id
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active resource not found';
  END IF;

  v_recipients :=
    workforce.resource_notification_recipients(
      p_resource_id
    );

  RETURN workforce.create_notification(
    'resource_published',
    'New resource published',
    v_resource.title || ' is now available.',
    v_actor,
    'resource',
    p_resource_id,
    '/resources/' || p_resource_id::text,
    jsonb_build_object(
      'title', v_resource.title,
      'url', v_resource.url
    ),
    v_recipients,
    NULL
  );
END;
$$;


-- ============================================================
-- 15. ENABLE AND FORCE RLS
-- ============================================================

ALTER TABLE workforce.notifications
ENABLE ROW LEVEL SECURITY;

ALTER TABLE workforce.notification_recipients
ENABLE ROW LEVEL SECURITY;


ALTER TABLE workforce.notifications
FORCE ROW LEVEL SECURITY;

ALTER TABLE workforce.notification_recipients
FORCE ROW LEVEL SECURITY;


-- ============================================================
-- 16. NOTIFICATION POLICIES
-- ============================================================

CREATE POLICY notifications_select
ON workforce.notifications
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM workforce.notification_recipients nr
    WHERE nr.notification_id = notifications.id
      AND nr.recipient_user_id =
        workforce.my_user_id()
  )
);


-- No authenticated INSERT policy.
-- No UPDATE policy.
-- No DELETE policy.
-- Notification content is append-only.


-- ============================================================
-- 17. RECIPIENT POLICIES
-- ============================================================

CREATE POLICY notification_recipients_select
ON workforce.notification_recipients
FOR SELECT
USING (
  recipient_user_id = workforce.my_user_id()
);


-- No direct INSERT policy.
-- No direct UPDATE policy.
-- No DELETE policy.
-- Read state changes occur through controlled functions.


-- ============================================================
-- 18. PRIVILEGES
-- ============================================================

GRANT USAGE ON SCHEMA workforce
TO authenticated, service_role;


GRANT SELECT
ON workforce.notifications
TO authenticated;


GRANT SELECT
ON workforce.notification_recipients
TO authenticated;


GRANT ALL PRIVILEGES
ON workforce.notifications
TO service_role;


GRANT ALL PRIVILEGES
ON workforce.notification_recipients
TO service_role;


-- ============================================================
-- 19. FUNCTION SECURITY
-- ============================================================

REVOKE ALL
ON FUNCTION workforce.active_user_ids_for_roles(text[])
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.active_user_ids_for_role_ids(uuid[])
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.active_user_ids_for_departments(uuid[])
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.all_active_user_ids()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.create_notification(
  text,
  text,
  text,
  uuid,
  text,
  uuid,
  text,
  jsonb,
  uuid[],
  timestamptz
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.mark_notification_read(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.mark_notification_unread(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.mark_all_notifications_read()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.my_unread_notification_count()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.notify_onboarding_status_change()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.notify_leave_status_change()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.notify_probation_status_change()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.process_probation_reminders(date)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.notify_deboarding_status_change()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.document_notification_recipients(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.resource_notification_recipients(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.notify_document_published(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.notify_document_version_published(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION workforce.notify_resource_published(uuid)
FROM PUBLIC;


GRANT EXECUTE
ON FUNCTION workforce.mark_notification_read(uuid)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.mark_notification_unread(uuid)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.mark_all_notifications_read()
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.my_unread_notification_count()
TO authenticated, service_role;


GRANT EXECUTE
ON FUNCTION workforce.notify_document_published(uuid)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.notify_document_version_published(uuid)
TO authenticated, service_role;

GRANT EXECUTE
ON FUNCTION workforce.notify_resource_published(uuid)
TO authenticated, service_role;


GRANT EXECUTE
ON FUNCTION workforce.active_user_ids_for_roles(text[])
TO service_role;

GRANT EXECUTE
ON FUNCTION workforce.active_user_ids_for_role_ids(uuid[])
TO service_role;

GRANT EXECUTE
ON FUNCTION workforce.active_user_ids_for_departments(uuid[])
TO service_role;

GRANT EXECUTE
ON FUNCTION workforce.all_active_user_ids()
TO service_role;

GRANT EXECUTE
ON FUNCTION workforce.create_notification(
  text,
  text,
  text,
  uuid,
  text,
  uuid,
  text,
  jsonb,
  uuid[],
  timestamptz
)
TO service_role;

GRANT EXECUTE
ON FUNCTION workforce.process_probation_reminders(date)
TO service_role;


COMMIT;
