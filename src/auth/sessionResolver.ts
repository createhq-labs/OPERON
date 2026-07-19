import { authAdapter, type IdentityResult } from "@/auth/authAdapter";
import { logRuntimeWarning } from "@/services/observability/runtimeLogger";

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
