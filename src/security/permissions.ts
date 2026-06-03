import type { User, RoleId, VisibilityScope } from "@/core/operon";
import { hasPermission } from "@/core/operon";
import { isPublishRole, isResourceManagerRole, isUploadRole } from "@/security/rolePolicies";

export function canEditDocument(user: User | null | undefined): boolean {
  return user !== null && user !== undefined && isPublishRole(user.roleId);
}

export function canDeleteDocument(user: User | null | undefined): boolean {
  return user !== null && user !== undefined && isPublishRole(user.roleId);
}

export function canUploadDocument(user: User | null | undefined): boolean {
  return user !== null && user !== undefined && isUploadRole(user.roleId);
}

export function canManageResources(user: User | null | undefined): boolean {
  return user !== null && user !== undefined && isResourceManagerRole(user.roleId);
}

export function canManageUsers(user: User | null | undefined): boolean {
  return user !== null && user !== undefined && user.roleId === "role_admin";
}

export function canViewResource(user: User | null | undefined, visibility: VisibilityScope): boolean {
  if (!user) {
    return visibility === "global";
  }
  return true;
}

export function canViewResources(user: User | null | undefined): boolean {
  return user !== null && user !== undefined && hasPermission(user, "view_resources");
}

export function canViewActivity(user: User | null | undefined): boolean {
  return user !== null && user !== undefined && hasPermission(user, "view_activity");
}

export function canPublishGlobally(user: User | null | undefined): boolean {
  return user !== null && user !== undefined && hasPermission(user, "send_to_all");
}

export function hasVisibilityAccess(
  user: User | null,
  itemVisibility: VisibilityScope,
  itemDepartmentId?: string,
  itemUserTypes?: string[],
  authorId?: string,
): boolean {
  if (!user) {
    return itemVisibility === "global";
  }

  if (itemVisibility === "global") {
    return true;
  }

  if (itemVisibility === "department") {
    return user.departmentId === itemDepartmentId || user.roleId === "role_admin";
  }

  if (itemVisibility === "private") {
    return user.id === authorId || user.roleId === "role_admin";
  }

  return itemUserTypes?.includes(user.userType) ?? false;
}
