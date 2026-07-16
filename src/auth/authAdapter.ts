import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { withTimeout } from "@/lib/async";
import type { User, UserType, DeptId, PermissionId, UserStatus } from "@/core/types";
import { DEFAULT_ROLE_ID } from "@/core/roles";
import { logRuntimeWarning } from "@/services/observability/runtimeLogger";

// ─── Bootstrap Auth ───────────────────────────────────────────────────────────
// Dev-only escape hatch. Never active in production.

const BOOTSTRAP_AUTH_ENABLED =
  process.env.NEXT_PUBLIC_BOOTSTRAP_AUTH === "true" &&
  process.env.NODE_ENV === "development";

const BOOTSTRAP_AUTH_EMAIL =
  process.env.NEXT_PUBLIC_BOOTSTRAP_AUTH_EMAIL?.trim() ?? "";

const AUTH_TIMEOUT_MS = 5000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthSession {
  userId: string;
  email: string;
  provider?: string;
  expiresAt?: string;
}

export interface AuthSubscription {
  unsubscribe(): void;
}

export interface AuthAdapter {
  getSession(): Promise<AuthSession | null>;
  getCurrentUser(): Promise<User | null>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  onAuthStateChange(
    callback: (event: string, session: unknown) => void
  ): AuthSubscription;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeEmail(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function coerceString(
  value: unknown,
  fallback: string = ""
): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function coerceStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? (value as unknown[]).filter((v): v is string => typeof v === "string")
    : [];
}

// ─── Supabase Auth Adapter ────────────────────────────────────────────────────

export class SupabaseAuthAdapter implements AuthAdapter {
  async getSession(): Promise<AuthSession | null> {
    if (!isSupabaseConfigured()) return null;

    try {
      const result = await withTimeout(
        supabase.auth.getSession(),
        AUTH_TIMEOUT_MS,
        { data: { session: null }, error: null } as never
      );

      if (result.error || !result.data?.session?.user) return null;

      const { user, expires_at } = result.data.session;

      return {
        userId: user.id,
        email: normalizeEmail(user.email),
        provider: "supabase",
        expiresAt: expires_at
          ? new Date(expires_at * 1000).toISOString()
          : undefined,
      };
    } catch (error) {
      logRuntimeWarning("Supabase auth session check failed", { error });
      return null;
    }
  }

  /**
   * Maps a raw public.users row (the Finance Dashboard's real identity
   * table — full_name/role/business_line/team_lead_id/team_name, real uuid
   * `id`, no permission_ids column) to the domain User type. All fields are
   * coerced defensively — a partial row must never produce an object that
   * passes RBAC checks with elevated privileges.
   */
  private mapSupabaseUser(row: Record<string, unknown>): User {
    return {
      id: coerceString(row.id),
      name:
        coerceString(row.full_name) ||
        normalizeEmail(row.email as string | undefined),
      email: normalizeEmail(row.email as string | undefined),
      avatar: "",
      userType: coerceString(row.user_type, "employee") as UserType,
      roleId: coerceString(row.role) || DEFAULT_ROLE_ID,
      departmentId: (coerceString(row.business_line) || undefined) as DeptId | undefined,
      teamId: coerceString(row.team_name) || undefined,
      supervisorId: coerceString(row.team_lead_id) || undefined,
      permissionIds: coerceStringArray(row.permission_ids) as PermissionId[],
      createdById: coerceString(row.created_by),
      status: coerceString(row.status, "active") as UserStatus,
      dateJoined: coerceString(row.date_joined) || undefined,
    };
  }

