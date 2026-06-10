"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/auth/authContext";

export default function LoginPage() {
  const { signIn, status } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
    emailRef.current?.focus();
  }, []);

  // Redirect authenticated users away from login.
  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/");
    }
  }, [status, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setError(null);
    setLoading(true);

    try {
      await signIn();
      // Navigation is handled by the status effect above.
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to sign in. Check your credentials and try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <style>{styles}</style>

      <div className={`login-root${mounted ? " login-root--visible" : ""}`}>
        {/* Ambient background grid */}
        <div className="login-grid" aria-hidden="true" />

        {/* Radial glow */}
        <div className="login-glow" aria-hidden="true" />

        <main className="login-container">
          {/* Wordmark */}
          <header className="login-header">
            <span className="login-wordmark">Operon</span>
            <p className="login-tagline">Operational Knowledge Platform</p>
          </header>

          {/* Card */}
          <section className="login-card">
            <form onSubmit={handleSubmit} noValidate>
              <div className="login-fields">
                {/* Email */}
                <div className="login-field">
                  <label htmlFor="email" className="login-label">
                    Work email
                  </label>
                  <input
                    ref={emailRef}
                    id="email"
                    type="email"
                    autoComplete="email"
                    spellCheck={false}
                    required
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError(null);
                    }}
                    className="login-input"
                    placeholder="you@company.com"
                    disabled={loading}
                  />
                </div>

                {/* Password */}
                <div className="login-field">
                  <label htmlFor="password" className="login-label">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError(null);
                    }}
                    className="login-input"
                    placeholder="••••••••••••"
                    disabled={loading}
                  />
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="login-error" role="alert">
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                className={`login-button${loading ? " login-button--loading" : ""}`}
                disabled={loading || !email || !password}
              >
                <span className="login-button-text">
                  {loading ? "Signing in…" : "Sign in"}
                </span>
                {!loading && (
                  <svg
                    className="login-button-arrow"
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M3 8h10M9 4l4 4-4 4"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
                {loading && <span className="login-spinner" aria-hidden="true" />}
              </button>
            </form>
          </section>

          {/* Footer */}
          <footer className="login-footer">
            <span>Secure access · Role-based permissions · Google Drive sync</span>
          </footer>
        </main>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Styles — scoped inline to avoid polluting global CSS
// ---------------------------------------------------------------------------

const styles = `
  .login-root {
    min-height: 100dvh;
    background-color: #0A0A0A;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    position: relative;
    overflow: hidden;
    opacity: 0;
    transform: translateY(8px);
    transition: opacity 0.35s cubic-bezier(0.44, 0, 0.56, 1),
                transform 0.35s cubic-bezier(0.44, 0, 0.56, 1);
  }

  .login-root--visible {
    opacity: 1;
    transform: translateY(0);
  }

  .login-grid {
    position: absolute;
    inset: 0;
    background-image: radial-gradient(
      circle,
      rgba(255, 255, 255, 0.035) 1px,
      transparent 1px
    );
    background-size: 28px 28px;
    pointer-events: none;
  }

  .login-glow {
    position: absolute;
    top: 40%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 600px;
    height: 400px;
    background: radial-gradient(
      ellipse at center,
      rgba(245, 166, 35, 0.055) 0%,
      transparent 70%
    );
    pointer-events: none;
  }

  .login-container {
    width: 100%;
    max-width: 400px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 40px;
    position: relative;
    z-index: 1;
  }

  .login-header {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .login-wordmark {
    font-family: 'Satoshi', sans-serif;
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -0.03em;
    color: #FFFFFF;
  }

  .login-tagline {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 13px;
    font-weight: 400;
    color: rgba(255, 255, 255, 0.35);
    letter-spacing: 0.01em;
    margin: 0;
  }

  .login-card {
    width: 100%;
    background: #111111;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 32px;
  }

  .login-fields {
    display: flex;
    flex-direction: column;
    gap: 20px;
    margin-bottom: 24px;
  }

  .login-field {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .login-label {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 12px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.5);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .login-input {
    width: 100%;
    height: 44px;
    background: #151515;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    padding: 0 14px;
    font-family: 'Inter', sans-serif;
    font-size: 14px;
    color: #FFFFFF;
    outline: none;
    transition: border-color 0.15s ease,
                box-shadow 0.15s ease;
    box-sizing: border-box;
  }

  .login-input::placeholder {
    color: rgba(255, 255, 255, 0.2);
  }

  .login-input:focus {
    border-color: rgba(245, 166, 35, 0.45);
    box-shadow: 0 0 0 3px rgba(245, 166, 35, 0.08);
  }

  .login-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .login-error {
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: 8px;
    padding: 10px 14px;
    font-family: 'Inter', sans-serif;
    font-size: 13px;
    color: rgba(239, 68, 68, 0.9);
    margin-bottom: 20px;
    line-height: 1.4;
  }

  .login-button {
    width: 100%;
    height: 44px;
    background: #F5A623;
    border: none;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    cursor: pointer;
    transition: opacity 0.15s ease,
                transform 0.1s ease;
    position: relative;
  }

  .login-button:hover:not(:disabled) {
    opacity: 0.9;
  }

  .login-button:active:not(:disabled) {
    transform: scale(0.99);
  }

  .login-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .login-button-text {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 14px;
    font-weight: 600;
    color: #0A0A0A;
    letter-spacing: -0.01em;
  }

  .login-button-arrow {
    color: #0A0A0A;
    flex-shrink: 0;
    transition: transform 0.15s ease;
  }

  .login-button:hover:not(:disabled) .login-button-arrow {
    transform: translateX(2px);
  }

  .login-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(10, 10, 10, 0.3);
    border-top-color: #0A0A0A;
    border-radius: 50%;
    animation: login-spin 0.6s linear infinite;
    flex-shrink: 0;
  }

  @keyframes login-spin {
    to { transform: rotate(360deg); }
  }

  .login-footer {
    font-family: 'Inter', sans-serif;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.18);
    text-align: center;
    letter-spacing: 0.02em;
  }

  @media (prefers-reduced-motion: reduce) {
    .login-root {
      transition: none;
      opacity: 1;
      transform: none;
    }
    .login-spinner {
      animation: none;
      opacity: 0.6;
    }
    .login-button-arrow {
      transition: none;
    }
  }
`;
