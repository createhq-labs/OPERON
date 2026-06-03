import { supabase, isSupabaseConfigured } from "@/lib/supabase";

function requireSupabaseConfigured() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
}

export async function signInWithGoogle() {
  requireSupabaseConfigured();
  return supabase.auth.signInWithOAuth({ provider: "google" });
}

export async function signOut() {
  if (!isSupabaseConfigured()) {
    return { data: null, error: null };
  }
  return supabase.auth.signOut();
}

export async function getSession() {
  if (!isSupabaseConfigured()) {
    return { data: null, error: null };
  }
  return supabase.auth.getSession();
}
