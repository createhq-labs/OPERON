import type { User, VisibilityScope } from "@/core/types";
import { hasPermission, isAdmin } from "@/core/operon";
import {
  DRIVE_MANAGER_ROLES,
  RESOURCE_MANAGER_ROLES,
  USER_MANAGER_ROLES,
  ROLE_MANAGER_ROLES,
} from "@/security/rolePolicies";

// ─── Document Permissions ─────────────────────────────────────────────────────

export function canEditDocument(user: User | null | undefined): boolean {
  return Boolean(user && hasPermission(user, "edit_documents"));
}

export function canDeleteDocument(user: User | null | undefined): boolean {
  return Boolean(user && hasPermission(user, "delete_documents"));
}

export function canUploadDocument(user: User | null | undefined): boolean {
  return Boolean(user && hasPermission(user, "manage_uploads"));
}

// ─── Resource Permissions ─────────────────────────────────────────────────────

/**
 * Whether the user may create, edit, or delete resource entries.
 * Derived from the RESOURCE_MANAGER_ROLES policy set — does not conflate
 * with role management permissions.
 */
export function canManageResources(user: User | null | undefined): boolean {
  if (!user) return false;
  return (
    hasPermission(user, "manage_resources") ||
    RESOURCE_MANAGER_ROLES.has(user.roleId as never)
  );
}

export function canViewResources(user: User | null | undefined): boolean {
  return Boolean(user && hasPermission(user, "view_resources"));
}

// ─── User & Role Permissions ──────────────────────────────────────────────────

/**
 * Whether the user may create, edit, or deactivate other users.
 * Separate from canManageRoles — user management does not imply role management.
 */
export function canManageUsers(user: User | null | undefined): boolean {
  if (!user) return false;
  return (
    hasPermission(user, "manage_users") ||
    USER_MANAGER_ROLES.has(user.roleId as never)
  );
}

/**
 * Whether the user may define or modify the role registry.
 * Narrower than canManageUsers — only platform owners may change what roles exist.
 */
export function canManageRoles(user: User | null | undefined): boolean {
  if (!user) return false;
  return (
    hasPermission(user, "manage_roles") ||
    ROLE_MANAGER_ROLES.has(user.roleId as never)
  );
}

// ─── Publishing ───────────────────────────────────────────────────────────────

export function canPublishGlobally(user: User | null | undefined): boolean {
  return Boolean(user && hasPermission(user, "send_to_all"));
}

// ─── Activity ─────────────────────────────────────────────────────────────────

export function canViewActivity(user: User | null | undefined): boolean {
  return Boolean(user && hasPermission(user, "view_activity"));
}

// ─── Drive ────────────────────────────────────────────────────────────────────

/**
 * Whether the user may configure the Google Drive integration.
 * Uses DRIVE_MANAGER_ROLES as the canonical policy set — not a hardcoded list.
 */
export function canManageDrive(user: User | null | undefined): boolean {
  if (!user) return false;
  return DRIVE_MANAGER_ROLES.has(user.roleId as never);
}

// ─── Visibility Access ────────────────────────────────────────────────────────

/**
 * Low-level visibility check against a single document's scope.
 *
 * - "global"     → always visible
 * - "department" → visible to same department or admin
 * - "private"    → visible to users listed in assignedUserIds, or admin
 *
 * assignedUserIds corresponds to the `assigned_user_ids` column in the
 * documents table. `authorId` is not the correct field for private visibility
 * per the Supabase schema.
 */
export function hasVisibilityAccess(
  user: User | null,
  itemVisibility: VisibilityScope,
  itemDepartmentId?: string,
  itemUserTypes?: string[],
  assignedUserIds?: string[],
): boolean {
  if (!user) return itemVisibility === "global";

  if (isAdmin(user)) return true;

  switch (itemVisibility) {
    case "global":
      return true;

    case "department":
      return user.departmentId === itemDepartmentId;

    case "private":
      return assignedUserIds?.includes(user.id) ?? false;

    default:
      return itemUserTypes?.includes(user.userType) ?? false;
  }
}