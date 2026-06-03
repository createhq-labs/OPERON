import type { RoleId, Role, User } from "@/core/operon";

export function canAssignRole(actor: User, roleId: RoleId): boolean {
  if (actor.roleId === "role_admin") {
    return true;
  }
  if (roleId === "role_admin" || roleId === "role_cofounder") {
    return false;
  }
  return actor.roleId !== "role_intern";
}

export function validateRoleChange(actor: User, targetRoleId: RoleId): boolean {
  return canAssignRole(actor, targetRoleId);
}

export function getAssignableRoles(actor: User, roles: Role[]): Role[] {
  return roles.filter((role) => canAssignRole(actor, role.id));
}
