-- ============================================================
-- HR/Workforce domain, built directly on public.users
--
-- Reuses the Finance Dashboard's real identity table instead of a
-- parallel one — every hr_* table below FKs to public.users(id) with
-- real uuids, not the old legacy_id text pseudo-keys. Role gating uses
-- public.user_role directly (employee/team_lead/finance/admin/developer)
-- — the app's former 16-role catalog is remapped down to these 5 by a
-- deliberate decision (see supabase-migrations/010's companion plan):
-- Cofounder/HR/HR Executive all become 'admin' (separation of duties
-- between HR-submits and Cofounder-decides is intentionally lost),
-- Finance/Finance Associate become 'finance', TM/IM Team Lead + Senior
-- TM + Category Lead become 'team_lead', everything else becomes
-- 'employee' (Content Creator distinguished via the new user_type
-- column, not role).
--
-- public.notifications and public.activity_log already exist as real
-- Finance tables with incompatible shapes (confirmed live) — this
-- migration does NOT touch them and creates hr_notifications /
-- hr_activity_log instead, to avoid any collision.
--
-- Reuses the RLS helper functions already created by
-- 008_workforce_documentation_platform.sql (workforce.my_user_id(),
-- workforce.my_role(), workforce.is_admin(), workforce.is_team_lead_or_admin())
-- — they already resolve against public.users/public.user_role, which
-- is exactly what this schema needs too. No new identity-resolution
-- functions are created here.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────
-- public.users additions
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS date_joined date;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS user_type text NOT NULL DEFAULT 'employee';
ALTER TABLE public.users ADD CONSTRAINT chk_users_user_type CHECK (user_type IN ('employee', 'creator'));

-- ─────────────────────────────────────────────────────────────
-- HR ONBOARDING
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hr_onboarding (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status             text        NOT NULL DEFAULT 'pending',
  onboarding_data    jsonb       NOT NULL DEFAULT '{}',
  compliance_data    jsonb       NOT NULL DEFAULT '{}',
  form11_sent_at     timestamptz,
  submitted_at       timestamptz,
  acknowledged_by_id uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  acknowledged_at    timestamptz,
  completed_by_id    uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  completed_at       timestamptz,
  rejected_by_id     uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  rejected_at        timestamptz,
  rejection_reason   text,
  created_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_hr_onboarding_status CHECK (status IN ('pending', 'submitted', 'acknowledged', 'completed'))
);

-- ─────────────────────────────────────────────────────────────
-- HR LEAVE & WFH REQUESTS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hr_leave_requests (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  request_type       text        NOT NULL,
  date_from          date        NOT NULL,
  date_to            date        NOT NULL,
  reason             text        NOT NULL DEFAULT '',
  additional_info    text,
  status             text        NOT NULL DEFAULT 'pending',
  rejection_reason   text,
  tl_approved_by_id  uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  tl_approved_at     timestamptz,
  hr_approved_by_id  uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  hr_approved_at     timestamptz,
  founder_notified   boolean     NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_hr_leave_request_type CHECK (request_type IN ('leave', 'wfh')),
  CONSTRAINT chk_hr_leave_status       CHECK (status IN ('pending', 'tl_approved', 'cofounder_pending', 'hr_approved', 'rejected', 'cancelled'))
);

-- ─────────────────────────────────────────────────────────────
-- HR ATTENDANCE
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hr_attendance (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  month               text        NOT NULL,
  days                jsonb       NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_hr_attendance_user_month UNIQUE (user_id, month)
);

-- ─────────────────────────────────────────────────────────────
-- HR HOLIDAY CALENDAR
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hr_holidays (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  date               date        NOT NULL UNIQUE,
  name               text        NOT NULL,
  type               text        NOT NULL DEFAULT 'public',
  created_by_id      uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_hr_holiday_type CHECK (type IN ('public', 'optional', 'company'))
);

-- ─────────────────────────────────────────────────────────────
-- HR PROBATION
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hr_probation (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date_joined              date        NOT NULL,
  probation_duration_days  integer     NOT NULL DEFAULT 90,
  probation_duration_unit  text        NOT NULL DEFAULT 'days',
  expected_review_date     date,
  status                   text        NOT NULL DEFAULT 'pending',
  reviewed_by_id           uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at              timestamptz,
  parent_record_id         uuid        REFERENCES public.hr_probation(id) ON DELETE SET NULL,
  notes                    text,
  submitted_by_id          uuid        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_hr_probation_status CHECK (status IN ('pending', 'under_review', 'confirmed', 'extended', 'terminated')),
  CONSTRAINT chk_hr_probation_duration_unit CHECK (probation_duration_unit IN ('days', 'months'))
);

-- ─────────────────────────────────────────────────────────────
-- HR MANAGER HISTORY
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hr_manager_history (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  supervisor_id  uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  changed_by_id  uuid        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  effective_from date        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- HR DEBOARDING
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hr_deboarding (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  initiated_by_id        uuid        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  track                  text        NOT NULL,
  status                 text        NOT NULL DEFAULT 'pending_lead_approval',
  reason                 text,
  initiated_at           timestamptz NOT NULL DEFAULT now(),
  approved_by_id         uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at            timestamptz,
  hr_acknowledged_by_id  uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  hr_acknowledged_at     timestamptz,
  founder_approved_by_id uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  founder_approved_at    timestamptz,
  checklist              jsonb       NOT NULL DEFAULT '{}',
  completed_by_id        uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  completed_at           timestamptz,
  founder_notified       boolean     NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_hr_deboarding_track  CHECK (track IN ('creator', 'employee')),
  CONSTRAINT chk_hr_deboarding_status CHECK (status IN ('pending_lead_approval', 'pending_founder_approval', 'data_recovery_pending', 'offboarded'))
);

-- ─────────────────────────────────────────────────────────────
-- HR NOTIFICATIONS (distinct from public.notifications, which is a
-- real Finance table with an incompatible, NOT NULL, workflow-specific
-- type enum — confirmed live, not reusable)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hr_notifications (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text        NOT NULL,
  body              text        NOT NULL,
  notification_type text        NOT NULL,
  audience          text        NOT NULL,
  department_ids    text[]      DEFAULT NULL,
  role_ids          text[]      DEFAULT NULL,
  user_ids          uuid[]      DEFAULT NULL,
  actor_id          uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  entity_type       text,
  entity_id         uuid,
  metadata          jsonb       DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz,
  unread_by         uuid[]      NOT NULL DEFAULT '{}',

  CONSTRAINT chk_hr_notification_type     CHECK (notification_type IN ('system', 'document', 'resource', 'user')),
  CONSTRAINT chk_hr_notification_audience CHECK (audience IN ('all', 'department', 'role', 'user'))
);

-- ─────────────────────────────────────────────────────────────
-- HR ACTIVITY LOG (distinct from public.activity_log, a real Finance
-- table — confirmed live, kept separate rather than assumed-compatible)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hr_activity_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  action      text        NOT NULL,
  target_type text,
  target_id   uuid,
  metadata    jsonb,
  "timestamp" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_onboarding_user      ON public.hr_onboarding (user_id);
CREATE INDEX IF NOT EXISTS idx_hr_leave_user            ON public.hr_leave_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_hr_leave_status          ON public.hr_leave_requests (status);
CREATE INDEX IF NOT EXISTS idx_hr_attendance_user       ON public.hr_attendance (user_id);
CREATE INDEX IF NOT EXISTS idx_hr_probation_user        ON public.hr_probation (user_id);
CREATE INDEX IF NOT EXISTS idx_hr_manager_history_user  ON public.hr_manager_history (user_id);
CREATE INDEX IF NOT EXISTS idx_hr_deboarding_user       ON public.hr_deboarding (user_id);
CREATE INDEX IF NOT EXISTS idx_hr_deboarding_status     ON public.hr_deboarding (status);
CREATE INDEX IF NOT EXISTS idx_hr_notifications_role    ON public.hr_notifications USING gin (role_ids);
CREATE INDEX IF NOT EXISTS idx_hr_notifications_user    ON public.hr_notifications USING gin (user_ids);
CREATE INDEX IF NOT EXISTS idx_hr_notifications_dept    ON public.hr_notifications USING gin (department_ids);
CREATE INDEX IF NOT EXISTS idx_hr_activity_log_user     ON public.hr_activity_log (user_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- Reuses workforce.my_user_id() / workforce.my_role() / workforce.is_admin() /
-- workforce.is_team_lead_or_admin() from 008_workforce_documentation_platform.sql
-- — those already resolve against public.users / public.user_role, exactly
-- what this schema needs too.
-- ============================================================

ALTER TABLE public.hr_onboarding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_onboarding_select" ON public.hr_onboarding FOR SELECT USING (
  auth.role() = 'authenticated' AND (user_id = workforce.my_user_id() OR workforce.is_admin())
);
CREATE POLICY "hr_onboarding_insert" ON public.hr_onboarding FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND user_id = workforce.my_user_id()
);
CREATE POLICY "hr_onboarding_update" ON public.hr_onboarding FOR UPDATE USING (
  auth.role() = 'authenticated' AND (user_id = workforce.my_user_id() OR workforce.is_admin())
) WITH CHECK (auth.role() = 'authenticated');

ALTER TABLE public.hr_leave_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_leave_select" ON public.hr_leave_requests FOR SELECT USING (
  auth.role() = 'authenticated'
  AND (
    user_id = workforce.my_user_id()
    OR EXISTS (SELECT 1 FROM public.users requester WHERE requester.id = hr_leave_requests.user_id AND requester.team_lead_id = workforce.my_user_id())
    OR workforce.is_admin()
  )
);
CREATE POLICY "hr_leave_insert" ON public.hr_leave_requests FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND user_id = workforce.my_user_id()
);
CREATE POLICY "hr_leave_update" ON public.hr_leave_requests FOR UPDATE USING (
  auth.role() = 'authenticated'
  AND (
    EXISTS (SELECT 1 FROM public.users requester WHERE requester.id = hr_leave_requests.user_id AND requester.team_lead_id = workforce.my_user_id())
    OR workforce.is_admin()
  )
) WITH CHECK (auth.role() = 'authenticated');

