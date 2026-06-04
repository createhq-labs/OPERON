import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const rawSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
const rawSupabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";

const supabaseUrlValidation = (() => {
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

const supabaseClient = rawSupabaseUrl && rawSupabaseAnonKey && supabaseUrlValidation.valid
  ? createClient(rawSupabaseUrl, rawSupabaseAnonKey, {
      auth: {
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;

function createSafeSupabaseClient(): SupabaseClient {
  const safeQuery: any = {
    select: function () {
      return this;
    },
    upsert: async function () {
      return { data: [], error: null };
    },
    insert: async function () {
      return { data: [], error: null };
    },
    update: async function () {
      return { data: [], error: null };
    },
    delete: async function () {
      return { data: [], error: null };
    },
    eq: function () {
      return this;
    },
    neq: function () {
      return this;
    },
    is: function () {
      return this;
    },
    in: function () {
      return this;
    },
    not: function () {
      return this;
    },
    match: function () {
      return this;
    },
    order: function () {
      return this;
    },
    limit: async function () {
      return { data: [], error: null };
    },
    single: async function () {
      return { data: null, error: null };
    },
    maybeSingle: async function () {
      return { data: null, error: null };
    },
    throwOnError: function () {
      return this;
    },
    filter: function () {
      return this;
    },
    contains: function () {
      return this;
    },
    or: function () {
      return this;
    },
  };

  return {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      signInWithOAuth: async () => ({ data: null, error: null }),
      signOut: async () => ({ data: null, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    } as any,
    from: () => safeQuery,
  } as unknown as SupabaseClient;
}

export const supabase: SupabaseClient = supabaseClient ?? createSafeSupabaseClient();

export function isSupabaseConfigured() {
  return Boolean(supabaseClient);
}

export interface SupabaseDiagnostics {
  configured: boolean;
  url: string;
  urlValid: boolean;
  anonKeyPresent: boolean;
  serviceRoleKeyPresent: boolean;
  providerMode: "supabase" | "local";
  fallbackMode: boolean;
  authMode: "anon" | "service_role" | "none";
  warnings: string[];
  message: string;
}

export function getSupabaseDiagnostics(): SupabaseDiagnostics {
  const warnings: string[] = [];

  if (!rawSupabaseUrl) {
    warnings.push("Missing NEXT_PUBLIC_SUPABASE_URL.");
  }

  if (!rawSupabaseAnonKey) {
    warnings.push("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  if (!supabaseUrlValidation.valid) {
    warnings.push(supabaseUrlValidation.message);
  }

  const configured = isSupabaseConfigured();
  const providerMode = rawSupabaseUrl && rawSupabaseAnonKey && supabaseUrlValidation.valid ? "supabase" : "local";
  const authMode = rawSupabaseAnonKey
    ? rawSupabaseServiceRoleKey
      ? "service_role"
      : "anon"
    : "none";
  const diagnostics: SupabaseDiagnostics = {
    configured,
    url: rawSupabaseUrl,
    urlValid: supabaseUrlValidation.valid,
    anonKeyPresent: Boolean(rawSupabaseAnonKey),
    serviceRoleKeyPresent: Boolean(rawSupabaseServiceRoleKey),
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

  console.debug("Supabase diagnostics", {
    configured: diagnostics.configured,
    url: diagnostics.url,
    urlValid: diagnostics.urlValid,
    anonKeyPresent: diagnostics.anonKeyPresent,
    serviceRoleKeyPresent: diagnostics.serviceRoleKeyPresent,
    providerMode: diagnostics.providerMode,
    fallbackMode: diagnostics.fallbackMode,
    authMode: diagnostics.authMode,
    warnings: diagnostics.warnings,
    message: diagnostics.message,
  });

  return diagnostics;
}

const DEFAULT_SUPABASE_CHECK_TIMEOUT_MS = 3000;
const DEFAULT_SUPABASE_RETRY_DELAY_MS = 300;

async function probeSupabaseConnection(): Promise<{ available: boolean; reason: string }> {
  try {
    const { error } = await supabase.from("roles").select("id").limit(1);
    if (error) {
      return { available: false, reason: String(error.message ?? "Supabase health check failed.") };
    }
    return { available: true, reason: "Supabase is available." };
  } catch (error) {
    return { available: false, reason: String(error ?? "Supabase health check threw.") };
  }
}

export async function resolveSupabaseAvailability(timeoutMs = DEFAULT_SUPABASE_CHECK_TIMEOUT_MS) {
  const diagnostics = getSupabaseDiagnostics();
  if (!diagnostics.configured) {
    return { available: false, reason: diagnostics.message, diagnostics };
  }

  const deadline = Date.now() + timeoutMs;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const remaining = Math.max(0, deadline - Date.now());
    if (remaining <= 0) {
      break;
    }

    const timeoutPromise = new Promise<{ available: false; reason: string; diagnostics: SupabaseDiagnostics }>((resolve) =>
      setTimeout(() => resolve({ available: false, reason: "Supabase availability timed out.", diagnostics }), remaining)
    );

    const probePromise = (async () => {
      const result = await probeSupabaseConnection();
      return { available: result.available, reason: result.reason, diagnostics };
    })();

    const result = await Promise.race([probePromise, timeoutPromise]);
    if (result.available || attempt === 2) {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, Math.min(DEFAULT_SUPABASE_RETRY_DELAY_MS, Math.max(0, deadline - Date.now()))));
  }

  return { available: false, reason: "Supabase availability could not be confirmed.", diagnostics };
}
