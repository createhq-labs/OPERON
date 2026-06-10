import type { RoleId, Role, User } from "@/core/operon";
import { isAdmin } from "@/core/operon";

export function canAssignRole(actor: User, targetRoleId: RoleId): boolean {
  if (isAdmin(actor)) {
    return true;
  }
  if (targetRoleId === "role_admin" || targetRoleId === "role_cofounder") {
    return false;
  }
  return actor.roleId !== "role_intern";
}

export function getAssignableRoles(actor: User, roles: Role[]): Role[] {
  return roles.filter((role) => canAssignRole(actor, role.id));
}