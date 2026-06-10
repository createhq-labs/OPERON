import type { Role } from "@/core/operon";

export function getPermissionSummary(
  roles: Role[]
): Array<{ roleId: string; roleName: string; permissions: Role["permissions"] }> {
  return roles.map((role) => ({
    roleId: role.id,
    roleName: role.name,
    permissions: role.permissions,
  }));
}