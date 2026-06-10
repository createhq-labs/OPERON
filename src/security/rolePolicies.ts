import type { RoleId } from "@/core/types";
import { ROLE_IDS } from "@/core/roles";

/**
 * Roles that may upload documents.
 * Co-Founder, Admin, HR, Finance, Team Leads, and Content Creator.
 * Content Creator is explicitly included per the PRD.
 */
export const UPLOAD_ROLES: ReadonlySet<RoleId> = new Set<RoleId>([
  ROLE_IDS.COFOUNDER,
  ROLE_IDS.ADMIN,
  ROLE_IDS.HR,
  ROLE_IDS.FINANCE,
  ROLE_IDS.IM_TEAM_LEAD,
  ROLE_IDS.TM_TEAM_LEAD,
  ROLE_IDS.CONTENT_CREATOR,
]);

/**
 * Roles that may publish content globally (visible to all users).
 * UPLOAD_ROLES and PUBLISH_ROLES are intentionally identical except for
 * CONTENT_CREATOR — creators can upload but cannot publish globally.
 */
export const PUBLISH_ROLES: ReadonlySet<RoleId> = new Set<RoleId>([
  ROLE_IDS.COFOUNDER,
  ROLE_IDS.ADMIN,
  ROLE_IDS.HR,
  ROLE_IDS.FINANCE,
  ROLE_IDS.IM_TEAM_LEAD,
  ROLE_IDS.TM_TEAM_LEAD,
]);

/**
 * Roles that may create, edit, and delete resource entries.
 */
export const RESOURCE_MANAGER_ROLES: ReadonlySet<RoleId> = new Set<RoleId>([
  ROLE_IDS.COFOUNDER,
  ROLE_IDS.ADMIN,
  ROLE_IDS.HR,
  ROLE_IDS.FINANCE,
  ROLE_IDS.IM_TEAM_LEAD,
  ROLE_IDS.TM_TEAM_LEAD,
]);

/**
 * Roles that may connect and configure the Google Drive integration.
 */
export const DRIVE_MANAGER_ROLES: ReadonlySet<RoleId> = new Set<RoleId>([
  ROLE_IDS.COFOUNDER,
  ROLE_IDS.ADMIN,
]);

/**
 * Roles that may manage users (create, edit, assign roles).
 */
export const USER_MANAGER_ROLES: ReadonlySet<RoleId> = new Set<RoleId>([
  ROLE_IDS.COFOUNDER,
  ROLE_IDS.ADMIN,
]);

/**
 * Roles that may manage the role registry itself.
 * Intentionally narrower than USER_MANAGER_ROLES — only platform owners
 * may define what roles exist.
 */
export const ROLE_MANAGER_ROLES: ReadonlySet<RoleId> = new Set<RoleId>([
  ROLE_IDS.COFOUNDER,
  ROLE_IDS.ADMIN,
]);

// ─── Predicates ───────────────────────────────────────────────────────────────

export function isUploadRole(roleId: RoleId | null | undefined): boolean {
  return roleId != null && UPLOAD_ROLES.has(roleId);
}

export function isPublishRole(roleId: RoleId | null | undefined): boolean {
  return roleId != null && PUBLISH_ROLES.has(roleId);
}

export function isResourceManagerRole(
  roleId: RoleId | null | undefined
): boolean {
  return roleId != null && RESOURCE_MANAGER_ROLES.has(roleId);
}

export function isDriveManagerRole(roleId: RoleId | null | undefined): boolean {
  return roleId != null && DRIVE_MANAGER_ROLES.has(roleId);
}

export function isUserManagerRole(roleId: RoleId | null | undefined): boolean {
  return roleId != null && USER_MANAGER_ROLES.has(roleId);
}

export function isRoleManagerRole(roleId: RoleId | null | undefined): boolean {
  return roleId != null && ROLE_MANAGER_ROLES.has(roleId);
}