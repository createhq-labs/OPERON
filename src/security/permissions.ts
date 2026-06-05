import type { User, VisibilityScope } from "@/core/operon";
import { hasPermission, isAdmin } from "@/core/operon";

export function canEditDocument(user: User | null | undefined): boolean {
  return Boolean(user && hasPermission(user, "edit_documents"));
}

export function canDeleteDocument(user: User | null | undefined): boolean {
  return Boolean(user && hasPermission(user, "delete_documents"));
}

export function canUploadDocument(user: User | null | undefined): boolean {
  return Boolean(user && hasPermission(user, "manage_uploads"));
}

export function canManageResources(user: User | null | undefined): boolean {
  return Boolean(user && (hasPermission(user, "manage_resources") || hasPermission(user, "manage_roles")));
}

export function canManageUsers(user: User | null | undefined): boolean {
  return Boolean(user && (hasPermission(user, "manage_users") || hasPermission(user, "manage_roles")));
}

export function canViewResource(user: User | null | undefined, visibility: VisibilityScope): boolean {
  if (!user) {
    return visibility === "global";
  }
  return true;
}

export function canViewResources(user: User | null | undefined): boolean {
  return Boolean(user && hasPermission(user, "view_resources"));
}

export function canViewActivity(user: User | null | undefined): boolean {
  return Boolean(user && hasPermission(user, "view_activity"));
}

export function canPublishGlobally(user: User | null | undefined): boolean {
  return Boolean(user && hasPermission(user, "send_to_all"));
}

export function canManageDrive(user: User | null | undefined): boolean {
  if (!user) return false;
  const allowedRoles = [
    "role_cofounder",
    "role_hr",
    "role_finance",
    "role_im_team_lead",
    "role_tm_team_lead",
  ];
  return allowedRoles.includes(user.roleId);
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
    return user.departmentId === itemDepartmentId || isAdmin(user);
  }

  if (itemVisibility === "private") {
    return user.id === authorId || isAdmin(user);
  }

  return itemUserTypes?.includes(user.userType) ?? false;
}
