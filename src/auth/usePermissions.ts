"use client";

import { useAuth } from "@/auth/authContext";
import {
  canEditDocument,
  canDeleteDocument,
  canUploadDocument,
  canManageResources,
  canManageUsers,
  canViewResources,
  canViewActivity,
  canPublishGlobally,
} from "@/security/permissions";

export function usePermissions() {
  const { user } = useAuth();

  return {
    user,
    canEditDocument: () => canEditDocument(user),
    canDeleteDocument: () => canDeleteDocument(user),
    canUploadDocument: () => canUploadDocument(user),
    canManageResources: () => canManageResources(user),
    canManageUsers: () => canManageUsers(user),
    canViewResources: () => canViewResources(user),
    canViewActivity: () => canViewActivity(user),
    canPublishGlobally: () => canPublishGlobally(user),
  };
}
