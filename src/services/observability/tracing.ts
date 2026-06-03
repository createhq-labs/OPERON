export function startTrace(name: string) {
  return { id: `trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, startedAt: new Date().toISOString() };
}

export function endTrace(trace: { id: string; name: string; startedAt: string }) {
  console.debug("trace-end", { ...trace, endedAt: new Date().toISOString() });
}
