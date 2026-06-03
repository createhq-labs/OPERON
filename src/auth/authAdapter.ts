import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { withTimeout } from "@/lib/async";
import type { User } from "@/core/operon";

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

  async getCurrentUser(): Promise<User | null> {
    try {
      const session = await this.getSession();
      if (!session || !session.email) {
        return null;
      }

      const users = (await import("@/services/api")).getUsers();
      return users.find((user) => normalizeEmail(user.email) === session.email) ?? null;
    } catch (error) {
      console.warn("Supabase auth current user resolution failed", error);
      return null;
    }
  }

  async signIn(): Promise<void> {
    if (!isSupabaseConfigured()) {
      throw new Error("Authentication is not configured.");
    }

    try {
      await supabase.auth.signInWithOAuth({ provider: "google" });
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
