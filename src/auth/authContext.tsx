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
import { resolveIdentity } from "@/auth/sessionResolver";
import { authAdapter } from "@/auth/authAdapter";
import { requestSignupVerification, type PendingSignup } from "@/lib/workforce/signups";
import { getSupabaseDiagnostics, resolveSupabaseAvailability } from "@/lib/supabase";
import { DEFAULT_ROLE_ID } from "@/core/roles";
import {
  logRuntimeError,
  logRuntimeEvent,
  logRuntimeWarning,
} from "@/services/observability/runtimeLogger";
import { recordRuntimeMetric } from "@/services/observability/runtimeMetrics";

// ─── Types ────────────────────────────────────────────────────────────────────

type AuthStatus = "initializing" | "authenticated" | "unauthenticated" | "failed" | "pending_verification";

export interface AuthState {
  user: User | null;
  loaded: boolean;
  status: AuthStatus;
  error?: string;
  pendingSignup: PendingSignup | null;
  signIn: () => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ requiresEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  selectRole: (roleId: string, displayRoleName?: string) => void;
}

// ─── Local Role Persistence ───────────────────────────────────────────────────

const ROLE_KEY = "operon-selected-role";
const ROLE_LABEL_KEY = "operon-selected-role-label";
const AUTH_BOOTSTRAP_FALLBACK_MS = 6500;
const LOCAL_ACCESS_ENABLED =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_BOOTSTRAP_AUTH === "true";

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
  pendingSignup: null,
  signIn: async () => {},
  signInWithPassword: async () => {},
  signUp: async () => ({ requiresEmailConfirmation: false }),
  signOut: async () => {},
  selectRole: () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<AuthStatus>("initializing");
  const [error, setError] = useState<string | undefined>(undefined);
  const [pendingSignup, setPendingSignup] = useState<PendingSignup | null>(null);

  const mountedRef = useRef(true);
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);
  // Guards against re-requesting HR verification on every SIGNED_IN/
  // TOKEN_REFRESHED/USER_UPDATED event within one AuthProvider mount — the
  // DB-level ON CONFLICT DO NOTHING makes repeats harmless, but there's no
  // reason to round-trip on every token refresh.
  const signupVerificationRequestedRef = useRef(false);

  async function requestVerificationOnce(): Promise<PendingSignup | null> {
    if (signupVerificationRequestedRef.current) return null;
    signupVerificationRequestedRef.current = true;
    try {
      return await requestSignupVerification();
    } catch (err) {
      logRuntimeWarning("Signup verification request failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    const startTime = performance.now();
    const fallbackTimer = window.setTimeout(() => {
      if (!mountedRef.current) return;
      setUser(LOCAL_ACCESS_ENABLED ? createLocalUser(DEFAULT_ROLE_ID) : null);
      setStatus(LOCAL_ACCESS_ENABLED ? "authenticated" : "unauthenticated");
      setError(LOCAL_ACCESS_ENABLED ? undefined : "Authentication timed out. Please sign in again.");
      setLoaded(true);
      logRuntimeWarning("Auth bootstrap fallback activated", {
        timeoutMs: AUTH_BOOTSTRAP_FALLBACK_MS,
      });
    }, AUTH_BOOTSTRAP_FALLBACK_MS);

    async function hydrate() {
      const diagnostics = getSupabaseDiagnostics();

      const [identityResult, availabilityResult] = await Promise.allSettled([
        resolveIdentity(),
        resolveSupabaseAvailability(3000),
      ]);

      if (!mountedRef.current) return;

      const identity =
        identityResult.status === "fulfilled" ? identityResult.value : { kind: "none" as const };

      const currentUser = identity.kind === "authenticated" ? identity.user : null;

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

      // Authenticated with Supabase but no global.users row yet — this is a
      // distinct state from "not signed in": register (or fetch) the pending
      // HR-verification request and show a dedicated pending screen instead
      // of bouncing to /login. The browser never creates/modifies
      // global.users itself — only decide_pending_signup() does, and only
      // after explicit HR approval.
      if (identity.kind === "pending") {
        if (!mountedRef.current) return;
        window.clearTimeout(fallbackTimer);
        const signup = await requestVerificationOnce();
        if (!mountedRef.current) return;
        setUser(null);
        setPendingSignup(signup);
        setStatus("pending_verification");
        setError(undefined);
        setLoaded(true);
        logRuntimeEvent("Auth bootstrap resolved to pending verification", {
          authUserId: identity.authUserId,
        });
        return;
      }

      const availability =
        availabilityResult.status === "fulfilled"
          ? availabilityResult.value
          : { available: false, reason: "Auth health check failed.", diagnostics };

      // If no real session, fall back to a persisted local role (MVP mode).
      const localRoleId = currentUser || !LOCAL_ACCESS_ENABLED ? null : readStorage(ROLE_KEY);
      const localRoleLabel = currentUser || !LOCAL_ACCESS_ENABLED ? null : readStorage(ROLE_LABEL_KEY);

      const resolvedRoleId =
        localRoleId && getRoleById(localRoleId) ? localRoleId : DEFAULT_ROLE_ID;

      // Correct any stale role id that no longer maps to a valid role.
      if (localRoleId && resolvedRoleId !== localRoleId) {
        writeStorage(ROLE_KEY, resolvedRoleId);
      }

      const activeUser = currentUser ?? (LOCAL_ACCESS_ENABLED
        ? createLocalUser(resolvedRoleId, localRoleLabel ?? undefined)
        : null);

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
      setPendingSignup(null);
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

    async function handleAuthEvent(event: string) {
      if (!mountedRef.current) return;

      try {
        if (
          event === "SIGNED_IN" ||
          event === "TOKEN_REFRESHED" ||
          event === "USER_UPDATED"
        ) {
          const identity = await resolveIdentity();
          if (!mountedRef.current) return;
          const currentUser = identity.kind === "authenticated" ? identity.user : null;

          if (currentUser?.status === "disabled") {
            setUser(null);
            setPendingSignup(null);
            setStatus("unauthenticated");
            setError("This account has been deactivated.");
          } else if (identity.kind === "pending") {
            const signup = await requestVerificationOnce();
            if (!mountedRef.current) return;
            setUser(null);
            setPendingSignup(signup);
            setStatus("pending_verification");
            setError(undefined);
          } else {
            setUser(currentUser);
            setPendingSignup(null);
            setStatus(currentUser ? "authenticated" : "unauthenticated");
            setError(undefined);
          }
        }

        if (event === "SIGNED_OUT") {
          signupVerificationRequestedRef.current = false;
          setUser(null);
          setPendingSignup(null);
          setStatus("unauthenticated");
          setError(undefined);
        }
      } catch (err) {
        logRuntimeWarning("Auth state change handler failed", {
          event,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    subscriptionRef.current = authAdapter.onAuthStateChange((event) => {
      // Supabase recommends avoiding awaited client calls inside the auth
      // callback itself. Defer profile/role resolution outside its lock.
      window.setTimeout(() => void handleAuthEvent(event), 0);
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

  async function signInWithPassword(email: string, password: string) {
    clearStorage(ROLE_KEY, ROLE_LABEL_KEY);
    setError(undefined);
    await authAdapter.signInWithPassword(email, password);
  }

  async function signUp(email: string, password: string, fullName: string) {
    clearStorage(ROLE_KEY, ROLE_LABEL_KEY);
    setError(undefined);
    return authAdapter.signUp(email, password, fullName);
  }

  async function signOut() {
    try {
      clearStorage(ROLE_KEY, ROLE_LABEL_KEY);
      await authAdapter.signOut();
    } finally {
      signupVerificationRequestedRef.current = false;
      if (mountedRef.current) {
        setUser(null);
        setPendingSignup(null);
        setStatus("unauthenticated");
        setError(undefined);
      }
    }
  }

  function selectRole(roleId: string, displayRoleName?: string): void {
    if (!mountedRef.current || !LOCAL_ACCESS_ENABLED) return;

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
      value={{ user, loaded, status, error, pendingSignup, signIn, signInWithPassword, signUp, signOut, selectRole }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth() {
  return useContext(AuthContext);
}
