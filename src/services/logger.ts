import { logRuntimeEvent, logRuntimeWarning } from "@/services/observability/runtimeLogger";

/**
 * Structured application logger.
 * All output is routed through the observability layer — not console directly.
 * Safe to call on both server and client.
 */

export function logInfo(message: string, metadata?: Record<string, unknown>): void {
  logRuntimeEvent(message, metadata ?? {});
}

export function logWarning(message: string, metadata?: Record<string, unknown>): void {
  logRuntimeWarning(message, metadata ?? {});
}