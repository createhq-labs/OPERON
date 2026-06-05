-- Google Drive account ownership policies
create policy "select drive accounts for owner" on drive_accounts
  for select using (
    auth.role() = 'authenticated' and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid() and drive_accounts.user_legacy_id = u.legacy_id
    )
  );

create policy "insert drive accounts for authenticated owner" on drive_accounts
  for insert with check (
    auth.role() = 'authenticated' and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid() and drive_accounts.user_legacy_id = u.legacy_id
    )
  );

create policy "update drive accounts for owner" on drive_accounts
  for update using (
    auth.role() = 'authenticated' and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid() and drive_accounts.user_legacy_id = u.legacy_id
    )
  );

create policy "delete drive accounts for owner" on drive_accounts
  for delete using (
    auth.role() = 'authenticated' and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid() and drive_accounts.user_legacy_id = u.legacy_id
    )
  );
