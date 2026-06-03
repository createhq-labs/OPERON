export function recordRuntimeMetric(name: string, value: number, attributes?: Record<string, unknown>) {
  console.debug("runtime-metric", { name, value, ...attributes });
}

export function recordAuthMetric(name: string, value: number, attributes?: Record<string, unknown>) {
  console.debug("auth-metric", { name, value, ...attributes });
}
