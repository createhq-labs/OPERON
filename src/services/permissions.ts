import type {
  DeptId,
  Document,
  DriveDocumentReference,
  RoleId,
  UserType,
  VisibilityScope,
} from "@/core/operon";

// ─── Search Serializers ───────────────────────────────────────────────────────
// Utility functions for building the full-text search corpus from domain
// objects. Kept here (services layer) rather than security layer because
// they have no relationship to access control.

export function createSearchFilter(
  query = "",
  departmentId?: DeptId | "all"
) {
  const cleanQuery = query.trim().toLowerCase();
  return {
    cleanQuery,
    departmentId,
    matchesDepartment(itemDepartmentId?: DeptId): boolean {
      return (
        !departmentId ||
        departmentId === "all" ||
        itemDepartmentId === departmentId
      );
    },
  };
}

export function normalizeSearchText(value: string | undefined): string {
  return (value ?? "").toLowerCase();
}

export function serializeDocumentSearchText(document: Document): string {
  return [
    document.title,
    document.description,
    document.dept,
    document.tag,
    document.rawSourceUrl,
    document.author,
    document.storagePath,
    document.storageBucket,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function serializeDriveDocumentSearchText(
  document: DriveDocumentReference
): string {
  const permissionSummary = document.permissionSummary
    ?.map((p) => `${p.role} ${p.emailAddress ?? ""}`)
    .join(" ");

  return [
    document.title,
    document.description,
    document.dept,
    document.tag,
    document.author,
    document.driveUrl,
    document.folderName,
    document.fileMimeType,
    permissionSummary,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

// ─── Visibility Check ─────────────────────────────────────────────────────────
// Full document-level visibility check used by the search and list services.
// Accepts a structured item rather than individual fields to handle the
// allowedRoleIds and allowedTeamIds gates that don't belong in the simpler
// security/permissions.ts hasVisibilityAccess.

export interface VisibilityCheckItem {
  visibilityScope: VisibilityScope;
  departmentId?: DeptId;
  allowedDepartments?: DeptId[];
  allowedRoleIds: RoleId[];
  assignedUserIds?: string[];
  allowedUserTypes: UserType[];
  allowedTeamIds?: string[];
}

export function hasDocumentVisibilityAccess(
  userId: string | undefined,
  userRoleId: RoleId | undefined,
  userDepartmentId: string | undefined,
  userTeamId: string | undefined,
  userType: UserType | undefined,
  item: VisibilityCheckItem
): boolean {
  if (item.visibilityScope === "global") return true;

  // Role allowlist.
  if (userRoleId && item.allowedRoleIds.includes(userRoleId)) return true;

  // Team allowlist.
  if (userTeamId && item.allowedTeamIds?.includes(userTeamId)) return true;

  // Department scope.
  if (item.visibilityScope === "department") {
    if (!userDepartmentId) return false;
    return (
      item.departmentId === userDepartmentId ||
      (item.allowedDepartments?.includes(userDepartmentId) ?? false)
    );
  }

  // Private scope — explicit user assignment.
  if (item.visibilityScope === "private") {
    return userId != null && (item.assignedUserIds?.includes(userId) ?? false);
  }

  // User type fallback.
  return userType != null && item.allowedUserTypes.includes(userType);
}