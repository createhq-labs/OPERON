import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { withTimeout } from "@/lib/async";
import type { User } from "@/core/operon";

const BOOTSTRAP_AUTH_ENABLED =
  process.env.NEXT_PUBLIC_BOOTSTRAP_AUTH === "true" &&
  process.env.NODE_ENV !== "production";
const BOOTSTRAP_AUTH_EMAIL = process.env.NEXT_PUBLIC_BOOTSTRAP_AUTH_EMAIL?.trim() ?? "";

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
  onAuthStateChange(callback: (event: string, session: any) => void): AuthSubscription;
}

const AUTH_BOOTSTRAP_TIMEOUT_MS = 3000;

function normalizeEmail(value: string | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export class SupabaseAuthAdapter implements AuthAdapter {
  async getSession(): Promise<AuthSession | null> {
    if (!isSupabaseConfigured()) {
      return null;
    }

    try {
      const result = await withTimeout(
        supabase.auth.getSession(),
        AUTH_BOOTSTRAP_TIMEOUT_MS,
        { data: { session: null }, error: null } as any
      );

      if (result.error || !result.data?.session?.user) {
        return null;
      }

      return {
        userId: result.data.session.user.id,
        email: normalizeEmail(result.data.session.user.email),
        provider: "supabase",
        expiresAt: result.data.session.expires_at
          ? new Date(result.data.session.expires_at * 1000).toISOString()
          : undefined,
      };
    } catch (error) {
      console.warn("Supabase auth session check failed", error);
      return null;
    }
  }

  private mapSupabaseUser(row: any): User {
    return {
      id: row.id,
      name: row.name ?? row.full_name ?? row.email ?? "",
      email: normalizeEmail(row.email),
      avatar: row.avatar ?? row.avatar_url ?? "",
      userType: row.user_type ?? "employee",
      roleId: row.role_legacy_id ?? row.roleId ?? "role_employee",
      departmentId: row.department_legacy_id ?? row.departmentId,
      teamId: row.team_legacy_id ?? row.teamId,
      supervisorId: row.supervisor_legacy_id ?? row.supervisorId,
      permissionIds: Array.isArray(row.permission_ids) ? row.permission_ids : row.permissionIds ?? [],
      createdById: row.created_by_id ?? row.createdById ?? "",
      status: row.status ?? "active",
    };
  }

  private async getBootstrapUser(): Promise<User | null> {
    if (!BOOTSTRAP_AUTH_ENABLED || !isSupabaseConfigured()) {
      return null;
    }

    try {
      let query = supabase.from("users").select("*").eq("status", "active");

      if (BOOTSTRAP_AUTH_EMAIL) {
        query = query.eq("email", normalizeEmail(BOOTSTRAP_AUTH_EMAIL));
      }

      const { data: bootstrapUser, error } = await withTimeout(
        query.order("created_at", { ascending: true }).limit(1).maybeSingle(),
        AUTH_BOOTSTRAP_TIMEOUT_MS,
        { data: null, error: null } as any
      );

      if (error) {
        console.warn("Bootstrap auth user resolution failed", error);
        return null;
      }

      if (!bootstrapUser) {
        console.warn("Bootstrap auth is enabled but no active Supabase user was found.");
        return null;
      }

      console.debug("Bootstrapped user session", {
        email: bootstrapUser.email,
        roleId: bootstrapUser.role_legacy_id,
      });

      return this.mapSupabaseUser(bootstrapUser);
    } catch (error) {
      console.warn("Bootstrap auth query failed", error);
      return null;
    }
  }

  async getCurrentUser(): Promise<User | null> {
    try {
      const session = await this.getSession();
      if (session && session.userId && session.email) {
        const { data: userRecord, error: selectError } = await supabase
          .from("users")
          .select("*")
          .eq("auth_user_id", session.userId)
          .single();

        if (selectError && selectError.code !== "PGRST116") {
          console.warn("Failed to query Supabase user profile", selectError);
        }

        if (userRecord) {
          return this.mapSupabaseUser(userRecord);
        }

        const newUser = {
          legacy_id: session.userId,
          auth_user_id: session.userId,
          email: session.email,
          name: session.email,
          avatar: "",
          user_type: "employee",
          role_legacy_id: "role_employee",
          permission_ids: [],
          created_by_id: session.userId,
          status: "active",
        };

        const { data: insertedUser, error: insertError } = await supabase
          .from("users")
          .insert(newUser)
          .select("*")
          .single();

        if (insertError) {
          console.warn("Failed to create Supabase user profile", insertError);
          return null;
        }

        return this.mapSupabaseUser(insertedUser);
      }

      return await this.getBootstrapUser();
    } catch (error) {
      console.warn("Supabase auth current user resolution failed", error);
      return null;
    }
  }

  async signIn(): Promise<void> {
    if (!isSupabaseConfigured()) {
      throw new Error("Authentication is not configured.");
    }

    const redirectTo = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_REDIRECT_URI?.trim();
    const options = redirectTo ? { redirectTo } : undefined;

    try {
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options,
      });
    } catch (error) {
      console.error("Supabase sign-in failed", error);
      throw error;
    }
  }

  async signOut(): Promise<void> {
    if (!isSupabaseConfigured()) {
      return;
    }

    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.warn("Supabase sign-out failed", error);
    }
  }

  onAuthStateChange(callback: (event: string, session: any) => void): AuthSubscription {
    if (!isSupabaseConfigured() || typeof supabase.auth.onAuthStateChange !== "function") {
      return { unsubscribe: () => undefined };
    }

    const subscription = supabase.auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });

    return {
      unsubscribe: () => subscription?.data?.subscription?.unsubscribe?.() ?? undefined,
    };
  }
}

export const authAdapter: AuthAdapter = new SupabaseAuthAdapter();
