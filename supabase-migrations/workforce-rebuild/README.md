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
3. As of `008_workforce_employee_invitations.sql`, self-signup is disabled —
   HR creates an employee's full record (role, department, designation,
   manager, joining date, employment status) at `/workforce/invitations`
   *before* that person ever logs in. On their first successful sign-in with
   the invited email (Google or password), `workforce.consume_employee_invitation()`
   automatically links the session to that record — the only code path
   that ever inserts into `global.users` (same UUID as `auth.users.id`, per
   the identity rule), and it only ever acts on the caller's own identity.
   No matching invitation → access denied outright, no queue, no
   notifications. Browser clients still never create or assign
   identity/RBAC rows directly; the only place a role is ever chosen is
   `workforce.create_employee_invitation(...)`, gated on
   `can_manage_onboarding()` plus an admin-only check for HR/founder-tier
   roles. This repo does not send the invitation email itself — the invited
   person can use "Continue with Google" with that address directly, or HR
   can use Supabase's own dashboard "invite user" feature for password
   access.
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

`008_workforce_employee_invitations.sql` requires `global.users.designation_id`
(confirmed `NOT NULL`, no default on the live schema) — `create_employee_invitation`
and the `/workforce/invitations` form both require a designation, scoped to
the selected department via `global.designations.department_id`. Confirmed:
`global.users` has no `team_id` or `business_line` column — not modeled in
this migration at all.

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
