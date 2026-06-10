-- Activity log visibility scoped to authorized personnel only.
-- Users can read their own logs. Admins and Co-Founders can read all.

create policy "select activity logs for authorized users" on activity_logs
  for select using (
    auth.role() = 'authenticated'
    and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid()
        and (
          activity_logs.user_legacy_id = u.legacy_id
          or u.role_legacy_id in ('role_admin', 'role_cofounder')
        )
    )
  );

-- Only the authenticated user themselves may insert their own activity records.
-- Service-role inserts bypass RLS entirely — no separate service policy needed.

create policy "insert activity logs by authenticated user" on activity_logs
  for insert with check (
    auth.role() = 'authenticated'
    and activity_logs.user_legacy_id = (
      select u.legacy_id from users u
      where u.auth_user_id = auth.uid()
      limit 1
    )
  );