ALTER TABLE public.hr_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_attendance_select" ON public.hr_attendance FOR SELECT USING (
  auth.role() = 'authenticated'
  AND (
    user_id = workforce.my_user_id()
    OR EXISTS (SELECT 1 FROM public.users member WHERE member.id = hr_attendance.user_id AND member.team_lead_id = workforce.my_user_id())
    OR workforce.is_admin()
  )
);
CREATE POLICY "hr_attendance_insert" ON public.hr_attendance FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND (user_id = workforce.my_user_id() OR workforce.is_admin())
);
CREATE POLICY "hr_attendance_update" ON public.hr_attendance FOR UPDATE USING (
  auth.role() = 'authenticated' AND (user_id = workforce.my_user_id() OR workforce.is_admin())
) WITH CHECK (auth.role() = 'authenticated');

ALTER TABLE public.hr_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_holidays_select" ON public.hr_holidays FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "hr_holidays_write" ON public.hr_holidays FOR ALL USING (
  auth.role() = 'authenticated' AND workforce.is_admin()
) WITH CHECK (workforce.is_admin());

-- hr_probation: admin submits and decides (HR/Cofounder merged — see
-- migration header). Deliberately no self-access, same as before.
ALTER TABLE public.hr_probation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_probation_select" ON public.hr_probation FOR SELECT USING (
  auth.role() = 'authenticated' AND workforce.is_admin()
);
CREATE POLICY "hr_probation_insert" ON public.hr_probation FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND workforce.is_admin()
);
CREATE POLICY "hr_probation_update" ON public.hr_probation FOR UPDATE USING (
  auth.role() = 'authenticated' AND workforce.is_admin()
) WITH CHECK (auth.role() = 'authenticated');

