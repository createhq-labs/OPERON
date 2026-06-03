export function logError(message: string, metadata?: Record<string, unknown>) {
  if (typeof window !== "undefined") {
    console.error("[Operon Error]", message, metadata ?? "");
  }
}

export function logInfo(message: string, metadata?: Record<string, unknown>) {
  if (typeof window !== "undefined") {
    console.info("[Operon]", message, metadata ?? "");
  }
}

export function logDebug(message: string, metadata?: Record<string, unknown>) {
  if (typeof window !== "undefined") {
    console.debug("[Operon Debug]", message, metadata ?? "");
  }
}
