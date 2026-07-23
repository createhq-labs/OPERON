# Workforce rebuild migrations

Run these files in numeric order against a database where `global.users`,
`global.roles`, and `global.departments` already exist. The rebuild creates and
changes objects in `workforce.*`; it does not mutate Finance objects in
`public.*`.

The combined `003` and `004` files intentionally contain two transactions each,
preserving the attendance/leave and probation/deboarding sub-migration safety
boundaries supplied in the source specification.

Before using the web application:

1. Expose the `global` and `workforce` schemas through the Supabase API.
2. Enable Email authentication and configure the Google provider if required.
3. Self-signup is disabled — there is no self-service provisioning path at
   all. Before anyone's first login, HR/admin creates their `auth.users`
   entry directly (Supabase dashboard → Authentication → Users → Add user)
   *and* a matching `global.users` row (same UUID as `auth.users.id`, per
   the identity rule) with their role/department/designation/manager/
   joining date already set. `/api/auth/session` (server-side, service-role)
   is the only place identity ever gets resolved — it looks for that
   `global.users` row and either returns it or denies access outright
   ("contact HR") if no matching row exists. No invitation table, no queue,
   no automatic linking on first login.
4. Configure the site URL and allowed redirect URLs in Supabase Auth.
5. The Library's Upload Document / Replace File flow needs **no new
   migration at all** — it's built entirely on tables `001_workforce_foundation.sql`
   already created and applied: `workforce.documents` /
   `workforce.document_versions` for the file/version rows,
   `workforce.document_categories` (previously empty — now seeded on
   demand, one row per `DocTag`, via `resolveCategoryId()` in
   `src/app/api/documents/categories.ts`) instead of a dedicated `tag`
   column, and the `document_allowed_roles` / `document_allowed_departments`
   junction tables for permissions instead of array columns. `storage_path`
   holds the Drive file ID and `preview_url` holds its `webViewLink` —
   there's no separate `drive_file_id` column either.

   One real, deliberate behavior change this implies: `document_allowed_roles.role_id`
   references `global.roles` — the real role catalog (Co-Founder, HR
   Manager, HR Executive, Category Lead, etc.), not the collapsed 5-value
   `roleId` string (`admin`/`team_lead`/…) used elsewhere for capability
   checks. So the Upload/Edit document forms' "Visible to" picker now shows
   the real role catalog (fetched via the same `listAssignableRoles()` the
   HR invitation form already uses), not the app's simplified role set. A
   document's caller-side access check in `src/app/api/documents/access.ts`
   accordingly compares against the caller's real `global.roles.id`
   (`User.globalRoleId`, added in `src/app/api/documents/identity.ts`), not
   the collapsed `roleId`.

   There is also no persisted upload-status/retry state: a `documents` row
   is only ever inserted after the Drive upload has already succeeded, so
   a failed upload leaves no trace and simply surfaces an error for the
   user to resubmit — no separate `Retry` action in the Library.

   The upload path itself is entirely server-mediated: the browser sends
   the file to `/api/documents/upload`, which uploads it via one central
   Drive *service account* (`GOOGLE_SERVICE_ACCOUNT_JSON` +
   `GOOGLE_DRIVE_FOLDER_ID` in the server environment) and only then writes
   the row. No end user ever sees Google account/OAuth controls — Drive is
   invisible infrastructure. Requires a Google Cloud service account with
   `client_email` shared on either a Shared Drive or a folder owned by a
   real user (a bare service account has no Drive storage quota of its
   own). `/api/documents/sync` (a Vercel Cron target, see `vercel.json`)
   periodically re-fetches each document's Drive metadata and overwrites
   `file_name`/`mime_type`/`file_size_bytes` in place, so a file edited
   directly in Drive (outside the app) still shows current metadata —
   title/description/category/visibility/roles are app-only and are never
   touched by that job.

`007_workforce_operational_queries.sql` includes the final integrity audit.
After all migrations complete, run:

