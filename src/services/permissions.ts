import type {
  DeptId,
  Document,
  DriveDocumentReference,
  ResourceItem,
  RoleId,
  User,
  UserType,
  VisibilityScope,
} from "@/core/operon";

export function hasVisibilityAccess(
  user: User,
  item: {
    visibilityScope: VisibilityScope;
    departmentId?: DeptId;
    allowedDepartments?: DeptId[];
    allowedRoleIds: RoleId[];
    assignedUserIds?: string[];
    allowedUserTypes: UserType[];
    allowedTeamIds?: string[];
  },
  roleAllowed: boolean,
  userExplicitlyAllowed: boolean
) {
  if (item.visibilityScope === "global") {
    return true;
  }

  if (item.visibilityScope === "department") {
    if (
      user.departmentId &&
      (item.departmentId === user.departmentId || item.allowedDepartments?.includes(user.departmentId))
    ) {
      return true;
    }
  }

  if (user.roleId && item.allowedRoleIds.includes(user.roleId)) {
    return true;
  }

  if (user.teamId && item.allowedTeamIds?.includes(user.teamId)) {
    return true;
  }

  return roleAllowed || userExplicitlyAllowed;
}

export function createSearchFilter(query = "", departmentId?: DeptId | "all") {
  const cleanQuery = query.trim().toLowerCase();
  return {
    cleanQuery,
    departmentId,
    matchesDepartment: (itemDepartmentId?: DeptId) => {
      return !departmentId || departmentId === "all" || itemDepartmentId === departmentId;
    },
  };
}

export function normalizeSearchText(value: string | undefined) {
  return (value ?? "").toLowerCase();
}

export function serializeDocumentSearchText(document: Document) {
  const parts = [
    document.title,
    document.description,
    document.dept,
    document.tag,
    document.rawSourceUrl,
    document.author,
    document.storagePath,
    document.storageBucket,
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

export function serializeDriveDocumentSearchText(document: DriveDocumentReference) {
  const parts = [
    document.title,
    document.description,
    document.dept,
    document.tag,
    document.author,
    document.driveUrl,
    document.folderName,
    document.fileMimeType,
    document.permissionSummary?.map((permission) => `${permission.role} ${permission.emailAddress ?? ""}`).join(" "),
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
}
