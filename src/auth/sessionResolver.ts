import { authAdapter } from "@/auth/authAdapter";
import type { User, Role } from "@/core/types";
import { getRoleById } from "@/core/operon";
import { logRuntimeWarning } from "@/services/observability/runtimeLogger";

/**
 * Resolves the current authenticated user from the auth adapter.
 * Returns null on any failure — callers must handle the unauthenticated case.
 */
export async function resolveSessionUser(): Promise<User | null> {
  try {
    return await authAdapter.getCurrentUser();
  } catch (error) {
    logRuntimeWarning("Session resolution failed", { error });
    return null;
  }
}

/**
 * Returns the Role record for a user's assigned role ID.
 * Returns null if the role ID is unknown (e.g. stale data after a role removal).
 */
export function resolveUserRole(user: User): Role | null {
  return getRoleById(user.roleId) ?? null;
}