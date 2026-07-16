"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import type { User } from "@/core/operon";
import { getRoleById, getRolePermissionIds, registerLocalUser } from "@/core/operon";
import { resolveSessionUser } from "@/auth/sessionResolver";
import { authAdapter } from "@/auth/authAdapter";
import { getSupabaseDiagnostics, resolveSupabaseAvailability } from "@/lib/supabase";
import { DEFAULT_ROLE_ID } from "@/core/roles";
import {
  logRuntimeError,
  logRuntimeEvent,
  logRuntimeWarning,
} from "@/services/observability/runtimeLogger";
import { recordRuntimeMetric } from "@/services/observability/runtimeMetrics";

// ─── Types ────────────────────────────────────────────────────────────────────

type AuthStatus = "initializing" | "authenticated" | "unauthenticated" | "failed";

export interface AuthState {
  user: User | null;
  loaded: boolean;
  status: AuthStatus;
  error?: string;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  selectRole: (roleId: string, displayRoleName?: string) => void;
}

// ─── Local Role Persistence ───────────────────────────────────────────────────

const ROLE_KEY = "operon-selected-role";
const ROLE_LABEL_KEY = "operon-selected-role-label";
const AUTH_BOOTSTRAP_FALLBACK_MS = 6500;

function readStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key)?.trim() ?? null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Restricted environment — silently ignore.
  }
}

function clearStorage(...keys: string[]): void {
  if (typeof window === "undefined") return;
  try {
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // Restricted environment — silently ignore.
  }
}

// ─── Local User Factory ───────────────────────────────────────────────────────

/**
 * Creates a synthetic User for MVP / demo mode when no real session exists.
 * The user is local-only and never persisted to Supabase.
 */
