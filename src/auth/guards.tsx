"use client";

import { type ReactNode, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/auth/authContext";

// ─── RequireAuth ──────────────────────────────────────────────────────────────

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loaded, status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loaded && !user && pathname !== "/login") {
      router.replace("/login");
    }
  }, [loaded, user, router, pathname]);

  if (!loaded) {
    return <AuthLoadingScreen />;
  }

  if (status === "failed") {
    return <AuthFailedScreen />;
  }

  if (!user) {
    // Redirect in progress — render nothing to avoid a flash.
    return null;
  }

  return <>{children}</>;
}

// ─── Loading Screen ───────────────────────────────────────────────────────────

function AuthLoadingScreen() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "16px",
        }}
      >
        <LoadingSpinner />
        <p
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: "var(--text-14)",
            color: "var(--text-3)",
            margin: 0,
          }}
        >
          Loading…
        </p>
      </div>
    </div>
  );
}

// ─── Failed Screen ────────────────────────────────────────────────────────────

function AuthFailedScreen() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
      }}
    >
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)",
          padding: "24px 32px",
          maxWidth: "360px",
          textAlign: "center",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: "var(--text-14)",
            color: "var(--text-2)",
            margin: 0,
          }}
        >
          Authentication failed. Please refresh the page or check your
          connection.
        </p>
      </div>
    </div>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function LoadingSpinner() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        animation: "operon-spin 0.8s linear infinite",
      }}
    >
      <style>{`
        @keyframes operon-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
      <circle
        cx="10"
        cy="10"
        r="8"
        stroke="var(--border-hover)"
        strokeWidth="2"
      />
      <path
        d="M10 2a8 8 0 0 1 8 8"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}