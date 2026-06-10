-- Drive documents: visibility-aware read access.
-- Mirrors the documents visibility model: global, department, private,
-- plus explicit allow-lists for user types, roles, teams, and individuals.

create policy "select drive documents for authorized users" on drive_documents
  for select using (
    auth.role() = 'authenticated'
    and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid()
        and (
          drive_documents.visibility_scope = 'global'
          or (drive_documents.visibility_scope = 'department' and u.department_legacy_id = drive_documents.department_legacy_id)
          or (drive_documents.visibility_scope = 'private' and drive_documents.author_legacy_id = u.legacy_id)
          or drive_documents.allowed_user_types  && array[u.user_type]
          or drive_documents.allowed_role_ids    && array[u.role_legacy_id]
          or drive_documents.allowed_team_ids    && array[u.team_legacy_id]
          or drive_documents.assigned_user_ids   && array[u.legacy_id]
        )
    )
  );

-- NOTE: Postgres RLS does not support `for insert, update, delete` in a single
-- policy. The following three policies replace the original combined policy.

create policy "insert drive documents by owner or admin" on drive_documents
  for insert with check (
    auth.role() = 'authenticated'
    and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid()
        and (
          drive_documents.author_legacy_id = u.legacy_id
          or u.role_legacy_id in ('role_admin', 'role_cofounder')
        )
    )
  );

create policy "update drive documents by owner or admin" on drive_documents
  for update using (
    auth.role() = 'authenticated'
    and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid()
        and (
          drive_documents.author_legacy_id = u.legacy_id
          or u.role_legacy_id in ('role_admin', 'role_cofounder')
        )
    )
  ) with check (
    auth.role() = 'authenticated'
  );

create policy "delete drive documents by owner or admin" on drive_documents
  for delete using (
    auth.role() = 'authenticated'
    and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid()
        and (
          drive_documents.author_legacy_id = u.legacy_id
          or u.role_legacy_id in ('role_admin', 'role_cofounder')
        )
    )
  );