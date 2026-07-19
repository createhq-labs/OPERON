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