  /**
   * Returns the first active user in the database.
   * Only available in NODE_ENV=development and only when
   * NEXT_PUBLIC_BOOTSTRAP_AUTH=true is explicitly set.
   */
  private async getBootstrapUser(): Promise<User | null> {
    if (!BOOTSTRAP_AUTH_ENABLED) return null;
    if (!isSupabaseConfigured()) return null;

    try {
      let query = supabase.from("users").select("*").eq("status", "active");

      if (BOOTSTRAP_AUTH_EMAIL) {
        query = query.eq("email", normalizeEmail(BOOTSTRAP_AUTH_EMAIL));
      }

      const { data, error } = await withTimeout(
        query.order("created_at", { ascending: true }).limit(1).maybeSingle(),
        AUTH_TIMEOUT_MS,
        { data: null, error: null } as never
      );

      if (error) {
        logRuntimeWarning("Bootstrap auth user resolution failed", { error });
        return null;
      }

      if (!data) {
        logRuntimeWarning(
          "Bootstrap auth enabled but no active user found.",
          { email: BOOTSTRAP_AUTH_EMAIL || "(any)" }
        );
        return null;
      }

      return this.mapSupabaseUser(data as Record<string, unknown>);
    } catch (error) {
      logRuntimeWarning("Bootstrap auth query failed", { error });
      return null;
    }
  }

  async getCurrentUser(): Promise<User | null> {
    try {
      const session = await this.getSession();

      if (session?.userId && session.email) {
        // 1. Look up existing profile by auth user ID.
        const { data: existing, error: selectError } = await withTimeout(
          supabase
            .from("users")
            .select("*")
            .eq("auth_user_id", session.userId)
            .single(),
          AUTH_TIMEOUT_MS,
          { data: null, error: { code: "AUTH_TIMEOUT", message: "User profile lookup timed out." } } as never,
        );

        // PGRST116 = row not found — expected on first login. Everything else
        // is a real error.
        if (selectError && selectError.code !== "PGRST116") {
          logRuntimeWarning("Failed to query user profile", {
            error: selectError,
          });
        }

        if (existing) {
          return this.mapSupabaseUser(existing as Record<string, unknown>);
        }

        // 2. First login: create a default employee profile.
        const { data: created, error: insertError } = await withTimeout(
          supabase
            .from("users")
            .insert({
              auth_user_id: session.userId,
              email: session.email,
              full_name: session.email,
              user_type: "employee",
              role: DEFAULT_ROLE_ID,
              status: "active",
            })
            .select("*")
            .single(),
          AUTH_TIMEOUT_MS,
          { data: null, error: { message: "User profile creation timed out." } } as never,
        );

        if (insertError) {
          logRuntimeWarning("Failed to create user profile", {
            error: insertError,
          });
          return null;
        }

        return this.mapSupabaseUser(created as Record<string, unknown>);
      }

      // 3. No real session — fall back to bootstrap mode (dev only).
      return this.getBootstrapUser();
    } catch (error) {
      logRuntimeWarning("User resolution failed", { error });
      return null;
    }
  }

  /**
   * Initiates Google OAuth sign-in.
   * Throws if the redirect URI is not configured — callers must handle this.
   */
  async signIn(): Promise<void> {
    if (!isSupabaseConfigured()) {
      throw new Error(
        "Supabase is not configured. Cannot sign in."
      );
    }

    const redirectTo =
      process.env.NEXT_PUBLIC_GOOGLE_OAUTH_REDIRECT_URI?.trim();

    if (!redirectTo) {
      throw new Error(
        "NEXT_PUBLIC_GOOGLE_OAUTH_REDIRECT_URI is not set. Cannot initiate sign-in."
      );
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (error) {
      throw new Error(`Sign-in failed: ${error.message}`);
    }
  }

  async signOut(): Promise<void> {
    if (!isSupabaseConfigured()) return;

    try {
      await supabase.auth.signOut();
    } catch (error) {
      logRuntimeWarning("Sign-out failed", { error });
    }
  }

  onAuthStateChange(
    callback: (event: string, session: unknown) => void
  ): AuthSubscription {
    if (!isSupabaseConfigured()) {
      return { unsubscribe: () => undefined };
    }

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });

    return { unsubscribe: () => data.subscription.unsubscribe() };
  }
}

export const authAdapter: AuthAdapter = new SupabaseAuthAdapter();
