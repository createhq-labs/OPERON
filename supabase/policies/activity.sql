-- Activity log visibility should be scoped to authorized personnel only
create policy "select activity logs for authorized users" on activity_logs
  for select using (
    auth.role() = 'authenticated' and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid() and (
        activity_logs.user_legacy_id = u.legacy_id or u.role_legacy_id in ('role_admin', 'role_cofounder')
      )
    )
  );

create policy "insert activity logs by system or service" on activity_logs
  for insert with check (
    auth.role() = 'authenticated' and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid() and activity_logs.user_legacy_id = u.legacy_id
    )
  );
