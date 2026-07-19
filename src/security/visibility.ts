import type { User, VisibilityScope } from "@/core/types";
import { isAdmin } from "@/core/operon";
import { hasVisibilityAccess } from "@/security/permissions";

// ─── Core Check ───────────────────────────────────────────────────────────────

/**
 * Returns true if `user` may see an item with the given visibility parameters.
 *
 * Evaluation order:
 * 1. Admins always have access — checked first so allowedDepartments and
 *    allowedTeamIds restrictions cannot inadvertently block platform owners.
 * 2. allowedDepartments gate — if set, user's department must be listed.
 * 3. allowedTeamIds gate — if set, user's team must be listed.
 * 4. Core visibility scope check (global / department / private).
 */
export function isVisibleToUser(
  user: User | null,
  visibility: VisibilityScope,
  departmentId?: string,
  userTypes?: string[],
  assignedUserIds?: string[],
  allowedDepartments?: string[],
  allowedTeamIds?: string[],
): boolean {
  // Admins bypass all gates.
  if (user && isAdmin(user)) return true;

  // Department allowlist gate.
  if (allowedDepartments?.length) {
    if (!user?.departmentId || !allowedDepartments.includes(user.departmentId)) {
      return false;
    }
  }

  // Team allowlist gate.
  if (allowedTeamIds?.length) {
    if (!user?.teamId || !allowedTeamIds.includes(user.teamId)) {
      return false;
    }
  }

  return hasVisibilityAccess(user, visibility, departmentId, userTypes, assignedUserIds);
}
