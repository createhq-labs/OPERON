import { supabase } from "@/lib/supabase";
import type { UUID } from "./types";

export interface AssignmentOption {
  id: UUID;
  name: string;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Role/department options — these live on global.*, used by the document
 * upload/edit permission pickers. Fetched through the trusted
 * /api/workforce/employees backend route (service-role) rather than
 * queried directly from the browser: the authenticated role has never had
 * grants on global.* (that schema predates this app's own migrations), so
 * a direct client query 403s.
 */
async function getDirectoryOptions(): Promise<{ roles: AssignmentOption[]; departments: AssignmentOption[] }> {
  const headers = await authHeaders();
  const response = await fetch("/api/workforce/employees?options=true", { headers });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "Failed to load role/department options.");
  }
  return { roles: payload.roles ?? [], departments: payload.departments ?? [] };
}

export async function listAssignableRoles(): Promise<AssignmentOption[]> {
  return (await getDirectoryOptions()).roles;
}

export async function listAssignableDepartments(): Promise<AssignmentOption[]> {
  return (await getDirectoryOptions()).departments;
}
