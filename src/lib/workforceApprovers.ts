import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

type GlobalDb = ReturnType<SupabaseClient["schema"]>;

interface RoleUserRow {
  id: string;
  department_id: string | null;
  role: { name: string } | { name: string }[] | null;
}

export function roleNameOf(row: { name: string } | { name: string }[] | null): string {
  const r = Array.isArray(row) ? row[0] : row;
  return (r?.name ?? "").trim().toLowerCase();
}

async function activeUsersWithRole(globalDb: GlobalDb, roleName: string): Promise<RoleUserRow[]> {
  const { data, error } = await globalDb
    .from("users")
    .select("id, department_id, role:roles(name)")
    .eq("status", "active")
    .returns<RoleUserRow[]>();
  if (error) throw new Error(error.message);
  return (data ?? []).filter((row) => roleNameOf(row.role) === roleName.toLowerCase());
}

/** There is exactly one active HR Manager in this org (HR Executive is a distinct, separate role). */
export async function resolveHrManager(globalDb: GlobalDb): Promise<{ id: string } | { error: string }> {
  const matches = await activeUsersWithRole(globalDb, "hr manager");
  if (matches.length === 0) return { error: "No active HR Manager found." };
  if (matches.length > 1) return { error: "Multiple active HR Managers found; a single approver is required." };
  return { id: matches[0].id };
}

/**
 * This org has two Co-Founders, each focused on one department (TM or IM),
 * but both jointly cover every other department (Sales, etc.) — so there is
 * no single "the" Co-Founder to resolve. Picks the department-aligned one
 * as the recorded/notified approver when the requester is in TM or IM;
 * otherwise picks either (arbitrary, first found) as the recorded approver.
 * Callers must NOT treat the returned id as the only person authorized to
 * act — see isEitherCofounder() below, used for the actual authorization
 * check so whichever Co-Founder gets to it first can decide.
 */
export async function resolveCofounderApprover(globalDb: GlobalDb, requesterDepartmentId: string | null | undefined): Promise<{ id: string } | { error: string }> {
  const cofounders = await activeUsersWithRole(globalDb, "co-founder");
  if (cofounders.length === 0) return { error: "No active Co-Founder found." };
  if (requesterDepartmentId) {
    const aligned = cofounders.find((c) => c.department_id === requesterDepartmentId);
    if (aligned) return { id: aligned.id };
  }
  return { id: cofounders[0].id };
}

/** Real authorization check for the founder-tier leave step: any active Co-Founder may act, not just whichever one was recorded as current_approver_user_id. */
export async function isEitherCofounder(globalDb: GlobalDb, userId: string): Promise<boolean> {
  const cofounders = await activeUsersWithRole(globalDb, "co-founder");
  return cofounders.some((c) => c.id === userId);
}
