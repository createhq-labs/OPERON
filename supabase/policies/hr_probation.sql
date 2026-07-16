-- Probation: HR submits, Admin/Co-Founder decide the outcome. Deliberately
-- no self-access — the employee under review is not a party to this table.

create policy "hr tier select probation" on hr_probation
  for select using (
    auth.role() = 'authenticated'
    and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid()
        and u.role_legacy_id in ('role_hr', 'role_admin', 'role_cofounder')
    )
  );

create policy "hr insert probation" on hr_probation
  for insert with check (
    auth.role() = 'authenticated'
    and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid() and u.role_legacy_id = 'role_hr'
    )
  );

create policy "founder tier update probation" on hr_probation
  for update using (
    auth.role() = 'authenticated'
    and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid()
        and u.role_legacy_id in ('role_admin', 'role_cofounder')
    )
  ) with check (auth.role() = 'authenticated');
