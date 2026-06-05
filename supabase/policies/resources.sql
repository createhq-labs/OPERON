-- Resource access rules and role-aware visibility
create policy "select resources for allowed users" on resources
  for select using (
    auth.role() = 'authenticated' and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid() and (
        resources.visibility_scope = 'global' or
        resources.created_by_id = u.legacy_id or
        resources.allowed_user_types && array[u.user_type] or
        resources.allowed_role_ids && array[u.role_legacy_id] or
        resources.allowed_departments && array[u.department_legacy_id] or
        resources.allowed_team_ids && array[u.team_legacy_id]
      )
    )
  );

create policy "insert resources by authenticated users" on resources
  for insert with check (
    auth.role() = 'authenticated' and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid()
    ) and resources.created_by_id = (
      select u.legacy_id from users u where u.auth_user_id = auth.uid() limit 1
    )
  );

create policy "update resources by owner or admin" on resources
  for update using (
    auth.role() = 'authenticated' and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid() and (
        resources.created_by_id = u.legacy_id or u.role_legacy_id in ('role_admin', 'role_cofounder')
      )
    )
  );
