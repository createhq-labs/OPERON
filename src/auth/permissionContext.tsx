"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { useAuth } from "@/auth/authContext";
import { canEditDocument, canDeleteDocument, canUploadDocument, canManageResources } from "@/security/permissions";

interface PermissionContextValue {
  user: ReturnType<typeof useAuth>["user"];
  canEditDocument: () => boolean;
  canDeleteDocument: () => boolean;
  canUploadDocument: () => boolean;
  canManageResources: () => boolean;
}

const PermissionContext = createContext<PermissionContextValue>({
  user: null,
  canEditDocument: () => false,
  canDeleteDocument: () => false,
  canUploadDocument: () => false,
  canManageResources: () => false,
});

export function PermissionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const value: PermissionContextValue = {
    user,
    canEditDocument: () => canEditDocument(user),
    canDeleteDocument: () => canDeleteDocument(user),
    canUploadDocument: () => canUploadDocument(user),
    canManageResources: () => canManageResources(user),
  };

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

export function usePermissions() {
  return useContext(PermissionContext);
}
