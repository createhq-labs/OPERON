-- Drive document access and management policies
create policy "select drive documents for authorized users" on drive_documents
  for select using (
    auth.role() = 'authenticated' and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid() and (
        drive_documents.visibility_scope = 'global' or
        (drive_documents.visibility_scope = 'department' and u.department_legacy_id = drive_documents.department_legacy_id) or
        (drive_documents.visibility_scope = 'private' and drive_documents.author_legacy_id = u.legacy_id) or
        drive_documents.allowed_user_types && array[u.user_type] or
        drive_documents.allowed_role_ids && array[u.role_legacy_id] or
        drive_documents.allowed_team_ids && array[u.team_legacy_id] or
        drive_documents.assigned_user_ids && array[u.legacy_id]
      )
    )
  );

create policy "manage drive documents for owner or admin" on drive_documents
  for insert, update, delete using (
    auth.role() = 'authenticated' and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid() and (
        drive_documents.author_legacy_id = u.legacy_id or u.role_legacy_id in ('role_admin', 'role_cofounder')
      )
    )
  ) with check (
    auth.role() = 'authenticated'
  );