function createLocalUser(roleId: string, displayRoleName?: string): User {
  const role = getRoleById(roleId) ?? getRoleById(DEFAULT_ROLE_ID);
  const resolvedRoleId = role?.id ?? DEFAULT_ROLE_ID;
  const displayName = displayRoleName ?? role?.name ?? "Employee";

  const user: User = {
    id: `local-${resolvedRoleId}`,
    name: `Local ${displayName}`,
    email: "",
    avatar: "",
    userType: role?.userType ?? "employee",
    roleId: resolvedRoleId,
    departmentId: undefined,
    teamId: undefined,
    supervisorId: undefined,
    permissionIds: role ? getRolePermissionIds(role) : [],
    createdById: "local",
    status: "active",
  };

  // Write paths across the app re-resolve the actor via getUserById before
  // allowing a create/update — register this synthetic identity in the
  // in-memory store (never synced to Supabase) so those lookups succeed.
  registerLocalUser(user);
  return user;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthState>({
  user: null,
  loaded: false,
  status: "initializing",
  error: undefined,
  signIn: async () => {},
  signOut: async () => {},
  selectRole: () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<AuthStatus>("initializing");
  const [error, setError] = useState<string | undefined>(undefined);

  const mountedRef = useRef(true);
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    const startTime = performance.now();
    const fallbackTimer = window.setTimeout(() => {
      if (!mountedRef.current) return;
      setUser(createLocalUser(DEFAULT_ROLE_ID));
      setStatus("authenticated");
      setError(undefined);
      setLoaded(true);
      logRuntimeWarning("Auth bootstrap fallback activated", {
        timeoutMs: AUTH_BOOTSTRAP_FALLBACK_MS,
      });
    }, AUTH_BOOTSTRAP_FALLBACK_MS);

    async function hydrate() {
      const diagnostics = getSupabaseDiagnostics();

      const [sessionResult, availabilityResult] = await Promise.allSettled([
        resolveSessionUser(),
        resolveSupabaseAvailability(3000),
      ]);

      if (!mountedRef.current) return;

      const currentUser =
        sessionResult.status === "fulfilled" ? sessionResult.value : null;

      // A deboarded account is disabled, not deleted — its Supabase session
      // may still be technically valid. Block it here, before the MVP local
      // role fallback below, so a disabled real account can never resolve
      // to a local demo role instead.
      if (currentUser?.status === "disabled") {
        if (!mountedRef.current) return;
        window.clearTimeout(fallbackTimer);
        setUser(null);
        setStatus("unauthenticated");
        setError("This account has been deactivated.");
        setLoaded(true);
        return;
      }

      const availability =
        availabilityResult.status === "fulfilled"
          ? availabilityResult.value
          : { available: false, reason: "Auth health check failed.", diagnostics };

      // If no real session, fall back to a persisted local role (MVP mode).
      const localRoleId = currentUser ? null : readStorage(ROLE_KEY);
      const localRoleLabel = currentUser ? null : readStorage(ROLE_LABEL_KEY);

      const resolvedRoleId =
        localRoleId && getRoleById(localRoleId) ? localRoleId : DEFAULT_ROLE_ID;

      // Correct any stale role id that no longer maps to a valid role.
      if (localRoleId && resolvedRoleId !== localRoleId) {
        writeStorage(ROLE_KEY, resolvedRoleId);
      }

      const activeUser =
        currentUser ?? createLocalUser(resolvedRoleId, localRoleLabel ?? undefined);

      const resolvedStatus: AuthStatus = activeUser
        ? "authenticated"
        : diagnostics.configured
        ? "unauthenticated"
        : "failed";

      if (!mountedRef.current) return;
      window.clearTimeout(fallbackTimer);

      setUser(activeUser);
      setStatus(resolvedStatus);
      setError(activeUser ? undefined : availability.reason);
      setLoaded(true);

      recordRuntimeMetric(
        "auth_bootstrap_duration_ms",
        Math.max(0, performance.now() - startTime),
        {
          status: resolvedStatus,
          configured: diagnostics.configured,
          available: availability.available,
        }
      );

      logRuntimeEvent("Auth bootstrap completed", {
        status: resolvedStatus,
        available: availability.available,
        reason: availability.reason,
      });
    }

    hydrate().catch((err) => {
      if (!mountedRef.current) return;
      window.clearTimeout(fallbackTimer);
      const message = err instanceof Error ? err.message : String(err);
      setStatus("failed");
      setError(message);
      setLoaded(true);
      logRuntimeError("Auth bootstrap failed", { error: message });
    });

    subscriptionRef.current = authAdapter.onAuthStateChange(async (event) => {
      if (!mountedRef.current) return;

      try {
        if (
          event === "SIGNED_IN" ||
          event === "TOKEN_REFRESHED" ||
          event === "USER_UPDATED"
        ) {
          const currentUser = await resolveSessionUser();
          if (!mountedRef.current) return;
          if (currentUser?.status === "disabled") {
            setUser(null);
            setStatus("unauthenticated");
            setError("This account has been deactivated.");
          } else {
            setUser(currentUser);
            setStatus(currentUser ? "authenticated" : "unauthenticated");
            setError(undefined);
          }
        }

        if (event === "SIGNED_OUT") {
          setUser(null);
          setStatus("unauthenticated");
          setError(undefined);
        }
      } catch (err) {
        logRuntimeWarning("Auth state change handler failed", {
          event,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    return () => {
      mountedRef.current = false;
      window.clearTimeout(fallbackTimer);
      subscriptionRef.current?.unsubscribe();
    };
  }, []);

  async function signIn() {
    try {
      clearStorage(ROLE_KEY, ROLE_LABEL_KEY);
      await authAdapter.signIn();
    } catch (err) {
      logRuntimeError("Sign in failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  async function signOut() {
    try {
      clearStorage(ROLE_KEY, ROLE_LABEL_KEY);
      await authAdapter.signOut();
    } finally {
      if (mountedRef.current) {
        setUser(null);
        setStatus("unauthenticated");
        setError(undefined);
      }
    }
  }

  function selectRole(roleId: string, displayRoleName?: string): void {
    if (!mountedRef.current) return;

    const role = getRoleById(roleId) ?? getRoleById(DEFAULT_ROLE_ID);
    const resolvedRoleId = role?.id ?? DEFAULT_ROLE_ID;
    const resolvedDisplayName = displayRoleName ?? role?.name ?? "Employee";

    writeStorage(ROLE_KEY, resolvedRoleId);
    writeStorage(ROLE_LABEL_KEY, resolvedDisplayName);

    setUser(createLocalUser(resolvedRoleId, resolvedDisplayName));
    setStatus("authenticated");
    setError(undefined);
    setLoaded(true);
  }

  return (
    <AuthContext.Provider
      value={{ user, loaded, status, error, signIn, signOut, selectRole }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth() {
  return useContext(AuthContext);
}
