import { getProviderHealth } from "@/services/api";
import { getSupabaseDiagnostics } from "@/lib/supabase";

export function getRuntimeProviderHealth() {
  return {
    ...getProviderHealth(),
    supabaseDiagnostics: getSupabaseDiagnostics(),
    offline: typeof window !== "undefined" ? !window.navigator.onLine : false,
  };
}
