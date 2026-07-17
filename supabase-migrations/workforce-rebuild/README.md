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
3. Provision each approved Auth account in `global.users` with the same UUID as
   `auth.users.id`, plus a valid role and department. Browser clients do not
   create or assign identity/RBAC rows.
4. Configure the site URL and allowed redirect URLs in Supabase Auth.

`007_workforce_operational_queries.sql` includes the final integrity audit.
After all migrations complete, run:

```sql
select * from workforce.audit_workforce_integrity();
```

The healthy result is zero rows.
