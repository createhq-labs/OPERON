import { logDiagnostic } from "./diagnostics";

export function logRuntimeEvent(message: string, metadata?: Record<string, unknown>) {
  logDiagnostic({ level: "info", category: "runtime", message, metadata });
}

export function logRuntimeWarning(message: string, metadata?: Record<string, unknown>) {
  logDiagnostic({ level: "warn", category: "runtime", message, metadata });
}

export function logRuntimeError(message: string, metadata?: Record<string, unknown>) {
  logDiagnostic({ level: "error", category: "runtime", message, metadata });
}
