// Role policies — sets and predicates
export {
  UPLOAD_ROLES,
  PUBLISH_ROLES,
  RESOURCE_MANAGER_ROLES,
  DRIVE_MANAGER_ROLES,
  USER_MANAGER_ROLES,
  ROLE_MANAGER_ROLES,
  isUploadRole,
  isPublishRole,
  isResourceManagerRole,
  isDriveManagerRole,
  isUserManagerRole,
  isRoleManagerRole,
} from "@/security/rolePolicies";

// Permission checks
export {
  canEditDocument,
  canDeleteDocument,
  canUploadDocument,
  canManageResources,
  canManageUsers,
  canManageRoles,
  canViewResources,
  canViewActivity,
  canPublishGlobally,
  canManageDrive,
  hasVisibilityAccess,
} from "@/security/permissions";

// Visibility filtering
export type { VisibleItem } from "@/security/visibility";
export {
  isVisibleToUser,
  filterVisibleItems,
  filterVisibleDocuments,
  filterVisibleResources,
} from "@/security/visibility";

// Access control guards
export {
  requireAuthenticatedUser,
  requireUploadPermission,
  requirePublishingPermission,
  requireEditingPermission,
  requireDeletePermission,
  requireResourceManagementPermission,
  requireUserManagementPermission,
  requireRoleManagementPermission,
  assertCanUpload,
  assertCanPublish,
  assertCanEdit,
  assertCanDelete,
  assertCanManageResources,
  assertCanManageUsers,
  assertCanManageRoles,
} from "@/security/accessControl";