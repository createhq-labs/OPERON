import type { User, VisibilityScope } from "@/core/types";
import { isAdmin } from "@/core/operon";
import { hasVisibilityAccess } from "@/security/permissions";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Minimum shape required for visibility filtering.
 * Field names match the Supabase schema column names as mapped by the ORM.
 */
export interface VisibleItem {
  visibilityScope: VisibilityScope;
  departmentId?: string;
  allowedUserTypes?: string[];
  /** Corresponds to `assigned_user_ids` in the documents/resources tables. */
  assignedUserIds?: string[];
  allowedDepartments?: string[];
  allowedTeamIds?: string[];
}

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

// ─── Collection Filters ───────────────────────────────────────────────────────

/**
 * Filters an array of items to those visible to `user`.
 * T must satisfy VisibleItem — field names must match the schema mapping.
 */
export function filterVisibleItems<T extends VisibleItem>(
  user: User | null,
  items: T[],
): T[] {
  // Admins see everything — skip per-item checks for performance.
  if (user && isAdmin(user)) return items;

  return items.filter((item) =>
    isVisibleToUser(
      user,
      item.visibilityScope,
      item.departmentId,
      item.allowedUserTypes,
      item.assignedUserIds,
      item.allowedDepartments,
      item.allowedTeamIds,
    )
  );
}

/**
 * Typed overload for Document arrays.
 * Documents use `visibility_scope` in the DB, mapped to `visibilityScope` here.
 */
export function filterVisibleDocuments<
  T extends VisibleItem & { id: string }
>(user: User | null, documents: T[]): T[] {
  return filterVisibleItems(user, documents);
}

/**
 * Typed overload for Resource arrays.
 */
export function filterVisibleResources<
  T extends VisibleItem & { id: string }
>(user: User | null, resources: T[]): T[] {
  return filterVisibleItems(user, resources);
}