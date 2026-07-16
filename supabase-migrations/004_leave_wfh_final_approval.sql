-- Migration 004: Final Leave/WFH approval workflow
-- Adds the Co-Founder pending stage for HR-team leave and persists rejection reasons.

alter table hr_leave_requests
  add column if not exists rejection_reason text;

alter table hr_leave_requests
  drop constraint if exists chk_leave_status;

alter table hr_leave_requests
  add constraint chk_leave_status
  check (status in ('pending', 'tl_approved', 'cofounder_pending', 'hr_approved', 'rejected', 'cancelled'));
