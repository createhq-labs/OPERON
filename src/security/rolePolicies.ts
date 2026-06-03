import type { RoleId } from "@/core/operon";

export const UPLOAD_ROLES: Set<RoleId> = new Set([
  "role_admin",
  "role_cofounder",
  "role_hr",
  "role_finance",
  "role_im_team_lead",
  "role_tm_team_lead",
]);

export const PUBLISH_ROLES: Set<RoleId> = new Set([
  "role_admin",
  "role_cofounder",
  "role_hr",
  "role_finance",
  "role_im_team_lead",
  "role_tm_team_lead",
]);

export const RESOURCE_MANAGER_ROLES: Set<RoleId> = new Set([
  "role_admin",
  "role_hr",
  "role_finance",
  "role_im_team_lead",
  "role_tm_team_lead",
]);

export function isUploadRole(roleId: RoleId | string | undefined): boolean {
  return roleId !== undefined && UPLOAD_ROLES.has(roleId as RoleId);
}

export function isPublishRole(roleId: RoleId | string | undefined): boolean {
  return roleId !== undefined && PUBLISH_ROLES.has(roleId as RoleId);
}

export function isResourceManagerRole(roleId: RoleId | string | undefined): boolean {
  return roleId !== undefined && RESOURCE_MANAGER_ROLES.has(roleId as RoleId);
}
