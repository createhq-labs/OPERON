import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const rawSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

/**
 * A server-side Supabase client that acts AS a specific signed-in user
 * (via their own access token) rather than as the service role. Needed for
 * any RPC whose SECURITY DEFINER body reads auth.uid() to identify the
 * caller — workforce.consume_employee_invitation() for example — since
 * auth.uid() only resolves under a real per-user JWT, never under the
 * service-role key. The service-role client (supabaseAdmin) is still the
 * right choice for everything else: it bypasses RLS/grants and has no
 * per-user identity to preserve.
 */
export function createUserScopedClient(accessToken: string): SupabaseClient | null {
  if (!rawSupabaseUrl || !rawSupabaseAnonKey) return null;

  return createClient(rawSupabaseUrl, rawSupabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
