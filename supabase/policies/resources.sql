-- Resources: role-aware visibility with department and team scoping.

create policy "select resources for allowed users" on resources
  for select using (
    auth.role() = 'authenticated'
    and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid()
        and (
          resources.visibility_scope = 'global'
          or resources.created_by_id = u.legacy_id
          or resources.allowed_user_types  && array[u.user_type]
          or resources.allowed_role_ids    && array[u.role_legacy_id]
          or resources.allowed_departments && array[u.department_legacy_id]
          or resources.allowed_team_ids    && array[u.team_legacy_id]
        )
    )
  );

-- Author is resolved inside the exists check to avoid a second subquery.

create policy "insert resources by authenticated users" on resources
  for insert with check (
    auth.role() = 'authenticated'
    and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid()
        and resources.created_by_id = u.legacy_id
    )
  );

create policy "update resources by owner or admin" on resources
  for update using (
    auth.role() = 'authenticated'
    and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid()
        and (
          resources.created_by_id = u.legacy_id
          or u.role_legacy_id in ('role_admin', 'role_cofounder')
        )
    )
  ) with check (
    auth.role() = 'authenticated'
  );

create policy "delete resources by owner or admin" on resources
  for delete using (
    auth.role() = 'authenticated'
    and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid()
        and (
          resources.created_by_id = u.legacy_id
          or u.role_legacy_id in ('role_admin', 'role_cofounder')
        )
    )
  );