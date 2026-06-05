-- Uploads policies and safe write constraints
create policy "select uploads for uploader or admin" on uploads
  for select using (
    auth.role() = 'authenticated' and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid() and (
        uploads.uploaded_by = u.legacy_id or u.role_legacy_id in ('role_admin', 'role_cofounder')
      )
    )
  );

create policy "insert uploads by authenticated users" on uploads
  for insert with check (
    auth.role() = 'authenticated' and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid()
    ) and uploads.uploaded_by = (
      select u.legacy_id from users u where u.auth_user_id = auth.uid() limit 1
    ) and storage_bucket is not null and storage_path is not null
  );

create policy "update uploads by uploader" on uploads
  for update using (
    auth.role() = 'authenticated' and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid() and uploads.uploaded_by = u.legacy_id
    )
  ) with check (
    auth.role() = 'authenticated'
  );
