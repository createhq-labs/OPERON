-- Activity log visibility should be scoped to authorized personnel only
create policy "select activity logs for authorized users" on activity_logs
  for select using (
    auth.role() = 'authenticated' and (
      user_id = auth.uid() or
      auth.uid() in (select user_id from roles where role = 'admin')
    )
  );

create policy "insert activity logs by system or service" on activity_logs
  for insert with check (
    auth.role() = 'authenticated' and user_id = auth.uid()
  );
