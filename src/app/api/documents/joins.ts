import "server-only";
import type { SchemaDb } from "./db";
import type { DeptId } from "@/core/types";

export interface DocumentAccessRow {
  document_id: string;
  role_id: string;
}

export interface DocumentDeptRow {
  document_id: string;
  department_id: string;
}

/** Raw allowed-role UUIDs per document — used for the access check, not for display. */
export async function fetchAllowedRolesByDocument(db: SchemaDb, documentIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (documentIds.length === 0) return map;

  const { data } = await db
    .from("document_allowed_roles")
    .select("document_id, role_id")
    .in("document_id", documentIds)
    .returns<DocumentAccessRow[]>();

  for (const row of data ?? []) {
    const existing = map.get(row.document_id);
    if (existing) existing.push(row.role_id);
    else map.set(row.document_id, [row.role_id]);
  }
  return map;
}

/** Home department per document (the single document_allowed_departments row for that doc). */
export async function fetchHomeDepartmentByDocument(db: SchemaDb, documentIds: string[]): Promise<Map<string, DeptId>> {
  const map = new Map<string, DeptId>();
  if (documentIds.length === 0) return map;

  const { data } = await db
    .from("document_allowed_departments")
    .select("document_id, department_id")
    .in("document_id", documentIds)
    .returns<DocumentDeptRow[]>();

  for (const row of data ?? []) {
    if (!map.has(row.document_id)) map.set(row.document_id, row.department_id as DeptId);
  }
  return map;
}

/** Display names for a set of real global.roles UUIDs. */
export async function fetchRoleNames(globalDb: SchemaDb, roleIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(roleIds)];
  if (unique.length === 0) return map;

  const { data } = await globalDb
    .from("roles")
    .select("id, name")
    .in("id", unique)
    .returns<Array<{ id: string; name: string }>>();

  for (const row of data ?? []) {
    map.set(row.id, row.name);
  }
  return map;
}

export async function writeAllowedRoles(db: SchemaDb, documentId: string, roleIds: string[]): Promise<void> {
  if (roleIds.length === 0) return;
  await db.from("document_allowed_roles").insert(roleIds.map((role_id) => ({ document_id: documentId, role_id })));
}

export async function writeHomeDepartment(db: SchemaDb, documentId: string, departmentId: string | undefined): Promise<void> {
  if (!departmentId) return;
  await db.from("document_allowed_departments").insert({ document_id: documentId, department_id: departmentId });
}

export async function replaceAllowedRoles(db: SchemaDb, documentId: string, roleIds: string[]): Promise<void> {
  await db.from("document_allowed_roles").delete().eq("document_id", documentId);
  await writeAllowedRoles(db, documentId, roleIds);
}