```sql
select * from workforce.audit_workforce_integrity();
```

The healthy result is zero rows.

## Recently done

Removed the root-level `supabase-migrations/001`–`010` files (everything
outside this `workforce-rebuild/` folder). None of them had ever been applied
to the live database (confirmed via `information_schema` checks against the
real project before deletion). Two different reasons:

- **`002`–`009`** (role/permission/core-access/`workforce.*` files) were an
  earlier draft of this same rebuild that got superseded before ever
  shipping — their function signatures (e.g. `workforce.my_role()`,
  `workforce.can_view()`) don't match what's actually live, which is this
  `workforce-rebuild/` folder's naming (`my_role_id()`/`my_role_name()`,
  `can_view_document()`, etc.).
- **`001_service_account_drive_refactor.sql`** (Drive-sync columns on
  `public.documents`) and **`010_hr_domain_on_public_users.sql`** (legacy
  `public.hr_onboarding`/`hr_leave_requests`/`hr_attendance`/`hr_probation`
  tables) were real, still-referenced-by-code migrations that were simply
  never run — `src/services/driveAutoSync.ts` and the legacy
  `/workforce/onboarding` + `/workforce/probation` pages (`core/operon.ts`)
  depend on schema these would have created. Removed on explicit
  confirmation that Drive auto-sync and the legacy `core/operon.ts`
  onboarding/probation pages are being abandoned/replaced rather than
  fixed — not because the underlying need was ever actually met.

Also removed the now-orphaned `supabase/policies/*.sql` folder (14 files —
`hr_onboarding.sql`, `hr_attendance.sql`, `documents.sql`,
`drive_accounts.sql`, etc.) — RLS `CREATE POLICY` statements written against
the tables `001`/`010` would have created. With those migrations gone, these
policies had nothing left to apply to.

Replaced the per-user Google OAuth Drive connector (`/api/drive` route,
`src/services/googleDriveClient.ts`, `src/services/drive.ts` — "connect your
Google account," attach/sync/webhook) with a single centrally managed
service-account integration (`src/services/googleDriveServiceAccount.ts`,
resurrected from an earlier unused-code sweep since it was actually the
right shape for this). The OAuth connector was already dead code — no
client credentials were configured and nothing in the UI triggered it — and
the new design specifically requires Drive to be invisible to end users, so
it was deleted rather than kept as a second, unused pipeline. Note: this
also leaves the local-upload ingestion/parsing pipeline
(`src/services/ingestion/*`, `src/services/parser/{baseParser,parserFactory}.ts`)
fully orphaned, since the new upload path stores files in Drive without
running them through that parser — flagged, not removed, since it's a
separate subsystem this change didn't set out to touch.

Removed the employee-invitation self-provisioning flow entirely —
`008_workforce_employee_invitations.sql` (never applied to the live
database), `workforce.employee_invitations`/`create_employee_invitation()`/
`revoke_employee_invitation()`/`consume_employee_invitation()`,
`/workforce/invitations` (the HR-facing invitation form), and the
invitation-specific exports from `src/lib/workforce/invitations.ts`
(`listAssignableRoles`/`listAssignableDepartments` stay — the document
upload/edit permission pickers use those independently of invitations).
HR now provisions `global.users` directly (see step 3 above) rather than
pre-creating an invitation a first login later consumes — simpler, and it
matches how the pre-existing Finance Dashboard already provisions
`public.users` for its own users.

Also fixed the actual login bug this surfaced: `authAdapter.ts` was
querying `global.users` directly from the browser (anon-key client), which
the `authenticated` role has never had grants for — that table predates
this app and was never covered by any of its own migrations. Identity
resolution now goes through `/api/auth/session` (service-role, server-side)
instead, the same pattern `/api/documents/*` already uses for the
Drive-backed document system, and the same pattern Finance's own
`/api/auth/session` uses against `public.users` — the browser never runs a
privileged query against Postgres directly for anything permission-
sensitive.
