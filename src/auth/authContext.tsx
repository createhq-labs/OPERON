"use client";

import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from "react";
import type { User } from "@/core/operon";
import { resolveSessionUser } from "@/auth/sessionResolver";
import { authAdapter } from "@/auth/authAdapter";
import { getUserByRoleId } from "@/core/operon";
import { getSupabaseDiagnostics, resolveSupabaseAvailability } from "@/lib/supabase";
import { logRuntimeError, logRuntimeEvent, logRuntimeWarning } from "@/services/observability/runtimeLogger";
import { recordRuntimeMetric } from "@/services/observability/runtimeMetrics";

type AuthStatus = "initializing" | "authenticated" | "unauthenticated" | "degraded_local" | "offline" | "failed";

interface AuthState {
  user: User | null;
  loaded: boolean;
  status: AuthStatus;
  error?: string;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  signInWithRole: (roleId: string) => void;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loaded: false,
  status: "initializing",
  error: undefined,
  signIn: async () => {},
  signOut: async () => {},
  signInWithRole: () => {},
});

const DEV_AUTH_ENABLED = process.env.NEXT_PUBLIC_DEV_AUTH === "true";
const AUTH_BOOTSTRAP_TIMEOUT_MS = 3000;

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

    async function hydrate() {
      const diagnostics = getSupabaseDiagnostics();
      console.debug("Auth bootstrap diagnostics", {
        configured: diagnostics.configured,
        url: diagnostics.url,
        urlValid: diagnostics.urlValid,
        authMode: diagnostics.authMode,
        providerMode: diagnostics.providerMode,
        fallbackMode: diagnostics.fallbackMode,
        warnings: diagnostics.warnings,
      });
      const availabilityPromise = resolveSupabaseAvailability(AUTH_BOOTSTRAP_TIMEOUT_MS);
      const sessionPromise = resolveSessionUser();

      const [sessionResult, availabilityResult] = await Promise.allSettled([sessionPromise, availabilityPromise]);

      const currentUser = sessionResult.status === "fulfilled" ? sessionResult.value : null;
      const availability = availabilityResult.status === "fulfilled" ? availabilityResult.value : { available: false, reason: "Auth health check failed.", diagnostics };
      const isAvailable = availability.available;
      const resolvedStatus: AuthStatus = currentUser
        ? "authenticated"
        : !diagnostics.configured || !isAvailable
        ? "degraded_local"
        : "unauthenticated";

      if (!mountedRef.current) {
        return;
      }

      setUser(currentUser);
      setStatus(resolvedStatus);
      setError(currentUser ? undefined : availability.reason);
      setLoaded(true);

      const bootstrapDurationMs = performance.now() - startTime;
      recordRuntimeMetric("auth_bootstrap_duration_ms", Math.max(0, bootstrapDurationMs), {
        status: resolvedStatus,
        configured: diagnostics.configured,
        available: isAvailable,
      });
      logRuntimeEvent("Auth bootstrap completed", {
        status: resolvedStatus,
        available: isAvailable,
        reason: availability.reason,
      });
    }

    hydrate().catch((bootstrapError) => {
      if (!mountedRef.current) {
        return;
      }
      const message = bootstrapError instanceof Error ? bootstrapError.message : String(bootstrapError);
      setStatus("failed");
      setError(message);
      setLoaded(true);
      logRuntimeError("Auth bootstrap failed", { error: message });
    });

    subscriptionRef.current = authAdapter.onAuthStateChange(async (event) => {
      if (!mountedRef.current) {
        return;
      }

      try {
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
          const currentUser = await resolveSessionUser();
          if (!mountedRef.current) {
            return;
          }
          setUser(currentUser);
          setStatus(currentUser ? "authenticated" : "unauthenticated");
          setError(undefined);
        }

        if (event === "SIGNED_OUT") {
          setUser(null);
          setStatus("unauthenticated");
          setError(undefined);
        }
      } catch (listenerError) {
        logRuntimeWarning("Auth state change handler failed", {
          event,
          error: listenerError instanceof Error ? listenerError.message : String(listenerError),
        });
      }
    });

    return () => {
      mountedRef.current = false;
      subscriptionRef.current?.unsubscribe();
    };
  }, []);

  async function signIn() {
    try {
      await authAdapter.signIn();
    } catch (signInError) {
      logRuntimeError("Sign in failed", {
        error: signInError instanceof Error ? signInError.message : String(signInError),
      });
      throw signInError;
    }
  }

  async function signOut() {
    await authAdapter.signOut();
    if (mountedRef.current) {
      setUser(null);
      setStatus("unauthenticated");
      setError(undefined);
    }
  }

  function signInWithRole(roleId: string) {
    if (!DEV_AUTH_ENABLED) {
      console.warn("Developer auth fallback is disabled. Use real sign in instead.");
      return;
    }
    const devUser = getUserByRoleId(roleId);
    if (mountedRef.current) {
      setUser(devUser ?? null);
      setStatus(devUser ? "authenticated" : "unauthenticated");
    }
  }

  return (
    <AuthContext.Provider value={{ user, loaded, status, error, signIn, signOut, signInWithRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
