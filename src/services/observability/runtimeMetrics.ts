export function recordRuntimeMetric(name: string, value: number, attributes?: Record<string, unknown>) {
  console.debug("runtime-metric", { name, value, ...attributes });
}
