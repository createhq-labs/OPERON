-- Holiday calendar: every authenticated user may read it; only HR/Admin/
-- Co-Founder may maintain it.

create policy "authenticated select holidays" on hr_holidays
  for select using (auth.role() = 'authenticated');

create policy "hr tier write holidays" on hr_holidays
  for all using (
    auth.role() = 'authenticated'
    and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid()
        and u.role_legacy_id in ('role_hr', 'role_admin', 'role_cofounder')
    )
  ) with check (
    exists (
      select 1 from users u
      where u.auth_user_id = auth.uid()
        and u.role_legacy_id in ('role_hr', 'role_admin', 'role_cofounder')
    )
  );
