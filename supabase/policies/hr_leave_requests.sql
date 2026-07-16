-- Leave & WFH requests: self-service submission, direct-supervisor (TL-step)
-- visibility and approval, HR/Admin/Co-Founder see and act on everything.
--
-- NOTE: "their team" is resolved via the supervisor_legacy_id chain, not
-- department or role — there are multiple team leads per department.

create policy "select own or supervised or hr tier leave requests" on hr_leave_requests
  for select using (
    auth.role() = 'authenticated'
    and (
      exists (
        select 1 from users u
        where u.auth_user_id = auth.uid() and u.legacy_id = hr_leave_requests.user_legacy_id
      )
      or exists (
        select 1 from users requester
        join users me on me.legacy_id = requester.supervisor_legacy_id
        where requester.legacy_id = hr_leave_requests.user_legacy_id
          and me.auth_user_id = auth.uid()
      )
      or exists (
        select 1 from users u
        where u.auth_user_id = auth.uid()
          and u.role_legacy_id in ('role_hr', 'role_admin', 'role_cofounder')
      )
    )
  );

create policy "insert own leave request" on hr_leave_requests
  for insert with check (
    auth.role() = 'authenticated'
    and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid() and u.legacy_id = hr_leave_requests.user_legacy_id
    )
  );

create policy "update supervised or hr tier leave requests" on hr_leave_requests
  for update using (
    auth.role() = 'authenticated'
    and (
      exists (
        select 1 from users requester
        join users me on me.legacy_id = requester.supervisor_legacy_id
        where requester.legacy_id = hr_leave_requests.user_legacy_id
          and me.auth_user_id = auth.uid()
      )
      or exists (
        select 1 from users u
        where u.auth_user_id = auth.uid()
          and u.role_legacy_id in ('role_hr', 'role_admin', 'role_cofounder')
      )
    )
  ) with check (auth.role() = 'authenticated');
