import { supabase } from "@/lib/supabase";

export const workforceDb = supabase.schema("workforce");

export class WorkforceDataError extends Error {
  constructor(operation: string, cause: unknown) {
    const detail = typeof cause === "object" && cause !== null && "message" in cause
      ? String((cause as { message?: unknown }).message)
      : "Unknown database error";
    super(`${operation}: ${detail}`);
    this.name = "WorkforceDataError";
  }
}

export async function workforceRpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await workforceDb.rpc(name, args);
  if (error) throw new WorkforceDataError(name, error);
  return data as T;
}
