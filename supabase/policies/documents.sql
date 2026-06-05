-- Documents access and mutation policies
create policy "select documents for authorized users" on documents
  for select using (
    auth.role() = 'authenticated' and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid() and (
        documents.visibility_scope = 'global' or
        (documents.visibility_scope = 'department' and u.department_legacy_id = documents.department_legacy_id) or
        (documents.visibility_scope = 'private' and documents.author_legacy_id = u.legacy_id) or
        documents.allowed_user_types && array[u.user_type] or
        documents.allowed_role_ids && array[u.role_legacy_id] or
        documents.allowed_team_ids && array[u.team_legacy_id] or
        documents.assigned_user_ids && array[u.legacy_id]
      )
    )
  );

create policy "insert documents by authenticated users" on documents
  for insert with check (
    auth.role() = 'authenticated' and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid()
    ) and documents.author_legacy_id = (
      select u.legacy_id from users u where u.auth_user_id = auth.uid() limit 1
    ) and documents.visibility_scope in ('global', 'department', 'private')
  );

create policy "update documents by owner or admin" on documents
  for update using (
    auth.role() = 'authenticated' and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid() and (
        documents.author_legacy_id = u.legacy_id or u.role_legacy_id in ('role_admin', 'role_cofounder')
      )
    )
  ) with check (
    auth.role() = 'authenticated'
  );

create policy "delete documents by owner or admin" on documents
  for delete using (
    auth.role() = 'authenticated' and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid() and (
        documents.author_legacy_id = u.legacy_id or u.role_legacy_id in ('role_admin', 'role_cofounder')
      )
    )
  );
