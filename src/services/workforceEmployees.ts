import { supabase } from "@/lib/supabase";
import type { DeptId, RoleId, UserStatus, UserType } from "@/core/types";

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface WorkforceEmployee {
  id: string;
  name: string;
  email: string;
  userType: UserType;
  roleId: RoleId;
  roleName?: string;
  departmentId?: DeptId;
  departmentName?: string;
  designationId?: string;
  designationName?: string;
  supervisorId?: string;
  status: UserStatus;
  dateJoined?: string;
}

export interface WorkforceDirectoryOptions {
  roles: Array<{ id: string; name: string }>;
  departments: Array<{ id: string; name: string }>;
  designations: Array<{ id: string; name: string; departmentId: string | null }>;
  managers: Array<{ id: string; name: string; email: string }>;
}

export interface CreateWorkforceEmployeeInput {
  fullName: string;
  email: string;
  roleId: string;
  departmentId: string;
  designationId?: string;
  managerUserId?: string;
  joinedAt: string;
  temporaryPassword: string;
  probationRequired?: boolean;
  probationDurationDays?: number;
}

export interface CreateWorkforceEmployeeResult extends WorkforceEmployee {
  /** Set when the core identity was created but a supplementary record (employment details/onboarding) failed to save. */
  warning?: string;
}

async function getJson(url: string) {
  const headers = await authHeaders();
  const response = await fetch(url, { headers });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "Request failed.");
  }
  return payload;
}

/** Lists the real global.users roster visible to the caller (all active users for HR tier, direct reports otherwise). */
export async function listWorkforceEmployees(): Promise<WorkforceEmployee[]> {
  const payload = await getJson("/api/workforce/employees");
  return (payload.employees as WorkforceEmployee[]) ?? [];
}

/** Real role/department/manager options for the New Employee form, sourced from global.roles/global.departments/global.users. */
export async function getWorkforceDirectoryOptions(): Promise<WorkforceDirectoryOptions> {
  const payload = await getJson("/api/workforce/employees?options=true");
  return {
    roles: payload.roles ?? [],
    departments: payload.departments ?? [],
    designations: payload.designations ?? [],
    managers: payload.managers ?? [],
  };
}

/** Creates a real auth.users + global.users record — the person can log in immediately with the temporary password. */
export async function createWorkforceEmployee(input: CreateWorkforceEmployeeInput): Promise<CreateWorkforceEmployeeResult> {
  const headers = await authHeaders();
  const response = await fetch("/api/workforce/employees", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "Failed to create the employee.");
  }
  return { ...(payload.employee as WorkforceEmployee), warning: payload.warning as string | undefined };
}

/** Client-side, no backend call — used for the "Generate" button on the temporary password field. */
export function generateTemporaryPassword(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 12);
}
