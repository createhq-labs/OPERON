import { getRuntimeProviderHealth } from "@/services/providerHealth";

export function getRuntimeDiagnostics() {
  return {
    timestamp: new Date().toISOString(),
    providerHealth: getRuntimeProviderHealth(),
  };
}
