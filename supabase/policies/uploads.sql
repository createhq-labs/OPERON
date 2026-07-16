-- Uploads: owner-scoped file records, with Admin/Co-Founder override.
-- uploaded_by stores the uploader's legacy_id.

create policy "select uploads for owner or admin" on uploads
  for select using (
    auth.role() = 'authenticated'
    and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid()
        and (
          uploads.uploaded_by = u.legacy_id
          or u.role_legacy_id in ('role_admin', 'role_cofounder')
        )
    )
  );

create policy "insert uploads by authenticated owner" on uploads
  for insert with check (
    auth.role() = 'authenticated'
    and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid()
        and uploads.uploaded_by = u.legacy_id
    )
  );

create policy "update uploads by owner or admin" on uploads
  for update using (
    auth.role() = 'authenticated'
    and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid()
        and (
          uploads.uploaded_by = u.legacy_id
          or u.role_legacy_id in ('role_admin', 'role_cofounder')
        )
    )
  ) with check (
    auth.role() = 'authenticated'
  );

create policy "delete uploads by owner or admin" on uploads
  for delete using (
    auth.role() = 'authenticated'
    and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid()
        and (
          uploads.uploaded_by = u.legacy_id
          or u.role_legacy_id in ('role_admin', 'role_cofounder')
        )
    )
  );
