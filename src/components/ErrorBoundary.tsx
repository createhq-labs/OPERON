"use client";

import React from "react";
import { motion } from "framer-motion";
import { logRuntimeError } from "@/services/observability/runtimeLogger";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ErrorBoundaryProps {
  children: React.ReactNode;
  boundaryName: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

// ─── Core Boundary ────────────────────────────────────────────────────────────

class ErrorBoundaryComponent extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: undefined };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logRuntimeError(`${this.props.boundaryName} caught an error`, {
      error: error.message,
      info: info.componentStack,
    });
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg)",
          padding: "32px 16px",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.44, 0, 0.56, 1] }}
          style={{
            maxWidth: "440px",
            width: "100%",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-xl)",
            padding: "40px 32px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "var(--r-md)",
              background: "var(--surface-3)",
              border: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 24px",
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              style={{ color: "var(--text-2)" }}
            >
              <path
                d="M9 3v6M9 13v.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M7.3 1.5L1.5 12a2 2 0 001.7 3h11.6a2 2 0 001.7-3L10.7 1.5a2 2 0 00-3.4 0z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--text-20)",
              fontWeight: 600,
              color: "var(--text)",
              marginBottom: "8px",
            }}
          >
            Something went wrong
          </h2>

          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "var(--text-14)",
              color: "var(--text-2)",
              lineHeight: 1.6,
              marginBottom: "28px",
            }}
          >
            An unexpected error occurred. Refresh the page or contact support
            if the problem persists.
          </p>

          <motion.button
            onClick={() => window.location.reload()}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: "var(--text-14)",
              fontWeight: 500,
              color: "var(--text)",
              background: "var(--surface-3)",
              border: "1px solid var(--border-hover)",
              borderRadius: "var(--r-md)",
              padding: "8px 20px",
              cursor: "pointer",
              transition: "border-color 150ms",
            }}
          >
            Refresh page
          </motion.button>
        </motion.div>
      </div>
    );
  }
}

// ─── Named Boundaries ─────────────────────────────────────────────────────────

export function AuthBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundaryComponent boundaryName="AuthBoundary">
      {children}
    </ErrorBoundaryComponent>
  );
}

export function ProviderBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundaryComponent boundaryName="ProviderBoundary">
      {children}
    </ErrorBoundaryComponent>
  );
}

export function RuntimeBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundaryComponent boundaryName="RuntimeBoundary">
      {children}
    </ErrorBoundaryComponent>
  );
}