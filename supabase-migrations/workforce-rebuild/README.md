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
3. As of `008_workforce_pending_signups.sql`, provisioning is no longer a
   manual DB step: a first-time sign-in with no matching `global.users` row
   registers a `workforce.pending_signups` request and notifies HR
   (Co-Founder/HR Manager/HR Executive). HR reviews the queue at
   `/workforce/signups` and approves or rejects via
   `workforce.decide_pending_signup(...)`, which is the only code path that
   ever inserts into `global.users` (same UUID as `auth.users.id`, per the
   identity rule). Browser clients still never create or assign identity/RBAC
   rows directly.
4. Configure the site URL and allowed redirect URLs in Supabase Auth.

`007_workforce_operational_queries.sql` includes the final integrity audit.
After all migrations complete, run:

```sql
select * from workforce.audit_workforce_integrity();
```

The healthy result is zero rows.

`008_workforce_pending_signups.sql` requires `global.users.designation_id`
(confirmed `NOT NULL`, no default on the live schema) — the approval RPC and
the `/workforce/signups` review screen both require a designation, scoped to
the selected department via `global.designations.department_id`. Confirmed:
`global.users` has no `team_id` or `business_line` column, so the migration's
defensive checks for those two fields will always no-op on the current
schema (harmless — it just means neither persists until such columns exist).
