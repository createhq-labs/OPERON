-- Users access policies and ownership enforcement
create policy "select users for authenticated membership" on users
  for select using (
    auth.role() = 'authenticated' and (
      id = auth.uid() or
      auth.uid() in (select user_id from roles where role = 'admin') or
      department_id = current_setting('request.jwt.claims.department', true)::text
    )
  );

create policy "insert users with active auth" on users
  for insert with check (
    auth.role() = 'authenticated' and created_by = auth.uid() and
    status in ('active', 'invited')
  );

create policy "update users by self or admin" on users
  for update using (
    auth.role() = 'authenticated' and (
      id = auth.uid() or
      auth.uid() in (select user_id from roles where role = 'admin')
    )
  ) with check (
    auth.role() = 'authenticated'
  );
