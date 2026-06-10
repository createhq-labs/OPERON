"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
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
import type { User } from "@/core/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PermissionContextValue {
  user: User | null;
  canEditDocument: () => boolean;
  canDeleteDocument: () => boolean;
  canUploadDocument: () => boolean;
  canManageResources: () => boolean;
  canManageUsers: () => boolean;
  canViewResources: () => boolean;
  canViewActivity: () => boolean;
  canPublishGlobally: () => boolean;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const PermissionContext = createContext<PermissionContextValue>({
  user: null,
  canEditDocument: () => false,
  canDeleteDocument: () => false,
  canUploadDocument: () => false,
  canManageResources: () => false,
  canManageUsers: () => false,
  canViewResources: () => false,
  canViewActivity: () => false,
  canPublishGlobally: () => false,
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function PermissionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  // Re-computed only when `user` identity changes. Each permission function
  // is a stable closure over the captured `user` reference, so downstream
  // components that call e.g. canUploadDocument() do not need to be wrapped
  // in useMemo themselves.
  const value = useMemo<PermissionContextValue>(
    () => ({
      user,
      canEditDocument: () => canEditDocument(user),
      canDeleteDocument: () => canDeleteDocument(user),
      canUploadDocument: () => canUploadDocument(user),
      canManageResources: () => canManageResources(user),
      canManageUsers: () => canManageUsers(user),
      canViewResources: () => canViewResources(user),
      canViewActivity: () => canViewActivity(user),
      canPublishGlobally: () => canPublishGlobally(user),
    }),
    [user]
  );

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Returns the current user's permission set.
 * Must be used inside <PermissionProvider>.
 */
export function usePermissions(): PermissionContextValue {
  return useContext(PermissionContext);
}