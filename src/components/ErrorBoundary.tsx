"use client";

import React from "react";
import { logRuntimeError } from "@/services/observability/runtimeLogger";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  boundaryName: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundaryComponent extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: undefined };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logRuntimeError(`${this.props.boundaryName} caught an error`, {
      error: error.message,
      info: info.componentStack,
    });
  }

  reset() {
    this.setState({ hasError: false, error: undefined });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-bg-primary text-content-primary px-4 py-8">
          <div className="operon-panel max-w-xl p-6 text-sm text-content-secondary">
            <h2 className="text-xl font-semibold tracking-tight text-content-primary">{this.props.boundaryName} encountered an issue.</h2>
            <p className="mt-4 leading-7">Please refresh the page or try again later. If the problem persists, contact your administrator.</p>
            <button
              type="button"
              onClick={this.reset}
              className="mt-6 inline-flex rounded-full border border-border bg-bg-secondary px-5 py-2.5 text-sm font-semibold text-content-primary transition hover:bg-bg-secondary/80"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export function AuthBoundary({ children }: { children: React.ReactNode }) {
  return <ErrorBoundaryComponent boundaryName="AuthBoundary">{children}</ErrorBoundaryComponent>;
}

export function ProviderBoundary({ children }: { children: React.ReactNode }) {
  return <ErrorBoundaryComponent boundaryName="ProviderBoundary">{children}</ErrorBoundaryComponent>;
}

export function RuntimeBoundary({ children }: { children: React.ReactNode }) {
  return <ErrorBoundaryComponent boundaryName="RuntimeBoundary">{children}</ErrorBoundaryComponent>;
}
