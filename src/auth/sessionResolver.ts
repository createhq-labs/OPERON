import { authAdapter, type IdentityResult } from "@/auth/authAdapter";
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
 * Tri-state version of resolveSessionUser — distinguishes "no session" from
 * "authenticated but no global.users row yet" (pending HR verification).
 * Falls back to `{ kind: "none" }` on any failure, same as resolveSessionUser.
 */
export async function resolveIdentity(): Promise<IdentityResult> {
  try {
    return await authAdapter.resolveIdentity();
  } catch (error) {
    logRuntimeWarning("Identity resolution failed", { error });
    return { kind: "none" };
  }
}

/**
 * Returns the Role record for a user's assigned role ID.
 * Returns null if the role ID is unknown (e.g. stale data after a role removal).
 */
export function resolveUserRole(user: User): Role | null {
  return getRoleById(user.roleId) ?? null;
}