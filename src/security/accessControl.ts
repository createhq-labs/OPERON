import type { User } from "@/core/operon";
import {
  canDeleteDocument,
  canEditDocument,
  canManageResources,
  canUploadDocument,
  canManageUsers,
  canPublishGlobally,
} from "@/security/permissions";

export function requireAuthenticatedUser(user: User | null | undefined): asserts user is User {
  if (!user) {
    throw new Error("User must be authenticated to perform this action.");
  }
}

export function requireUploadPermission(user: User | null | undefined): asserts user is User {
  if (!canUploadDocument(user)) {
    throw new Error("User does not have permission to upload documents.");
  }
}

export function requirePublishingPermission(user: User | null | undefined): asserts user is User {
  if (!canPublishGlobally(user)) {
    throw new Error("User does not have permission to publish content globally.");
  }
}

export function requireRoleManagementPermission(user: User | null | undefined): asserts user is User {
  if (!canManageUsers(user)) {
    throw new Error("User does not have permission to manage roles.");
  }
}

export function requireResourceManagementPermission(user: User | null | undefined): asserts user is User {
  if (!canManageResources(user)) {
    throw new Error("User does not have permission to manage resources.");
  }
}

export function requireEditingPermission(user: User | null | undefined): asserts user is User {
  if (!canEditDocument(user)) {
    throw new Error("User does not have permission to edit documents.");
  }
}

export function requireDeletePermission(user: User | null | undefined): asserts user is User {
  if (!canDeleteDocument(user)) {
    throw new Error("User does not have permission to delete documents.");
  }
}

export function assertCanUpload(user: User | null): asserts user is User {
  requireAuthenticatedUser(user);
  requireUploadPermission(user);
}

export function assertCanPublish(user: User | null): asserts user is User {
  requireAuthenticatedUser(user);
  requirePublishingPermission(user);
}

export function assertCanManageRoles(user: User | null): asserts user is User {
  requireAuthenticatedUser(user);
  requireRoleManagementPermission(user);
}

export function assertCanManageResources(user: User | null): asserts user is User {
  requireAuthenticatedUser(user);
  requireResourceManagementPermission(user);
}
