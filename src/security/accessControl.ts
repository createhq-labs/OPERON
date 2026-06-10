import type { User } from "@/core/types";
import {
  canDeleteDocument,
  canEditDocument,
  canManageResources,
  canManageUsers,
  canManageRoles,
  canUploadDocument,
  canPublishGlobally,
} from "@/security/permissions";

// ─── Require Guards ───────────────────────────────────────────────────────────
// These are TypeScript assertion functions — they throw on failure and
// narrow the type to `User` on success. Use them at service boundaries
// before performing operations that require a specific capability.
//
// Each function checks the relevant capability directly. The caller does not
// need to pre-check authentication — a null/unauthenticated user fails all
// capability checks and produces a clear error message.

export function requireAuthenticatedUser(
  user: User | null | undefined
): asserts user is User {
  if (!user) {
    throw new Error("Authentication required.");
  }
}

export function requireUploadPermission(
  user: User | null | undefined
): asserts user is User {
  if (!canUploadDocument(user)) {
    throw new Error(
      user
        ? "Your role does not have permission to upload documents."
        : "Authentication required."
    );
  }
}

export function requirePublishingPermission(
  user: User | null | undefined
): asserts user is User {
  if (!canPublishGlobally(user)) {
    throw new Error(
      user
        ? "Your role does not have permission to publish content globally."
        : "Authentication required."
    );
  }
}

export function requireEditingPermission(
  user: User | null | undefined
): asserts user is User {
  if (!canEditDocument(user)) {
    throw new Error(
      user
        ? "Your role does not have permission to edit documents."
        : "Authentication required."
    );
  }
}

export function requireDeletePermission(
  user: User | null | undefined
): asserts user is User {
  if (!canDeleteDocument(user)) {
    throw new Error(
      user
        ? "Your role does not have permission to delete documents."
        : "Authentication required."
    );
  }
}

export function requireResourceManagementPermission(
  user: User | null | undefined
): asserts user is User {
  if (!canManageResources(user)) {
    throw new Error(
      user
        ? "Your role does not have permission to manage resources."
        : "Authentication required."
    );
  }
}

export function requireUserManagementPermission(
  user: User | null | undefined
): asserts user is User {
  if (!canManageUsers(user)) {
    throw new Error(
      user
        ? "Your role does not have permission to manage users."
        : "Authentication required."
    );
  }
}

/**
 * Guards role registry operations (creating/modifying roles).
 * Distinct from requireUserManagementPermission — role management is
 * narrower and limited to platform owners.
 */
export function requireRoleManagementPermission(
  user: User | null | undefined
): asserts user is User {
  if (!canManageRoles(user)) {
    throw new Error(
      user
        ? "Your role does not have permission to manage the role registry."
        : "Authentication required."
    );
  }
}

// ─── Assert Helpers ───────────────────────────────────────────────────────────
// Composed guards for common operation patterns.
// Prefer these at call sites over calling require* functions individually.

export function assertCanUpload(
  user: User | null
): asserts user is User {
  requireUploadPermission(user);
}

export function assertCanPublish(
  user: User | null
): asserts user is User {
  requirePublishingPermission(user);
}

export function assertCanEdit(
  user: User | null
): asserts user is User {
  requireEditingPermission(user);
}

export function assertCanDelete(
  user: User | null
): asserts user is User {
  requireDeletePermission(user);
}

export function assertCanManageResources(
  user: User | null
): asserts user is User {
  requireResourceManagementPermission(user);
}

export function assertCanManageUsers(
  user: User | null
): asserts user is User {
  requireUserManagementPermission(user);
}

export function assertCanManageRoles(
  user: User | null
): asserts user is User {
  requireRoleManagementPermission(user);
}