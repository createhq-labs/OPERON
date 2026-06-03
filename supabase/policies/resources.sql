-- Resource access rules and role-aware visibility
create policy "select resources for allowed roles" on resources
  for select using (
    auth.role() = 'authenticated' and (
      visibility_scope = 'global' or
      created_by = auth.uid() or
      auth.uid() in (select user_id from resource_permissions where resource_id = id)
    )
  );

create policy "insert resources by authenticated users" on resources
  for insert with check (
    auth.role() = 'authenticated' and created_by = auth.uid()
  );

create policy "update resources by owner or admin" on resources
  for update using (
    auth.role() = 'authenticated' and (
      created_by = auth.uid() or
      auth.uid() in (select user_id from roles where role = 'admin')
    )
  );
