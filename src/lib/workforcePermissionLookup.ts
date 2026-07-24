import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

interface PermissionJoinRow {
  permission: { name: string } | { name: string }[] | null;
}

/**
 * Real capability set for a role, from global.role_permissions joined to
 * global.permissions — the actual source of truth, as opposed to the
 * mock per-legacy-role permission bag hasPermission() used to read.
 */
export async function fetchRolePermissionNames(
  globalDb: ReturnType<SupabaseClient["schema"]>,
  roleId: string,
): Promise<string[]> {
  const { data } = await globalDb
    .from("role_permissions")
    .select("permission:permissions(name)")
    .eq("role_id", roleId)
    .returns<PermissionJoinRow[]>();

  return (data ?? [])
    .map((row) => (Array.isArray(row.permission) ? row.permission[0]?.name : row.permission?.name))
    .filter((name): name is string => Boolean(name));
}
