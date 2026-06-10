-- Users: self-access, admin override, and same-department visibility.
--
-- NOTE: The department_legacy_id JWT claim is read with a safe default ('').
-- If the claim is absent the condition evaluates false rather than throwing.
-- Admins and Co-Founders see all users regardless of department.

create policy "select users for authenticated membership" on users
  for select using (
    auth.role() = 'authenticated'
    and (
      auth_user_id = auth.uid()
      or exists (
        select 1 from users u
        where u.auth_user_id = auth.uid()
          and u.role_legacy_id in ('role_admin', 'role_cofounder')
      )
      or (
        department_legacy_id is not null
        and department_legacy_id = coalesce(
          nullif(current_setting('request.jwt.claims.department_legacy_id', true), ''),
          null
        )
      )
    )
  );

create policy "insert users with active auth user" on users
  for insert with check (
    auth.role() = 'authenticated'
    and auth_user_id = auth.uid()
    and status in ('active', 'invited', 'disabled')
  );

create policy "update users by self or admin" on users
  for update using (
    auth.role() = 'authenticated'
    and (
      auth_user_id = auth.uid()
      or exists (
        select 1 from users u
        where u.auth_user_id = auth.uid()
          and u.role_legacy_id in ('role_admin', 'role_cofounder')
      )
    )
  ) with check (
    auth.role() = 'authenticated'
  );