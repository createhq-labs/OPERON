import { logWarning, logError, logInfo } from "./logger";

export type DiagnosticLevel = "info" | "warn" | "error";

export interface DiagnosticPayload {
  level: DiagnosticLevel;
  category: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export function logDiagnostic(payload: DiagnosticPayload) {
  const { level, category, message, metadata } = payload;
  const output = {
    category,
    message,
    metadata: metadata ?? {},
    timestamp: new Date().toISOString(),
  };

  if (level === "error") {
    logError(`[${category}] ${message}`, output);
    return;
  }

  if (level === "warn") {
    logWarning(`[${category}] ${message}`, output);
    return;
  }

  logInfo(`[${category}] ${message}`, output);
}
