export function getAnalyticsSummary(metrics: Record<string, number>) {
  return Object.entries(metrics).map(([key, value]) => ({ key, value }));
}
