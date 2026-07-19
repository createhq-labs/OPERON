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

interface AuthSession {
  userId: string;
  email: string;
  provider?: string;
  expiresAt?: string;
}

interface AuthSubscription {
  unsubscribe(): void;
}

/**
 * Tri-state identity result — distinguishes "no session at all" from
 * "authenticated with Supabase but no global.users row exists, and no
 * employee invitation matched this email either" (which getCurrentUser()
 * alone collapses to the same `null` as "not signed in", losing the
 * information authContext needs to show a clear "contact HR" denial
 * instead of silently bouncing to /login).
 */
export type IdentityResult =
  | { kind: "authenticated"; user: User }
  | { kind: "not_invited"; email: string }
  | { kind: "none" };

export interface AuthAdapter {
  getSession(): Promise<AuthSession | null>;
  getCurrentUser(): Promise<User | null>;
  resolveIdentity(): Promise<IdentityResult>;
  signIn(): Promise<void>;
  signInWithPassword(email: string, password: string): Promise<void>;
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

function appRoleFromGlobalRole(value: unknown): string {
  const role = Array.isArray(value) ? value[0] : value;
  const name = typeof role === "object" && role !== null
    ? coerceString((role as Record<string, unknown>).name).toLowerCase()
    : "";
  if (name === "co-founder" || name === "hr manager") return "admin";
  if (name.includes("team lead") || name === "category lead") return "team_lead";
  if (name.includes("finance")) return "finance";
  if (name.includes("developer")) return "developer";
  return DEFAULT_ROLE_ID;
}

// ─── Supabase Auth Adapter ────────────────────────────────────────────────────

class SupabaseAuthAdapter implements AuthAdapter {
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
    const role = Array.isArray(row.role) ? row.role[0] : row.role;
    const roleName = typeof role === "object" && role !== null
      ? coerceString((role as Record<string, unknown>).name)
      : "";
    return {
      id: coerceString(row.id),
      name:
        coerceString(row.full_name) ||
        normalizeEmail(row.email as string | undefined),
      email: normalizeEmail(row.email as string | undefined),
      avatar: "",
      userType: roleName.trim().toLowerCase() === "creator" ? "creator" : "employee" as UserType,
      roleId: appRoleFromGlobalRole(row.role),
      roleName,
      departmentId: (coerceString(row.department_id) || undefined) as DeptId | undefined,
      teamId: coerceString(row.department_id) || undefined,
      supervisorId: coerceString(row.manager_user_id) || undefined,
      designationId: coerceString(row.designation_id) || undefined,
      permissionIds: coerceStringArray(row.permission_ids) as PermissionId[],
      createdById: coerceString(row.created_by),
      status: coerceString(row.status, "active") as UserStatus,
      dateJoined: coerceString(row.joined_at) || undefined,
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
      let query = supabase.schema("global").from("users").select("*, role:roles(name)").eq("status", "active");

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
    const result = await this.resolveIdentity();
    return result.kind === "authenticated" ? result.user : null;
  }

  /**
   * Looks up an existing global.users profile by auth user ID. Must filter
   * on status='active' — a non-active row (e.g. a disabled account) must
   * never resolve as a fully authorized user here. This mirrors the same
   * filter getBootstrapUser() already applies.
   */
  private async lookupProfile(authUserId: string): Promise<User | null> {
    const { data: existing, error: selectError } = await withTimeout(
      supabase
        .schema("global")
        .from("users")
        .select("*, role:roles(name)")
        .eq("id", authUserId)
        .eq("status", "active")
        .maybeSingle(),
      AUTH_TIMEOUT_MS,
      { data: null, error: { code: "AUTH_TIMEOUT", message: "User profile lookup timed out." } } as never,
    );

    if (selectError) {
      logRuntimeWarning("Failed to query user profile", { error: selectError });
    }

    return existing ? this.mapSupabaseUser(existing as Record<string, unknown>) : null;
  }

  async resolveIdentity(): Promise<IdentityResult> {
    try {
      const session = await this.getSession();

      if (session?.userId && session.email) {
        const existing = await this.lookupProfile(session.userId);

        if (existing) {
          return { kind: "authenticated", user: existing };
        }

        // No global.users row yet. Self-signup isn't supported — the only
        // way in is a matching HR-created invitation. This is the ONLY
        // code path that ever writes to global.users, and it only ever
        // acts on this session's own identity (auth.uid()), never a
        // client-supplied target.
        const { data: linked, error: consumeError } = await withTimeout(
          supabase.schema("workforce").rpc("consume_employee_invitation"),
          AUTH_TIMEOUT_MS,
          { data: null, error: { code: "AUTH_TIMEOUT", message: "Invitation check timed out." } } as never,
        );

        if (consumeError) {
          logRuntimeWarning("Failed to check employee invitation", { error: consumeError });
        }

        if (linked) {
          const provisioned = await this.lookupProfile(session.userId);
          if (provisioned) {
            return { kind: "authenticated", user: provisioned };
          }
        }

        return { kind: "not_invited", email: session.email };
      }

      // No real session — fall back to bootstrap mode (dev only).
      const bootstrapUser = await this.getBootstrapUser();
      return bootstrapUser ? { kind: "authenticated", user: bootstrapUser } : { kind: "none" };
    } catch (error) {
      logRuntimeWarning("User resolution failed", { error });
      return { kind: "none" };
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

  async signInWithPassword(email: string, password: string): Promise<void> {
    if (!isSupabaseConfigured()) throw new Error("Supabase is not configured.");
    const { error } = await supabase.auth.signInWithPassword({
      email: normalizeEmail(email),
      password,
    });
    if (error) throw new Error(error.message);
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
