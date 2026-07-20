import "server-only";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { appRoleFromGlobalRole } from "@/auth/authAdapter";
import type { User } from "@/core/types";

/**
 * Resolves the authenticated Workforce identity for a request, verifying
 * the bearer token's signature against Supabase Auth (never hand-decoded —
 * see the old /api/drive/route.ts's decodeJwt() for the pattern this
 * deliberately avoids) and reading role/manager from global.users, the
 * same source src/auth/authAdapter.ts uses for the live session everywhere
 * else in the app. Returns null if unauthenticated or the user record is
 * missing/inactive — callers must never fall back to client-supplied
 * identity fields.
 */
export async function resolveRequestUser(request: NextRequest): Promise<User | null> {
  if (!supabaseAdmin) return null;

  const authHeader = request.headers.get("authorization") ?? request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : undefined;
  if (!token) return null;

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData?.user) return null;

  const { data: row, error: rowError } = await supabaseAdmin
    .schema("global")
    .from("users")
    .select("id, full_name, email, manager_user_id, department_id, designation_id, role_id, status, role:roles(name)")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (rowError || !row || row.status !== "active") return null;

  const roleField = row.role as { name?: string } | { name?: string }[] | null;
  const roleName = (Array.isArray(roleField) ? roleField[0]?.name : roleField?.name) ?? "";

  return {
    id: row.id as string,
    name: (row.full_name as string | null) || (row.email as string),
    email: row.email as string,
    avatar: "",
    userType: roleName.trim().toLowerCase() === "creator" ? "creator" : "employee",
    roleId: appRoleFromGlobalRole(row.role),
    roleName,
    globalRoleId: (row.role_id as string | null) ?? undefined,
    departmentId: (row.department_id as string | null) ?? undefined,
    teamId: (row.department_id as string | null) ?? undefined,
    designationId: (row.designation_id as string | null) ?? undefined,
    supervisorId: (row.manager_user_id as string | null) ?? undefined,
    permissionIds: [],
    createdById: "",
    status: "active",
  };
}
