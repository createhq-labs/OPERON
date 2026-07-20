import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Type of a schema-scoped client returned by supabaseAdmin.schema("workforce" | "global"). */
export type SchemaDb = ReturnType<SupabaseClient["schema"]>;
