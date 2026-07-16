-- ============================================================
-- Migration 002: New role structure
-- Adds 9 roles introduced in the Final Workforce Role Structure.
-- Existing roles (cofounder, hr, finance, im_team_lead, tm_team_lead,
-- creator, intern, admin, employee) are unchanged.
-- Run after 001_service_account_drive_refactor.sql
-- ============================================================

-- ─── Permission JSON templates ────────────────────────────────────────────────
--
-- MANAGER_PERMS  → Senior TM, Category Lead
--   Upload enabled. HR features. viewHrRecordsAll. acknowledgeDeboarding. flagDeboardingAny.
--
-- TEAM_PERMS     → Creator Acquisition, TM Associate, IM Executive, IM Associate,
--                  Finance Associate, Sales Executive
--   Read-only library. viewActivity + viewResources only.
--
-- HR_EXEC_PERMS  → HR Executive
--   Read-only library. viewActivity + viewResources + viewHr + viewOnboarding.
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper: reusable permission blocks as CTEs
with
  manager_perms as (
    select '{
      "documents": {"create": true,  "view": true, "edit": true,  "delete": true,  "upload": true},
      "users":     {"create": false, "edit": false, "delete": false, "assignRole": false},
      "system":    {"adminPanelAccess": false, "roleManagement": false},
      "features": {
        "sendToAll": false, "viewActivity": true, "manageResources": true, "viewResources": true,
        "viewHr": true, "viewOnboarding": true, "viewCreatorOps": false, "viewBrand": false,
        "viewOperations": false, "approveLeaveTl": false, "approveLeaveHr": false,
        "manageHrCalendar": false, "viewHrRecordsAll": true, "submitProbationReview": false,
        "decideProbationReview": false, "acknowledgeDeboarding": true,
        "approveDeboardingEmployeeTrack": false, "flagDeboardingAny": true
      }
    }'::jsonb as perms,
    ARRAY[
      'view_library','view_documents','add_documents','edit_documents','manage_team_documents',
      'delete_documents','manage_uploads','view_activity','view_resources','manage_resources',
      'view_hr','view_onboarding','view_hr_records_all','acknowledge_deboarding','flag_deboarding_any'
    ] as pids
  ),
  team_perms as (
    select '{
      "documents": {"create": false, "view": true, "edit": false, "delete": false, "upload": false},
      "users":     {"create": false, "edit": false, "delete": false, "assignRole": false},
      "system":    {"adminPanelAccess": false, "roleManagement": false},
      "features": {
        "sendToAll": false, "viewActivity": true, "manageResources": false, "viewResources": true,
        "viewHr": false, "viewOnboarding": false, "viewCreatorOps": false, "viewBrand": false,
        "viewOperations": false, "approveLeaveTl": false, "approveLeaveHr": false,
        "manageHrCalendar": false, "viewHrRecordsAll": false, "submitProbationReview": false,
        "decideProbationReview": false, "acknowledgeDeboarding": false,
        "approveDeboardingEmployeeTrack": false, "flagDeboardingAny": false
      }
    }'::jsonb as perms,
    ARRAY['view_library','view_documents','view_activity','view_resources'] as pids
  ),
  hr_exec_perms as (
    select '{
      "documents": {"create": false, "view": true, "edit": false, "delete": false, "upload": false},
      "users":     {"create": false, "edit": false, "delete": false, "assignRole": false},
      "system":    {"adminPanelAccess": false, "roleManagement": false},
      "features": {
        "sendToAll": false, "viewActivity": true, "manageResources": false, "viewResources": true,
        "viewHr": true, "viewOnboarding": true, "viewCreatorOps": false, "viewBrand": false,
        "viewOperations": false, "approveLeaveTl": false, "approveLeaveHr": false,
        "manageHrCalendar": false, "viewHrRecordsAll": false, "submitProbationReview": false,
        "decideProbationReview": false, "acknowledgeDeboarding": false,
        "approveDeboardingEmployeeTrack": false, "flagDeboardingAny": false
      }
    }'::jsonb as perms,
    ARRAY['view_library','view_documents','view_activity','view_resources','view_hr','view_onboarding'] as pids
  )

-- ─── Manager-tier roles ───────────────────────────────────────────────────────
insert into roles (legacy_id, name, description, user_type, "group", permissions, permission_ids)
select
  r.legacy_id, r.name, r.description, 'employee', r.grp,
  mp.perms, mp.pids
from manager_perms mp,
  (values
    ('role_senior_tm',    'Senior TM',    'Senior Talent Management',  'tm'),
    ('role_category_lead','Category Lead','Category management lead',  'tm')
  ) as r(legacy_id, name, description, grp)
on conflict (legacy_id) do nothing;

-- ─── Team-member roles ────────────────────────────────────────────────────────
insert into roles (legacy_id, name, description, user_type, "group", permissions, permission_ids)
select
  r.legacy_id, r.name, r.description, 'employee', r.grp,
  tp.perms, tp.pids
from team_perms tp,
  (values
    ('role_creator_acquisition', 'Creator Acquisition', 'TM – Creator Acquisition',      'tm'),
    ('role_tm_associate',        'TM Associate',        'Talent Management associate',    'tm'),
    ('role_im_executive',        'IM Executive',        'Influencer Marketing executive', 'im'),
    ('role_im_associate',        'IM Associate',        'Influencer Marketing associate', 'im'),
    ('role_finance_associate',   'Finance Associate',   'Finance team member',            'finance'),
    ('role_sales_executive',     'Sales Executive',     'Sales team member',              'sales')
  ) as r(legacy_id, name, description, grp)
on conflict (legacy_id) do nothing;

-- ─── HR Executive ─────────────────────────────────────────────────────────────
insert into roles (legacy_id, name, description, user_type, "group", permissions, permission_ids)
select
  'role_hr_executive', 'HR Executive', 'HR support and records', 'employee', 'hr',
  hp.perms, hp.pids
from hr_exec_perms hp
on conflict (legacy_id) do nothing;
