import type { RoleId } from "@/core/types";
import { ROLE_IDS } from "@/core/roles";

// ─────────────────────────────────────────────────────────────────────────────
// Platform Administration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Founder-tier bypass for the legacy in-memory leave-request engine
 * (src/core/operon.ts's submitLeaveRequest/approveLeave* functions, which
 * still operate on the collapsed 5-value roleId and haven't been migrated
 * to the real global.* identity model). Everything in
 * src/security/permissions.ts now checks the real Co-Founder role name
 * directly instead of this set — this export only remains for that legacy
 * engine's own internal use.
 */
export const FOUNDER_TIER_ROLES: ReadonlySet<RoleId> = new Set<RoleId>([
  ROLE_IDS.ADMIN,
]);
