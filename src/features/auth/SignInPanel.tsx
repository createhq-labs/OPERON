"use client";

import type { Role, RoleId } from "@/core/operon";

interface SignInPanelProps {
  signIn: () => Promise<void>;
  googleAuthConfigured: boolean;
  authError?: string;
}

export function SignInPanel({
  signIn,
  googleAuthConfigured,
  authError,
}: SignInPanelProps) {
  return (
    <section className="operon-panel p-6">
      <div className="grid gap-5">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-content-primary">Sign in</h2>
          <p className="mt-3 text-sm leading-6 text-content-secondary">Sign in with Google to access your workspace and role-based documents.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <button
            type="button"
            onClick={googleAuthConfigured ? signIn : undefined}
            disabled={!googleAuthConfigured}
            className={`rounded-3xl border px-5 py-4 text-left text-sm font-semibold transition ${
              googleAuthConfigured
                ? "border-border bg-bg-secondary/90 text-content-primary hover:border-primary hover:bg-bg-secondary"
                : "border-border-subtle bg-bg-secondary/70 text-content-tertiary cursor-not-allowed"
            }`}
          >
            Sign in with Google
          </button>
          {!googleAuthConfigured ? (
            <div className="col-span-full rounded-3xl border border-border-subtle bg-bg-primary/95 p-4 text-sm text-content-secondary">
              <div className="font-semibold text-content-primary">Google Sign-In is unavailable</div>
              <p className="mt-2 text-sm leading-6">
                {authError ?? "Sign in is disabled until Supabase authentication is configured and available."}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
