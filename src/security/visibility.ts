import type { User, VisibilityScope } from "@/core/operon";
import { hasVisibilityAccess } from "@/security/permissions";

export function isVisibleToUser(
  user: User | null,
  visibility: VisibilityScope,
  departmentId?: string,
  userTypes?: string[],
  authorId?: string,
): boolean {
  return hasVisibilityAccess(user, visibility, departmentId, userTypes, authorId);
}

export function filterVisibleItems<T extends { visibility: VisibilityScope; departmentId?: string; allowedUserTypes?: string[]; authorId?: string }>(
  user: User | null,
  items: T[],
): T[] {
  return items.filter((item) =>
    isVisibleToUser(user, item.visibility, item.departmentId, item.allowedUserTypes, item.authorId),
  );
}
