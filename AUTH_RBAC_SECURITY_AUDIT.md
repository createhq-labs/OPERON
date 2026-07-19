# Authentication and RBAC production-readiness audit

## Decision

**Conditionally ready; do not execute the Workforce migrations in production
until the live identity and `global.users` RLS checks below pass.**

## Identity flow

Both password and Google authentication converge on the same path:

Self-signup is disabled — there is no "create account" path for either
password or Google authentication. HR provisions an employee's full record
(role, department, designation, manager, joining date, employment status)
*before* the person ever logs in, via an invitation created at
`/workforce/invitations`. Both password and Google authentication converge on
the same path after that:

1. Supabase Auth creates or restores `auth.users` and a session (Google will
   still create this row for anyone who clicks the button, invited or not —
   inherent to Supabase-managed OAuth; see step 5).
2. `SupabaseAuthAdapter.resolveIdentity()` selects `global.users` where
   `global.users.id = session.user.id` and `status = active` (`getCurrentUser()`
   is a thin wrapper over this for backward compatibility).
3. `global.roles.name` is loaded through `global.users.role_id`.
4. Centralized capabilities derive UI access from that database role name.
5. If no `global.users` row exists yet, `resolveIdentity()` calls
   `workforce.consume_employee_invitation()` — the *only* code path that
   ever writes to `global.users`, and it only ever acts on the calling
   session's own identity (`auth.uid()`), never a client-supplied target. If
   the caller's email matches a pending invitation, it atomically creates
   `global.users` + `workforce.employment_details` from what HR already
   entered and marks the invitation consumed; `resolveIdentity()` then
   returns the newly authenticated user. If no invitation matches, it
   returns `false` and touches nothing — `resolveIdentity()` returns a
   `"not_invited"` result instead of `null`, and `authContext.tsx` surfaces
   `status: "not_invited"` with a hard "contact HR" denial screen — no
   queue, no waiting state, no Workforce chrome, no protected routes. See
   `supabase-migrations/workforce-rebuild/008_workforce_employee_invitations.sql`.

Invitation metadata is never trusted over the authenticated session itself —
`consume_employee_invitation()` prefers the real name from the auth
provider's own metadata over HR's pre-filled guess. The browser never
creates `global.users`, assigns roles, departments, managers, or permissions
directly — the one and only write path is `consume_employee_invitation()`,
and the one and only place a role is ever *chosen* is
`create_employee_invitation()`, gated on `can_manage_onboarding()` plus an
admin-only check for assigning any HR/founder-tier role.

## Central role mapping

The authoritative mapping is implemented in
`src/lib/workforce/capabilities.ts`. The temporary legacy `roleId` projection in
`authAdapter.ts` exists only for compatibility with screens not yet migrated;
Workforce capabilities use `roleName`.

| Global role | Workforce authorization |
|---|---|
| Co-Founder | All Workforce management, HR approval, final probation, both deboarding tracks |
| HR Manager | Employment, onboarding, attendance, HR leave approval, probation recommendations, employee deboarding |
| HR Executive | Employment, onboarding, attendance, probation recommendations; no final probation decision |
| Category Lead / IM Team Lead | Content management, manager leave actions, Creator deboarding approval |
| Creator Acquisition | Creator deboarding initiation; no employee HR administration |
| Finance Manager | Manager-level leave/direct-report behavior; no HR-wide authority |
| Creator | Documents/resources/notifications only; no Workforce HR or Leave/WFH |
| Other employee roles / Intern | Personal attendance and Leave/WFH subject to RLS |

Finance access is not granted by this capability layer.

## Static RLS verification

- Workforce tables created: **36**.
- RLS enabled: **36/36**.
- RLS forced: **36/36**.
- Anonymous grants found: **0**.
- Audited `SECURITY DEFINER` functions without fixed `search_path`: **0**.
- Operational RPCs revoke execution from `PUBLIC` before authenticated grants.
- Identity helpers resolve active users through `global.users.id = auth.uid()`.

RLS is the authorization boundary. Client route guards are usability controls,
not a substitute for database authorization.

## Production blockers

1. The repository cannot prove the live 1:1 `auth.users`/`global.users`
   relationship. Run `scripts/verify-production-identity.sql` as an authorized
   database administrator.
2. The Workforce migrations do not own `global.users` policies. Confirm its RLS
   prevents authenticated users from enumerating or modifying other identities.
3. Some route display state still comes from the legacy in-memory `operon`
   compatibility layer. Until those routes use Workforce RPC results exclusively,
   production data behavior is not fully end-to-end validated.
4. The browser uses direct schema RPCs. Confirm `global` and `workforce` are
   exposed in PostgREST while `public` Finance permissions remain unchanged.
5. Run adversarial tests with real Creator, employee, manager, HR Executive, HR
   Manager, Creator Acquisition, content-lead, and Co-Founder accounts after
   applying migrations in staging.

## Session and bypass verification

- `SIGNED_IN`, `TOKEN_REFRESHED`, and `USER_UPDATED` all re-resolve the current
  user from `global.users`; roles are not retained solely from the old session.
- `SIGNED_OUT` clears application identity.
- An orphaned Auth session resolves to `null` and cannot create its own profile.
- Local role selection requires both `NODE_ENV === development` and
  `NEXT_PUBLIC_BOOTSTRAP_AUTH === true`; production builds cannot activate it.
- Service-role access is confined to server-only modules. Browser Supabase code
  contains only the anonymous key.

## Reader compatibility

Acknowledgements, reads, progress, downloads, and notifications all resolve the
current Workforce user through `workforce.my_user_id()`, which resolves
`global.users.id = auth.uid()`. Progress and acknowledgement remain distinct and
version-specific.
