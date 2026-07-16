-- Notifications: visible to whoever matches the audience (all / their role /
-- their department / explicitly named). Only HR/Admin/Co-Founder may create
-- them — every notification today comes out of an HR workflow action.

create policy "select matching audience notifications" on notifications
  for select using (
    auth.role() = 'authenticated'
    and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid()
        and (
          notifications.audience = 'all'
          or (notifications.audience = 'user' and u.legacy_id = any(notifications.user_ids))
          or (notifications.audience = 'role' and u.role_legacy_id = any(notifications.role_ids))
          or (notifications.audience = 'department' and u.department_legacy_id = any(notifications.department_ids))
        )
    )
  );

create policy "hr tier insert notifications" on notifications
  for insert with check (
    auth.role() = 'authenticated'
    and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid()
        and u.role_legacy_id in ('role_hr', 'role_admin', 'role_cofounder')
    )
  );

-- Recipients may update unread_by on their own matching notifications
-- (marking read); RLS does not enforce which columns change.
create policy "update matching audience notifications" on notifications
  for update using (
    auth.role() = 'authenticated'
    and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid()
        and (
          notifications.audience = 'all'
          or (notifications.audience = 'user' and u.legacy_id = any(notifications.user_ids))
          or (notifications.audience = 'role' and u.role_legacy_id = any(notifications.role_ids))
          or (notifications.audience = 'department' and u.department_legacy_id = any(notifications.department_ids))
        )
    )
  ) with check (auth.role() = 'authenticated');
