"use client";

import { type PropsWithChildren } from "react";
import { AuthProvider as InternalAuthProvider } from "@/auth/authContext";

export function AuthProvider({ children }: PropsWithChildren) {
  return <InternalAuthProvider>{children}</InternalAuthProvider>;
}
