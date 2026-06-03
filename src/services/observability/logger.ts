export function logInfo(message: string, metadata?: Record<string, unknown>) {
  console.info(message, metadata ?? {});
}

export function logWarning(message: string, metadata?: Record<string, unknown>) {
  console.warn(message, metadata ?? {});
}

export function logError(message: string, metadata?: Record<string, unknown>) {
  console.error(message, metadata ?? {});
}
