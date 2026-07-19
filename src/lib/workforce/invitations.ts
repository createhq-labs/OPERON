import { workforceDb, workforceRpc, globalDb } from "./client";
import type { UUID } from "./types";

export type EmployeeInvitationStatus = "pending" | "consumed" | "revoked";

export interface EmployeeInvitation {
  id: UUID;
  email: string;
  full_name: string | null;
  role_id: UUID;
  department_id: UUID;
  designation_id: UUID;
  manager_user_id: UUID | null;
  joined_at: string;
  employment_status: string;
  status: EmployeeInvitationStatus;
  created_by: UUID;
  created_at: string;
  consumed_at: string | null;
  linked_user_id: UUID | null;
  revoked_at: string | null;
  revoked_by: UUID | null;
  revoked_reason: string | null;
}

export interface CreateEmployeeInvitationInput {
  email: string;
  fullName?: string;
  roleId: UUID;
  departmentId: UUID;
  designationId: UUID;
  managerUserId?: UUID;
  joinedAt: string;
  employmentStatus?: string;
}

/** HR creates an employee's full record (role/department/designation/manager/joining date/employment status) before they ever log in. */
export const createEmployeeInvitation = (input: CreateEmployeeInvitationInput) =>
  workforceRpc<EmployeeInvitation>("create_employee_invitation", {
    p_email: input.email,
    p_full_name: input.fullName ?? null,
    p_role_id: input.roleId,
    p_department_id: input.departmentId,
    p_designation_id: input.designationId,
    p_manager_user_id: input.managerUserId ?? null,
    p_joined_at: input.joinedAt,
    p_employment_status: input.employmentStatus ?? "active",
  });

export const revokeEmployeeInvitation = (invitationId: UUID, reason?: string) =>
  workforceRpc<EmployeeInvitation>("revoke_employee_invitation", {
    p_invitation_id: invitationId,
    p_reason: reason ?? null,
  });

/** HR invitation list — RLS restricts this to can_manage_onboarding(); no wrapper function needed, same pattern as probation/deboarding lists. */
export async function listEmployeeInvitations(): Promise<EmployeeInvitation[]> {
  const { data, error } = await workforceDb
    .from("employee_invitations")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as EmployeeInvitation[];
}

export interface AssignmentOption {
  id: UUID;
  name: string;
}

/** Role/department/manager options for the invitation form — these live on global.*, not workforce.*. */
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