-- hr_manager_history: append-only; visible to the subject and to
-- roster-managing tiers (admin/finance/team_lead post-collapse).
ALTER TABLE public.hr_manager_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_manager_history_select" ON public.hr_manager_history FOR SELECT USING (
  auth.role() = 'authenticated'
  AND (user_id = workforce.my_user_id() OR workforce.my_role() IN ('admin', 'finance', 'team_lead'))
);
CREATE POLICY "hr_manager_history_insert" ON public.hr_manager_history FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND workforce.my_role() IN ('admin', 'finance', 'team_lead')
);

ALTER TABLE public.hr_deboarding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_deboarding_select" ON public.hr_deboarding FOR SELECT USING (
  auth.role() = 'authenticated'
  AND (
    EXISTS (SELECT 1 FROM public.users subject WHERE subject.id = hr_deboarding.user_id AND subject.team_lead_id = workforce.my_user_id())
    OR workforce.is_admin()
  )
);
CREATE POLICY "hr_deboarding_insert" ON public.hr_deboarding FOR INSERT WITH CHECK (
  auth.role() = 'authenticated'
  AND (
    EXISTS (SELECT 1 FROM public.users subject WHERE subject.id = hr_deboarding.user_id AND subject.team_lead_id = workforce.my_user_id())
    OR workforce.is_admin()
  )
);
CREATE POLICY "hr_deboarding_update" ON public.hr_deboarding FOR UPDATE USING (
  auth.role() = 'authenticated' AND workforce.is_admin()
) WITH CHECK (auth.role() = 'authenticated');

