-- Deboarding: the subject's direct supervisor may flag and see the record
-- (covers TL flagging direct reports, or a TM employee flagging a creator
-- under them); HR/Admin/Co-Founder see, acknowledge, approve, and complete
-- everything. The subject themselves is deliberately excluded.

create policy "select supervised or hr tier deboarding" on hr_deboarding
  for select using (
    auth.role() = 'authenticated'
    and (
      exists (
        select 1 from users subject
        join users me on me.legacy_id = subject.supervisor_legacy_id
        where subject.legacy_id = hr_deboarding.user_legacy_id
          and me.auth_user_id = auth.uid()
      )
      or exists (
        select 1 from users u
        where u.auth_user_id = auth.uid()
          and u.role_legacy_id in ('role_hr', 'role_admin', 'role_cofounder')
      )
    )
  );

create policy "insert supervised or hr tier deboarding" on hr_deboarding
  for insert with check (
    auth.role() = 'authenticated'
    and (
      exists (
        select 1 from users subject
        join users me on me.legacy_id = subject.supervisor_legacy_id
        where subject.legacy_id = hr_deboarding.user_legacy_id
          and me.auth_user_id = auth.uid()
      )
      or exists (
        select 1 from users u
        where u.auth_user_id = auth.uid()
          and u.role_legacy_id in ('role_hr', 'role_admin', 'role_cofounder')
      )
    )
  );

create policy "hr tier update deboarding" on hr_deboarding
  for update using (
    auth.role() = 'authenticated'
    and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid()
        and u.role_legacy_id in ('role_hr', 'role_admin', 'role_cofounder')
    )
  ) with check (auth.role() = 'authenticated');
