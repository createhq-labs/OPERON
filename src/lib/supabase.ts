import { createClient, type SupabaseClient } from "@supabase/supabase-js";
 
// ─── Raw Config ───────────────────────────────────────────────────────────────
 
const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const rawSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
 
// ─── URL Validation ───────────────────────────────────────────────────────────
 
export const supabaseUrlValidation: { valid: boolean; message: string } = (() => {
  if (!rawSupabaseUrl) {
    return { valid: false, message: "NEXT_PUBLIC_SUPABASE_URL is missing." };
  }
  try {
    const parsed = new URL(rawSupabaseUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { valid: false, message: "Supabase URL must use http or https." };
    }
    return { valid: true, message: "" };
  } catch {
    return { valid: false, message: "NEXT_PUBLIC_SUPABASE_URL is malformed." };
  }
})();
 
// ─── Safe Stub Client ─────────────────────────────────────────────────────────
 
/**
 * A no-op Supabase client returned when credentials are missing or invalid.
 * All query methods chain safely and resolve to empty results — no network
 * calls are made and no exceptions are thrown.
 */
function createSafeSupabaseClient(): SupabaseClient {
  // Every builder method returns `this` for chaining. Terminal methods
  // (single, maybeSingle, limit, etc.) return a resolved empty result.
  const builder: Record<string, unknown> = {};
 
  const chainable = () => builder;
  const terminal = async () => ({ data: null, error: null });
  const terminalList = async () => ({ data: [] as unknown[], error: null });
 
  const methods: Record<string, () => unknown> = {
    select: chainable,
    insert: terminalList,
    upsert: terminalList,
    update: terminalList,
    delete: terminalList,
    eq: chainable,
    neq: chainable,
    is: chainable,
    in: chainable,
    not: chainable,
    match: chainable,
    contains: chainable,
    filter: chainable,
    or: chainable,
    order: chainable,
    throwOnError: chainable,
    limit: terminal,
    single: terminal,
    maybeSingle: terminal,
  };
 
  for (const [key, fn] of Object.entries(methods)) {
    builder[key] = fn;
  }
 
  return {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      signInWithOAuth: async () => ({ data: null, error: null }),
      signInWithPassword: async () => ({ data: null, error: null }),
      signUp: async () => ({ data: { user: null, session: null }, error: null }),
      signOut: async () => ({ data: null, error: null }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
    },
    from: () => builder,
  } as unknown as SupabaseClient;
}
 
// ─── Client ───────────────────────────────────────────────────────────────────
 
const supabaseClient: SupabaseClient | null =
  rawSupabaseUrl && rawSupabaseAnonKey && supabaseUrlValidation.valid
    ? createClient(rawSupabaseUrl, rawSupabaseAnonKey, {
        auth: {
          persistSession: true,
          detectSessionInUrl: true,
        },
      })
    : null;
 
export const supabase: SupabaseClient =
  supabaseClient ?? createSafeSupabaseClient();
 
export function isSupabaseConfigured(): boolean {
  return supabaseClient !== null;
}
 
// ─── Diagnostics ─────────────────────────────────────────────────────────────
 
export interface SupabaseDiagnostics {
  configured: boolean;
  url: string;
  urlValid: boolean;
  anonKeyPresent: boolean;
  providerMode: "supabase" | "local";
  fallbackMode: boolean;
  authMode: "anon" | "none";
  warnings: string[];
  message: string;
}
 
export function getSupabaseDiagnostics(): SupabaseDiagnostics {
  const warnings: string[] = [];
 
  if (!rawSupabaseUrl) warnings.push("Missing NEXT_PUBLIC_SUPABASE_URL.");
  if (!rawSupabaseAnonKey) warnings.push("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  if (!supabaseUrlValidation.valid) warnings.push(supabaseUrlValidation.message);
 
  const configured = isSupabaseConfigured();
  const providerMode =
    rawSupabaseUrl && rawSupabaseAnonKey && supabaseUrlValidation.valid
      ? "supabase"
      : "local";
  const authMode = rawSupabaseAnonKey ? "anon" : "none";
 
  return {
    configured,
    url: rawSupabaseUrl,
    urlValid: supabaseUrlValidation.valid,
    anonKeyPresent: Boolean(rawSupabaseAnonKey),
    providerMode,
    fallbackMode: !configured,
    authMode,
    warnings,
    message: configured
      ? "Supabase appears configured."
      : warnings.length > 0
      ? warnings.join(" ")
      : "Supabase is unavailable.",
  };
}
 
// ─── Availability Probe ───────────────────────────────────────────────────────
 
const DEFAULT_CHECK_TIMEOUT_MS = 3000;
const DEFAULT_RETRY_DELAY_MS = 300;
 
/**
 * Probes Supabase connectivity using a lightweight auth session check.
 * Avoids table-level queries that may be blocked by RLS policies.
 */
async function probeSupabaseConnection(): Promise<{
  available: boolean;
  reason: string;
}> {
  try {
    const { error } = await supabase.auth.getSession();
    if (error) {
      return {
        available: false,
        reason: error.message ?? "Supabase session check failed.",
      };
    }
    return { available: true, reason: "Supabase is available." };
  } catch (err) {
    return {
      available: false,
      reason: String(err ?? "Supabase connectivity check threw."),
    };
  }
}
 
export async function resolveSupabaseAvailability(
  timeoutMs = DEFAULT_CHECK_TIMEOUT_MS
): Promise<{ available: boolean; reason: string; diagnostics: SupabaseDiagnostics }> {
  const diagnostics = getSupabaseDiagnostics();
 
  if (!diagnostics.configured) {
    return { available: false, reason: diagnostics.message, diagnostics };
  }
 
  const deadline = Date.now() + timeoutMs;
 
  for (let attempt = 1; attempt <= 2; attempt++) {
    const remaining = Math.max(0, deadline - Date.now());
    if (remaining <= 0) break;
 
    const timeoutPromise = new Promise<{
      available: false;
      reason: string;
      diagnostics: SupabaseDiagnostics;
    }>((resolve) =>
      setTimeout(
        () =>
          resolve({
            available: false,
            reason: "Supabase availability timed out.",
            diagnostics,
          }),
        remaining
      )
    );
 
    const probePromise = probeSupabaseConnection().then((result) => ({
      ...result,
      diagnostics,
    }));
 
    const result = await Promise.race([probePromise, timeoutPromise]);
 
    if (result.available || attempt === 2) {
      return result;
    }
 
    await new Promise<void>((resolve) =>
      setTimeout(
        resolve,
        Math.min(DEFAULT_RETRY_DELAY_MS, Math.max(0, deadline - Date.now()))
      )
    );
  }
 
  return {
    available: false,
    reason: "Supabase availability could not be confirmed.",
    diagnostics,
  };
}