ALTER TABLE public.hr_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_notifications_select" ON public.hr_notifications FOR SELECT USING (
  auth.role() = 'authenticated'
  AND (
    audience = 'all'
    OR (audience = 'user' AND workforce.my_user_id() = ANY (user_ids))
    OR (audience = 'role' AND workforce.my_role()::text = ANY (role_ids))
    OR (audience = 'department' AND EXISTS (
          SELECT 1 FROM public.users me WHERE me.id = workforce.my_user_id() AND me.business_line = ANY (department_ids)
        ))
  )
);
CREATE POLICY "hr_notifications_insert" ON public.hr_notifications FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND workforce.is_admin()
);
CREATE POLICY "hr_notifications_update" ON public.hr_notifications FOR UPDATE USING (
  auth.role() = 'authenticated'
  AND (
    audience = 'all'
    OR (audience = 'user' AND workforce.my_user_id() = ANY (user_ids))
    OR (audience = 'role' AND workforce.my_role()::text = ANY (role_ids))
    OR (audience = 'department' AND EXISTS (
          SELECT 1 FROM public.users me WHERE me.id = workforce.my_user_id() AND me.business_line = ANY (department_ids)
        ))
  )
) WITH CHECK (auth.role() = 'authenticated');

ALTER TABLE public.hr_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_activity_log_select" ON public.hr_activity_log FOR SELECT USING (
  auth.role() = 'authenticated' AND (user_id = workforce.my_user_id() OR workforce.is_admin())
);
CREATE POLICY "hr_activity_log_insert" ON public.hr_activity_log FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND user_id = workforce.my_user_id()
);

-- ============================================================
-- GRANTS
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.hr_onboarding, public.hr_leave_requests, public.hr_attendance,
  public.hr_holidays, public.hr_probation, public.hr_manager_history,
  public.hr_deboarding, public.hr_notifications, public.hr_activity_log
  TO authenticated;

GRANT ALL ON
  public.hr_onboarding, public.hr_leave_requests, public.hr_attendance,
  public.hr_holidays, public.hr_probation, public.hr_manager_history,
  public.hr_deboarding, public.hr_notifications, public.hr_activity_log
  TO service_role;
