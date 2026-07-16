-- Attendance: self sees own record, direct supervisor sees their reports'
-- records, HR/Admin/Co-Founder see everything. Employees mark their own
-- days; HR/Admin/Co-Founder can mark or override anyone's (e.g. when
-- recording an approved leave request).

create policy "select own or supervised or hr tier attendance" on hr_attendance
  for select using (
    auth.role() = 'authenticated'
    and (
      exists (
        select 1 from users u
        where u.auth_user_id = auth.uid() and u.legacy_id = hr_attendance.user_legacy_id
      )
      or exists (
        select 1 from users member
        join users me on me.legacy_id = member.supervisor_legacy_id
        where member.legacy_id = hr_attendance.user_legacy_id
          and me.auth_user_id = auth.uid()
      )
      or exists (
        select 1 from users u
        where u.auth_user_id = auth.uid()
          and u.role_legacy_id in ('role_hr', 'role_admin', 'role_cofounder')
      )
    )
  );

create policy "insert own or hr tier attendance" on hr_attendance
  for insert with check (
    auth.role() = 'authenticated'
    and (
      exists (
        select 1 from users u
        where u.auth_user_id = auth.uid() and u.legacy_id = hr_attendance.user_legacy_id
      )
      or exists (
        select 1 from users u
        where u.auth_user_id = auth.uid()
          and u.role_legacy_id in ('role_hr', 'role_admin', 'role_cofounder')
      )
    )
  );

create policy "update own or hr tier attendance" on hr_attendance
  for update using (
    auth.role() = 'authenticated'
    and (
      exists (
        select 1 from users u
        where u.auth_user_id = auth.uid() and u.legacy_id = hr_attendance.user_legacy_id
      )
      or exists (
        select 1 from users u
        where u.auth_user_id = auth.uid()
          and u.role_legacy_id in ('role_hr', 'role_admin', 'role_cofounder')
      )
    )
  ) with check (auth.role() = 'authenticated');
