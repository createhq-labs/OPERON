export function recordIngestionMetric(name: string, value: number, attributes?: Record<string, unknown>) {
  console.debug("metric", { name, value, ...attributes });
}

export function recordParserMetric(name: string, value: number, attributes?: Record<string, unknown>) {
  console.debug("parser-metric", { name, value, ...attributes });
}
