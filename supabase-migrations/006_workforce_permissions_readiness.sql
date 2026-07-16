-- Align Workforce HR tables with the application permission flows.
-- Required before connecting the current Leave/WFH, onboarding send-back,
-- and deboarding approval code to Supabase.

alter table hr_onboarding
  add column if not exists rejected_by_id text;

alter table hr_onboarding
  add column if not exists rejected_at timestamptz;

alter table hr_onboarding
  add column if not exists rejection_reason text;

alter table hr_onboarding
  add column if not exists completed_by_id text;

alter table hr_onboarding
  add column if not exists completed_at timestamptz;

alter table hr_onboarding
  drop constraint if exists chk_onboarding_status;

alter table hr_onboarding
  add constraint chk_onboarding_status
  check (status in ('pending', 'submitted', 'acknowledged', 'completed'));

alter table hr_deboarding
  add column if not exists reason text;

alter table hr_deboarding
  add column if not exists initiated_at timestamptz;

update hr_deboarding
set initiated_at = coalesce(initiated_at, flagged_at, created_at, now())
where initiated_at is null;

alter table hr_deboarding
  alter column initiated_at set default now();

alter table hr_deboarding
  alter column initiated_at set not null;

alter table hr_deboarding
  add column if not exists approved_by_id text;

alter table hr_deboarding
  add column if not exists approved_at timestamptz;

alter table hr_deboarding
  add column if not exists checklist jsonb not null default '{}';

alter table hr_deboarding
  add column if not exists completed_by_id text;

alter table hr_deboarding
  drop constraint if exists chk_deboarding_status;

update hr_deboarding
set status = case status
  when 'flagged' then 'pending_lead_approval'
  when 'hr_acknowledged' then 'data_recovery_pending'
  when 'founder_approved' then 'data_recovery_pending'
  when 'completed' then 'offboarded'
  else status
end;

alter table hr_deboarding
  add constraint chk_deboarding_status
  check (status in ('pending_lead_approval', 'pending_founder_approval', 'data_recovery_pending', 'offboarded'));

alter table hr_deboarding
  alter column status set default 'pending_lead_approval';
