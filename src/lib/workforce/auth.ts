import { supabase } from "@/lib/supabase";
import { globalDb, WorkforceDataError } from "./client";
import type { GlobalUser } from "./types";

export async function getCurrentGlobalUser(): Promise<GlobalUser | null> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw new WorkforceDataError("get current auth user", authError);
  if (!auth.user) return null;
  const { data, error } = await globalDb.from("users")
    .select("*, role:roles(id,name), department:departments(id,name), designation:designations(id,name)")
    .eq("id", auth.user.id).eq("status", "active").maybeSingle();
  if (error) throw new WorkforceDataError("get global user", error);
  return data as GlobalUser | null;
}

export function roleNameOf(user: GlobalUser): string {
  const role = Array.isArray(user.role) ? user.role[0] : user.role;
  return role?.name ?? "";
}
