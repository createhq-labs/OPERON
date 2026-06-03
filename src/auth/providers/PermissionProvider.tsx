"use client";

import { type PropsWithChildren } from "react";
import { PermissionProvider as InternalPermissionProvider } from "@/auth/permissionContext";

export function PermissionProvider({ children }: PropsWithChildren) {
  return <InternalPermissionProvider>{children}</InternalPermissionProvider>;
}
