"use client";

import { useAuth } from "@/auth/authContext";

export function useSession() {
  return useAuth();
}
