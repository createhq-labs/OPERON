import type { ProviderHealth } from "@/services/api";

export function isProviderHealthy(report: ProviderHealth | null): boolean {
  if (!report) {
    return false;
  }
  return report.available && report.status === "connected";
}

export function shouldUseFallback(report: ProviderHealth | null): boolean {
  return !isProviderHealthy(report);
}
