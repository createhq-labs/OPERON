-- Uploads policies and safe write constraints
create policy "select uploads for uploader or admin" on uploads
  for select using (
    auth.role() = 'authenticated' and (
      uploaded_by = auth.uid() or
      auth.uid() in (select user_id from roles where role = 'admin')
    )
  );

create policy "insert uploads by authenticated users" on uploads
  for insert with check (
    auth.role() = 'authenticated' and
    uploaded_by = auth.uid() and
    storage_bucket is not null and
    storage_path is not null
  );

create policy "update uploads by uploader" on uploads
  for update using (
    auth.role() = 'authenticated' and uploaded_by = auth.uid()
  ) with check (
    auth.role() = 'authenticated'
  );
