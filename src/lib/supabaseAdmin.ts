import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const rawSupabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";

const supabaseUrlValidation = (() => {
  if (!rawSupabaseUrl) {
    return { valid: false };
  }

  try {
    const parsed = new URL(rawSupabaseUrl);
    return { valid: parsed.protocol === "https:" || parsed.protocol === "http:" };
  } catch {
    return { valid: false };
  }
})();

export const supabaseAdmin: SupabaseClient | null =
  rawSupabaseUrl && rawSupabaseServiceRoleKey && supabaseUrlValidation.valid
    ? createClient(rawSupabaseUrl, rawSupabaseServiceRoleKey, {
        auth: {
          persistSession: false,
        },
      })
    : null;
