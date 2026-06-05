import type { User, VisibilityScope } from "@/core/operon";
import { hasVisibilityAccess } from "@/security/permissions";

export function isVisibleToUser(
  user: User | null,
  visibility: VisibilityScope,
  departmentId?: string,
  userTypes?: string[],
  authorId?: string,
  allowedDepartments?: string[],
  allowedTeamIds?: string[],
): boolean {
  if (allowedDepartments?.length && (!user?.departmentId || !allowedDepartments.includes(user.departmentId))) {
    return false;
  }

  if (allowedTeamIds?.length && (!user?.teamId || !allowedTeamIds.includes(user.teamId))) {
    return false;
  }

  return hasVisibilityAccess(user, visibility, departmentId, userTypes, authorId);
}

export function filterVisibleItems<T extends { visibility: VisibilityScope; departmentId?: string; allowedUserTypes?: string[]; authorId?: string; allowedDepartments?: string[]; allowedTeamIds?: string[] }>(
  user: User | null,
  items: T[],
): T[] {
  return items.filter((item) =>
    isVisibleToUser(user, item.visibility, item.departmentId, item.allowedUserTypes, item.authorId, item.allowedDepartments, item.allowedTeamIds),
  );
}
