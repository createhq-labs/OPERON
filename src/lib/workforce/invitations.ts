import { globalDb } from "./client";
import type { UUID } from "./types";

export interface AssignmentOption {
  id: UUID;
  name: string;
}

/** Role/department/manager options — these live on global.*, used by the document upload/edit permission pickers. */
export async function listAssignableRoles(): Promise<AssignmentOption[]> {
  const { data, error } = await globalDb.from("roles").select("id, name").order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as AssignmentOption[];
}

export async function listAssignableDepartments(): Promise<AssignmentOption[]> {
  const { data, error } = await globalDb.from("departments").select("id, name").order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as AssignmentOption[];
}
