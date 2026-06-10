import { getRuntimeProviderHealth } from "@/services/providerHealth";

/**
 * Returns a point-in-time diagnostics snapshot.
 * Intended for use by the observability layer and health-check endpoints only.
 * Do not render this in the UI.
 */
export function getRuntimeDiagnostics() {
  return {
    timestamp: new Date().toISOString(),
    providerHealth: getRuntimeProviderHealth(),
  };
}