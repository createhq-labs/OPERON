import type { Role } from "@/core/operon";

export function getPermissionSummary(roles: Role[]) {
  return roles.map((role) => ({
    roleId: role.id,
    roleName: role.name,
    permissions: role.permissions,
  }));
}
