# Authentication and RBAC production-readiness audit

## Decision

**Conditionally ready; do not execute the Workforce migrations in production
until the live identity and `global.users` RLS checks below pass.**

## Identity flow

Both password and Google authentication converge on the same path:

1. Supabase Auth creates or restores `auth.users` and a session.
2. `SupabaseAuthAdapter.resolveIdentity()` selects `global.users` where
   `global.users.id = session.user.id` and `status = active` (`getCurrentUser()`
   is now a thin wrapper over this for backward compatibility).
3. `global.roles.name` is loaded through `global.users.role_id`.
4. Centralized capabilities derive UI access from that database role name.
5. Missing or inactive `global.users` no longer bounces straight to login: the
   session is authenticated but unprovisioned, so `resolveIdentity()` returns a
   `"pending"` result instead of `null`. `authContext.tsx` surfaces this as
   `status: "pending_verification"`, registers a `workforce.pending_signups`
   row via `request_signup_verification()` (once per `AuthProvider` mount) and
   shows a dedicated pending screen — no Workforce chrome, no protected routes.
   HR is notified and reviews the request at `/workforce/signups`; only
   `decide_pending_signup()`'s explicit approval path ever inserts into
   `global.users` (see `supabase-migrations/workforce-rebuild/008_workforce_pending_signups.sql`).

Signup metadata (`full_name`) is not treated as authorization. The browser does
not create `global.users`, assign roles, departments, managers, or permissions —
the one and only write path is `decide_pending_signup()`, gated on
`can_manage_onboarding()` and reachable only after explicit HR approval.

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
