import { workforceDb, workforceRpc, globalDb } from "./client";
import type { UUID } from "./types";

export type PendingSignupStatus = "pending" | "approved" | "rejected";

export interface PendingSignup {
  id: UUID;
  auth_user_id: UUID;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  status: PendingSignupStatus;
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by: UUID | null;
  rejection_reason: string | null;
  provisioned_user_id: UUID | null;
  extra_attributes: Record<string, unknown> | null;
}

/** Registers (idempotently) the current authenticated-but-unprovisioned session as awaiting HR verification, and notifies HR. */
export const requestSignupVerification = () => workforceRpc<PendingSignup>("request_signup_verification");

/** The caller's own pending-signup record, if one exists — used to show status on the pending-verification screen. */
export async function myPendingSignup(authUserId: UUID): Promise<PendingSignup | null> {
  const { data, error } = await workforceDb
    .from("pending_signups")
    .select("*")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as PendingSignup | null;
}

/** HR review queue — RLS restricts this to can_manage_onboarding(); no wrapper function needed, same pattern as probation/deboarding lists. */
export async function listPendingSignups(): Promise<PendingSignup[]> {
  const { data, error } = await workforceDb
    .from("pending_signups")
    .select("*")
    .order("requested_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as PendingSignup[];
}

export interface DecidePendingSignupInput {
  requestId: UUID;
  approved: boolean;
  roleId?: UUID;
  departmentId?: UUID;
  designationId?: UUID;
  managerUserId?: UUID;
  joinedAt?: string;
  employmentStatus?: string;
  reason?: string;
  extraAttributes?: Record<string, unknown>;
}

export const decidePendingSignup = (input: DecidePendingSignupInput) =>
  workforceRpc<PendingSignup>("decide_pending_signup", {
    p_request_id: input.requestId,
    p_approved: input.approved,
    p_role_id: input.roleId ?? null,
    p_department_id: input.departmentId ?? null,
    p_designation_id: input.designationId ?? null,
    p_manager_user_id: input.managerUserId ?? null,
    p_joined_at: input.joinedAt ?? null,
    p_employment_status: input.employmentStatus ?? "active",
    p_reason: input.reason ?? null,
    p_extra_attributes: input.extraAttributes ?? null,
  });

export interface AssignmentOption {
  id: UUID;
  name: string;
}

/** Role/department/manager options for the approval form — these live on global.*, not workforce.*. */
export async function listAssignableRoles(): Promise<AssignmentOption[]> {
  const { data, error } = await globalDb.from("roles").select("id, name").order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as AssignmentOption[];
}

export async function listAssignableDepartments(): Promise<AssignmentOption[]> {
  const { data, error } = await globalDb.from("departments").select("id, name").order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as AssignmentOption[];
}

export async function listAssignableManagers(): Promise<AssignmentOption[]> {
  const { data, error } = await globalDb
    .from("users")
    .select("id, full_name")
    .eq("status", "active")
    .order("full_name");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: UUID; full_name: string }>).map((u) => ({ id: u.id, name: u.full_name }));
}

export interface DesignationOption extends AssignmentOption {
  departmentId: UUID;
}

/** All designations across all departments — filtered client-side by the selected department, matching the departments/teams pattern already used in the lifecycle page. */
export async function listAssignableDesignations(): Promise<DesignationOption[]> {
  const { data, error } = await globalDb.from("designations").select("id, name, department_id").order("name");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: UUID; name: string; department_id: UUID }>).map((d) => ({
    id: d.id,
    name: d.name,
    departmentId: d.department_id,
  }));
}
