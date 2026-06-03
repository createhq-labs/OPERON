-- Documents access and mutation policies
create policy "select documents for authorized users" on documents
  for select using (
    auth.role() = 'authenticated' and (
      visibility_scope = 'global' or
      department_id = current_setting('request.jwt.claims.department', true)::text or
      author_id = auth.uid() or
      auth.uid() in (select user_id from document_permissions where document_id = id)
    )
  );

create policy "insert documents by authenticated users" on documents
  for insert with check (
    auth.role() = 'authenticated' and
    author_id = auth.uid() and
    visibility_scope in ('global', 'department', 'private') and
    jsonb_typeof(allowed_role_ids) = 'array'
  );

create policy "update documents by owner or admin" on documents
  for update using (
    auth.role() = 'authenticated' and (
      author_id = auth.uid() or
      auth.uid() in (select user_id from roles where role = 'admin')
    )
  ) with check (
    auth.role() = 'authenticated'
  );

create policy "delete documents by owner or admin" on documents
  for delete using (
    auth.role() = 'authenticated' and (
      author_id = auth.uid() or
      auth.uid() in (select user_id from roles where role = 'admin')
    )
  );
