# Workforce application migration audit

## Architecture

- Next.js client application with Supabase browser auth.
- `global.*` is the authoritative identity/organization source.
- `workforce.*` owns documentation, resources, notifications, and HR workflows.
- `src/lib/workforce` is the canonical schema-specific client/RPC layer.
- `src/core/operon.ts` and `src/services/api.ts` remain the legacy in-memory compatibility façade while routes are migrated.

## Incompatibility audit

| File | Current/previous behavior | Problem | Required change | Risk |
|---|---|---|---|---|
| `src/auth/authAdapter.ts` | Resolved Finance-era identity fields | Wrong identity and role contract | Resolve `global.users` by `auth.uid()` and join `global.roles` | Critical |
| `src/services/documentPlatform.ts` | Used `supabase_auth_id`, text roles and free-text teams | Bypassed rebuilt visibility model | Replaced by Workforce RPC compatibility exports | Critical |
| `src/services/api.ts` | Mirrored local stores into default-schema HR/content tables | Could target Finance/public and bypass workflow RPCs | Disabled incompatible identity/content/notification writes; route migration still required | Critical |
| `src/security/permissions.ts` | Compressed roles into five Finance-era values | Creator/HR/Founder boundaries were ambiguous | Centralized normalized capabilities from `global.roles.name` | Critical |
| `src/features/notifications/NotificationBell.tsx` | Read local placeholder notifications | No recipient RLS/read-state contract | Replaced with Workforce notification RPCs | High |
| `src/features/reader/useDocumentReadPersistence.ts` | Stored progress only in local storage | Not version-specific or auditable | Added periodic/version-specific progress RPC | High |
| `src/features/reader/DocumentReaderShell.tsx` | Used raw original URL | Could bypass document authorization | Replaced with authorized download RPC | Critical |
| `src/app/page.tsx` | Presented hard-delete language and local archive action | Did not require archive reason/RPC | Uses reversible archive RPC with reason | High |
| Workforce route pages | Still compose legacy `operon` records | Shapes/statuses differ from rebuilt schema | Incrementally bind to the new module wrappers | Critical |

## Implemented sequence

1. Global identity and role resolution.
2. Central capability model and Creator route boundary.
3. Explicit `global`/`workforce` schema clients and typed RPC error handling.
4. Module adapters for documents, resources, search, notifications, onboarding,
   attendance, leave, probation, and deboarding.
5. Reader progress/download and notification UI migration.
6. Contract tests preventing unscoped identity/notification queries, hard content
   deletion, free-text team visibility, and browser service-role access.

## Remaining route migration

Attendance, Lifecycle, Probation, and the main document/resource list still use
the legacy compatibility store for portions of their display state. Their
mutations must be moved to `src/lib/workforce/*` before the local façade can be
deleted. No additional SQL migration is required for this work.
