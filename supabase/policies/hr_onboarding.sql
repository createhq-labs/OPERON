-- HR Onboarding: self-service submission by the employee, full visibility
-- and acknowledgement by HR/Admin/Co-Founder.

create policy "select own onboarding or hr tier" on hr_onboarding
  for select using (
    auth.role() = 'authenticated'
    and (
      exists (
        select 1 from users u
        where u.auth_user_id = auth.uid() and u.legacy_id = hr_onboarding.user_legacy_id
      )
      or exists (
        select 1 from users u
        where u.auth_user_id = auth.uid()
          and u.role_legacy_id in ('role_hr', 'role_admin', 'role_cofounder')
      )
    )
  );

create policy "insert own onboarding" on hr_onboarding
  for insert with check (
    auth.role() = 'authenticated'
    and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid() and u.legacy_id = hr_onboarding.user_legacy_id
    )
  );

create policy "update own onboarding or hr tier" on hr_onboarding
  for update using (
    auth.role() = 'authenticated'
    and (
      exists (
        select 1 from users u
        where u.auth_user_id = auth.uid() and u.legacy_id = hr_onboarding.user_legacy_id
      )
      or exists (
        select 1 from users u
        where u.auth_user_id = auth.uid()
          and u.role_legacy_id in ('role_hr', 'role_admin', 'role_cofounder')
      )
    )
  ) with check (auth.role() = 'authenticated');
