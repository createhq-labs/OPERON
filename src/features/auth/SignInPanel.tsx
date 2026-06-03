"use client";

import type { Role, RoleId } from "@/core/operon";

interface SignInPanelProps {
  signIn: () => Promise<void>;
  enableDevAuth: boolean;
  signInOptions: Role[];
  handleDevLogin: (roleId: RoleId) => void;
  googleAuthConfigured: boolean;
  googleAuthUnavailableMessage?: string;
}

export function SignInPanel({
  signIn,
  enableDevAuth,
  signInOptions,
  handleDevLogin,
  googleAuthConfigured,
  googleAuthUnavailableMessage,
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
          {!googleAuthConfigured && googleAuthUnavailableMessage ? (
            <div className="col-span-full rounded-3xl border border-border-subtle bg-bg-primary/95 p-4 text-sm text-content-secondary">
              <div className="font-semibold text-content-primary">Google Sign-In is temporarily unavailable</div>
              <p className="mt-2 text-sm leading-6">{googleAuthUnavailableMessage}</p>
            </div>
          ) : null}
          {enableDevAuth ? (
            <div className="col-span-full rounded-3xl border border-border bg-bg-secondary/95 p-4 text-sm text-content-secondary">
              <div className="mb-3 text-base font-semibold text-content-primary">Developer fallback</div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {signInOptions.map((role) => (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => handleDevLogin(role.id)}
                    className="rounded-3xl border border-border bg-bg-secondary px-5 py-4 text-left text-sm font-semibold text-content-primary transition hover:border-primary hover:bg-bg-secondary/90"
                  >
                    {role.name}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs uppercase tracking-[0.22em] text-content-tertiary">Use only when local development mode is enabled.</p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
