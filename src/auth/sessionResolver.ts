import { authAdapter } from "@/auth/authAdapter";
import type { User, Role } from "@/core/operon";
import { getRoleById } from "@/core/operon";

export async function resolveSessionUser(): Promise<User | null> {
  try {
    const currentUser = await authAdapter.getCurrentUser();
    return currentUser ?? null;
  } catch (error) {
    console.warn("Session resolution failed", error);
    return null;
  }
}

export function resolveUserRole(user: User): Role | null {
  return getRoleById(user.roleId) ?? null;
}

export async function getCurrentUser(): Promise<User | null> {
  return resolveSessionUser();
}
