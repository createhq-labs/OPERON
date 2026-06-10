"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import type { User } from "@/core/types";
import { getRoleById } from "@/core/operon";
import { resolveSessionUser } from "@/auth/sessionResolver";
import { authAdapter } from "@/auth/authAdapter";
import { getSupabaseDiagnostics } from "@/lib/supabase";
import { ROLE_IDS, DEFAULT_ROLE_ID } from "@/core/roles";
import {
  logRuntimeError,
  logRuntimeEvent,
  logRuntimeWarning,
} from "@/services/observability/runtimeLogger";

// ─── Types ────────────────────────────────────────────────────────────────────

type AuthStatus =
  | "initializing"
  | "authenticated"
  | "unauthenticated"
  | "failed";

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
    // Restricted environment (e.g. private browsing with storage blocked).
  }
}

function clearStorage(...keys: string[]): void {
  if (typeof window === "undefined") return;
  try {
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // Silently ignore.
  }
}

// ─── Local User Factory ───────────────────────────────────────────────────────

/**
 * Produces a synthetic User for MVP / demo mode.
 * This user is never persisted to Supabase and carries no auth token.
 * The role ID is validated against the role registry — an unknown ID
 * falls back to DEFAULT_ROLE_ID so permissions never escalate unexpectedly.
 */
function createLocalUser(roleId: string, displayRoleName?: string): User {
  const role = getRoleById(roleId) ?? getRoleById(DEFAULT_ROLE_ID);
  const resolvedRoleId = role?.id ?? DEFAULT_ROLE_ID;
  const displayName = displayRoleName ?? role?.name ?? "Employee";

  return {
    id: `local-${resolvedRoleId}`,
    name: `Local ${displayName}`,
    email: "",
    avatar: "",
    userType: role?.userType ?? "employee",
    roleId: resolvedRoleId,
    departmentId: undefined,
    teamId: undefined,
    supervisorId: undefined,
    permissionIds: [],
    createdById: "local",
    status: "active",
  };
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

  // ─── Bootstrap ─────────────────────────────────────────────────────────────
  // Subscription is registered separately from the hydration effect so that
  // auth events that arrive while hydration is in-flight don't overwrite
  // partially-resolved state. The subscription only applies updates after
  // `loaded` transitions to true.

  useEffect(() => {
    mountedRef.current = true;
    const startTime = performance.now();

    async function hydrate() {
      const diagnostics = getSupabaseDiagnostics();
      const currentUser = await resolveSessionUser();

      if (!mountedRef.current) return;

      let activeUser: User;
      let resolvedStatus: AuthStatus;

      if (currentUser) {
        activeUser = currentUser;
        resolvedStatus = "authenticated";
      } else if (diagnostics.configured) {
        // Supabase is configured but no session — user needs to sign in.
        const localRoleId = readStorage(ROLE_KEY);
        const localRoleLabel = readStorage(ROLE_LABEL_KEY);

        const validRoleId =
          localRoleId && getRoleById(localRoleId)
            ? localRoleId
            : DEFAULT_ROLE_ID;

        // Correct any stale persisted role.
        if (localRoleId && validRoleId !== localRoleId) {
          writeStorage(ROLE_KEY, validRoleId);
        }

        if (localRoleId) {
          // MVP mode: persisted role selection acts as a local session.
          activeUser = createLocalUser(validRoleId, localRoleLabel ?? undefined);
          resolvedStatus = "authenticated";
        } else {
          // No real session, no local role — unauthenticated.
          activeUser = createLocalUser(DEFAULT_ROLE_ID);
          resolvedStatus = "unauthenticated";
        }
      } else {
        // Supabase not configured — fall back to local role.
        const localRoleId = readStorage(ROLE_KEY) ?? DEFAULT_ROLE_ID;
        const localRoleLabel = readStorage(ROLE_LABEL_KEY);
        activeUser = createLocalUser(localRoleId, localRoleLabel ?? undefined);
        resolvedStatus = "authenticated";
      }

      if (!mountedRef.current) return;

      setUser(activeUser);
      setStatus(resolvedStatus);
      setLoaded(true);

      logRuntimeEvent("Auth bootstrap completed", {
        status: resolvedStatus,
        configured: diagnostics.configured,
        durationMs: Math.round(performance.now() - startTime),
      });
    }

    hydrate().catch((err) => {
      if (!mountedRef.current) return;
      const message = err instanceof Error ? err.message : String(err);
      setStatus("failed");
      setError(message);
      setLoaded(true);
      logRuntimeError("Auth bootstrap failed", { error: message });
    });

    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ─── Auth State Subscription ────────────────────────────────────────────────
  // Registered once. Only processes events after the initial hydration
  // has completed (`loaded` is true before any of these events matter).

  useEffect(() => {
    const subscription = authAdapter.onAuthStateChange(async (event) => {
      if (!mountedRef.current) return;

      try {
        if (
          event === "SIGNED_IN" ||
          event === "TOKEN_REFRESHED" ||
          event === "USER_UPDATED"
        ) {
          const refreshed = await resolveSessionUser();
          if (!mountedRef.current) return;
          setUser(refreshed);
          setStatus(refreshed ? "authenticated" : "unauthenticated");
          setError(undefined);
        } else if (event === "SIGNED_OUT") {
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

    return () => subscription.unsubscribe();
  }, []);

  // ─── Actions ───────────────────────────────────────────────────────────────

  const signIn = useCallback(async () => {
    clearStorage(ROLE_KEY, ROLE_LABEL_KEY);
    await authAdapter.signIn();
    // signIn initiates an OAuth redirect — state updates arrive via the
    // auth subscription when the session is established.
  }, []);

  const signOut = useCallback(async () => {
    clearStorage(ROLE_KEY, ROLE_LABEL_KEY);
    try {
      await authAdapter.signOut();
    } finally {
      if (mountedRef.current) {
        setUser(null);
        setStatus("unauthenticated");
        setError(undefined);
      }
    }
  }, []);

  const selectRole = useCallback(
    (roleId: string, displayRoleName?: string): void => {
      if (!mountedRef.current) return;

      const role = getRoleById(roleId) ?? getRoleById(DEFAULT_ROLE_ID);
      const resolvedRoleId = role?.id ?? DEFAULT_ROLE_ID;
      const resolvedDisplayName =
        displayRoleName ?? role?.name ?? "Employee";

      writeStorage(ROLE_KEY, resolvedRoleId);
      writeStorage(ROLE_LABEL_KEY, resolvedDisplayName);

      setUser(createLocalUser(resolvedRoleId, resolvedDisplayName));
      setStatus("authenticated");
      setError(undefined);
    },
    []
  );

  return (
    <AuthContext.Provider
      value={{ user, loaded, status, error, signIn, signOut, selectRole }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthState {
  return useContext(AuthContext);
}