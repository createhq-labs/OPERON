// ─────────────────────────────────────────────────────────────────────────────
// Workforce Documentation Platform — data access layer
//
// Talks directly to the Finance Dashboard's real Supabase schema from
// supabase-migrations/008_workforce_documentation_platform.sql —
// NOT the legacy_id-based schema in supabase-schema.sql that src/services/api.ts
// and src/core/operon.ts use. That system models a different, not-yet-deployed
// identity model; this module is the real, currently-live one.
//
// Identity (`users`) lives in `public`, owned by the Finance Dashboard.
// Every documentation-specific table lives in the `workforce` schema and
// is queried via `doc.from(...)` below — a bare `supabase.from(...)` only
// ever resolves against `public`. `workforce` must be added to Supabase's
// "Exposed schemas" API setting (Project Settings → API) for this to work.
//
// RLS on every table already enforces visibility (global/team/role/private) —
// these functions do plain selects/inserts and let Postgres decide what rows
// come back. The one thing RLS can't do for you is supply `created_by`/
// `user_id` values on insert, so callers still need the current user's
// `users.id` (via getCurrentDocPlatformUser()) for any write.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { uploadFileToStorage } from "@/services/storage";
import { logWarning } from "@/services/logger";

/** Scoped client for the workforce schema — every doc-platform table lives here, not in `public`. */
const doc = supabase.schema("workforce");

// ─── Types ──────────────────────────────────────────────────────────────────

export type DocPlatformUserRole = "employee" | "team_lead" | "finance" | "admin" | "developer";
export type DocPlatformVisibilityScope = "global" | "team" | "role" | "private";

export interface DocPlatformUser {
  id: string;
  email: string;
  fullName: string;
  role: DocPlatformUserRole;
  teamName: string | null;
}

export interface DocumentCategory {
  id: string;
  name: string;
  slug: string | null;
  sortOrder: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentTag {
  id: string;
  name: string;
  slug: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface DocPlatformDocument {
  id: string;
  title: string;
  description: string | null;
  categoryId: string | null;
  storagePath: string | null;
  fileName: string | null;
  fileSizeBytes: number | null;
  mimeType: string | null;
  previewUrl: string | null;
  visibilityScope: DocPlatformVisibilityScope;
  allowedTeamNames: string[];
  currentVersion: number;
  requiresAcknowledgement: boolean;
  isActive: boolean;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  storagePath: string | null;
  fileName: string | null;
  fileSizeBytes: number | null;
  mimeType: string | null;
  changelog: string | null;
  createdBy: string;
  createdAt: string;
}

export interface DocumentAcknowledgement {
  id: string;
  documentVersionId: string;
  userId: string;
  acknowledgedAt: string;
  note: string | null;
}

export interface ResourceCategory {
  id: string;
  name: string;
  slug: string | null;
  sortOrder: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocPlatformResource {
  id: string;
  title: string;
  description: string | null;
  categoryId: string | null;
  url: string;
  external: boolean;
  visibilityScope: DocPlatformVisibilityScope;
  allowedTeamNames: string[];
  isActive: boolean;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Row → App-shape Mappers ──────────────────────────────────────────────────

function mapCategory(row: Record<string, unknown>): DocumentCategory {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: (row.slug as string | null) ?? null,
    sortOrder: (row.sort_order as number) ?? 0,
    createdBy: (row.created_by as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapTag(row: Record<string, unknown>): DocumentTag {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: (row.slug as string | null) ?? null,
    createdBy: (row.created_by as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

function mapDocument(row: Record<string, unknown>): DocPlatformDocument {
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    categoryId: (row.category_id as string | null) ?? null,
    storagePath: (row.storage_path as string | null) ?? null,
    fileName: (row.file_name as string | null) ?? null,
    fileSizeBytes: (row.file_size_bytes as number | null) ?? null,
    mimeType: (row.mime_type as string | null) ?? null,
    previewUrl: (row.preview_url as string | null) ?? null,
    visibilityScope: row.visibility_scope as DocPlatformVisibilityScope,
    allowedTeamNames: (row.allowed_team_names as string[]) ?? [],
    currentVersion: row.current_version as number,
    requiresAcknowledgement: (row.requires_acknowledgement as boolean) ?? false,
    isActive: row.is_active as boolean,
    createdBy: row.created_by as string,
    updatedBy: (row.updated_by as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapVersion(row: Record<string, unknown>): DocumentVersion {
  return {
    id: row.id as string,
    documentId: row.document_id as string,
    versionNumber: row.version_number as number,
    storagePath: (row.storage_path as string | null) ?? null,
    fileName: (row.file_name as string | null) ?? null,
    fileSizeBytes: (row.file_size_bytes as number | null) ?? null,
    mimeType: (row.mime_type as string | null) ?? null,
    changelog: (row.changelog as string | null) ?? null,
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
  };
}

function mapAcknowledgement(row: Record<string, unknown>): DocumentAcknowledgement {
  return {
    id: row.id as string,
    documentVersionId: row.document_version_id as string,
    userId: row.user_id as string,
    acknowledgedAt: row.acknowledged_at as string,
    note: (row.note as string | null) ?? null,
  };
}

function mapResource(row: Record<string, unknown>): DocPlatformResource {
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    categoryId: (row.category_id as string | null) ?? null,
    url: row.url as string,
    external: row.external as boolean,
    visibilityScope: row.visibility_scope as DocPlatformVisibilityScope,
    allowedTeamNames: (row.allowed_team_names as string[]) ?? [],
    isActive: row.is_active as boolean,
    createdBy: row.created_by as string,
    updatedBy: (row.updated_by as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ─── Current User ───────────────────────────────────────────────────────────

/** Resolves the signed-in Supabase auth user to their `public.users` row. */
export async function getCurrentDocPlatformUser(): Promise<DocPlatformUser | null> {
  if (!isSupabaseConfigured()) return null;

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user) return null;

  const { data, error } = await supabase
    .from("users")
    .select("id, email, full_name, role, team_name")
    .eq("supabase_auth_id", authData.user.id)
    .maybeSingle();

  if (error || !data) {
    if (error) logWarning("Failed to resolve current Documentation Platform user", { error });
    return null;
  }

  return {
    id: data.id as string,
    email: data.email as string,
    fullName: data.full_name as string,
    role: data.role as DocPlatformUserRole,
    teamName: (data.team_name as string | null) ?? null,
  };
}

// ─── Document Categories ────────────────────────────────────────────────────

export async function listDocumentCategories(): Promise<DocumentCategory[]> {
  const { data, error } = await doc
    .from("document_categories")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(mapCategory);
}

export async function createDocumentCategory(input: {
  name: string;
  slug?: string;
  sortOrder?: number;
  createdBy: string;
}): Promise<DocumentCategory> {
  const { data, error } = await doc
    .from("document_categories")
    .insert({
      name: input.name,
      slug: input.slug ?? null,
      sort_order: input.sortOrder ?? 0,
      created_by: input.createdBy,
    })
    .select()
    .single();

  if (error) throw error;
  return mapCategory(data);
}

// ─── Document Tags ──────────────────────────────────────────────────────────

export async function listDocumentTags(): Promise<DocumentTag[]> {
  const { data, error } = await doc.from("document_tags").select("*").order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapTag);
}

export async function createDocumentTag(input: { name: string; slug?: string; createdBy: string }): Promise<DocumentTag> {
  const { data, error } = await doc
    .from("document_tags")
    .insert({ name: input.name, slug: input.slug ?? null, created_by: input.createdBy })
    .select()
    .single();

  if (error) throw error;
  return mapTag(data);
}

export async function setDocumentTags(documentId: string, tagIds: string[]): Promise<void> {
  const { error: deleteError } = await doc.from("document_tag_map").delete().eq("document_id", documentId);
  if (deleteError) throw deleteError;

  if (tagIds.length === 0) return;

  const { error: insertError } = await doc
    .from("document_tag_map")
    .insert(tagIds.map((tagId) => ({ document_id: documentId, tag_id: tagId })));

  if (insertError) throw insertError;
}

export async function listTagsForDocument(documentId: string): Promise<DocumentTag[]> {
  const { data, error } = await doc
    .from("document_tag_map")
    .select("document_tags(*)")
    .eq("document_id", documentId);

  if (error) throw error;
  return (data ?? [])
    .map((row) => (row as unknown as { document_tags: Record<string, unknown> }).document_tags)
    .filter(Boolean)
    .map(mapTag);
}

// ─── Documents ──────────────────────────────────────────────────────────────

/** RLS already filters to whatever this user is allowed to see — no client-side filtering needed. */
export async function listDocuments(filters?: { categoryId?: string; activeOnly?: boolean }): Promise<DocPlatformDocument[]> {
  let query = doc.from("documents").select("*").order("updated_at", { ascending: false });

  if (filters?.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters?.activeOnly !== false) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapDocument);
}

export async function getDocumentById(id: string): Promise<DocPlatformDocument | null> {
  const { data, error } = await doc.from("documents").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapDocument(data) : null;
}

/**
 * Uploads the file to Supabase Storage, then creates the document row and
 * its first version (version_number = 1) together. Only team_lead/admin can
 * insert — RLS (documents_insert policy) enforces that; a caller without
 * permission gets a Postgres RLS error back, not a silent no-op.
 */
export async function createDocumentWithFile(input: {
  file: File;
  title: string;
  description?: string;
  categoryId?: string;
  visibilityScope?: DocPlatformVisibilityScope;
  allowedTeamNames?: string[];
  requiresAcknowledgement?: boolean;
  createdBy: string;
}): Promise<DocPlatformDocument> {
  const uploadMetadata = await uploadFileToStorage(input.file, input.createdBy, {});
  if (!uploadMetadata) {
    throw new Error("File upload failed — see logs for the rejected MIME type or size limit.");
  }

  const { data: documentRow, error: documentError } = await doc
    .from("documents")
    .insert({
      title: input.title,
      description: input.description ?? null,
      category_id: input.categoryId ?? null,
      storage_path: uploadMetadata.path,
      file_name: uploadMetadata.fileName,
      file_size_bytes: uploadMetadata.size,
      mime_type: uploadMetadata.mimeType,
      preview_url: uploadMetadata.previewUrl ?? null,
      visibility_scope: input.visibilityScope ?? "team",
      allowed_team_names: input.allowedTeamNames ?? [],
      current_version: 1,
      requires_acknowledgement: input.requiresAcknowledgement ?? false,
      created_by: input.createdBy,
    })
    .select()
    .single();

  if (documentError) throw documentError;

  const { error: versionError } = await doc.from("document_versions").insert({
    document_id: documentRow.id,
    version_number: 1,
    storage_path: uploadMetadata.path,
    file_name: uploadMetadata.fileName,
    file_size_bytes: uploadMetadata.size,
    mime_type: uploadMetadata.mimeType,
    changelog: "Initial upload.",
    created_by: input.createdBy,
  });

  if (versionError) throw versionError;

  return mapDocument(documentRow);
}

/** Uploads a new file as the next version and bumps documents.current_version to match. */
export async function addDocumentVersion(input: {
  documentId: string;
  file: File;
  changelog?: string;
  createdBy: string;
}): Promise<DocumentVersion> {
  const existingVersions = await listDocumentVersions(input.documentId);
  const nextVersionNumber = (existingVersions[0]?.versionNumber ?? 0) + 1;

  const uploadMetadata = await uploadFileToStorage(input.file, input.createdBy, {});
  if (!uploadMetadata) {
    throw new Error("File upload failed — see logs for the rejected MIME type or size limit.");
  }

  const { data: versionRow, error: versionError } = await doc
    .from("document_versions")
    .insert({
      document_id: input.documentId,
      version_number: nextVersionNumber,
      storage_path: uploadMetadata.path,
      file_name: uploadMetadata.fileName,
      file_size_bytes: uploadMetadata.size,
      mime_type: uploadMetadata.mimeType,
      changelog: input.changelog ?? null,
      created_by: input.createdBy,
    })
    .select()
    .single();

  if (versionError) throw versionError;

  const { error: documentError } = await doc
    .from("documents")
    .update({
      current_version: nextVersionNumber,
      storage_path: uploadMetadata.path,
      file_name: uploadMetadata.fileName,
      file_size_bytes: uploadMetadata.size,
      mime_type: uploadMetadata.mimeType,
      updated_by: input.createdBy,
    })
    .eq("id", input.documentId);

  if (documentError) throw documentError;

  return mapVersion(versionRow);
}

export async function listDocumentVersions(documentId: string): Promise<DocumentVersion[]> {
  const { data, error } = await doc
    .from("document_versions")
    .select("*")
    .eq("document_id", documentId)
    .order("version_number", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapVersion);
}

export async function getCurrentDocumentVersionId(documentId: string): Promise<string | null> {
  const { data, error } = await doc
    .from("document_versions")
    .select("id")
    .eq("document_id", documentId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? (data.id as string) : null;
}

export async function setDocumentAllowedRoles(documentId: string, roles: DocPlatformUserRole[]): Promise<void> {
  const { error: deleteError } = await doc.from("document_allowed_roles").delete().eq("document_id", documentId);
  if (deleteError) throw deleteError;

  if (roles.length === 0) return;

  const { error: insertError } = await doc
    .from("document_allowed_roles")
    .insert(roles.map((role) => ({ document_id: documentId, role })));

  if (insertError) throw insertError;
}

export async function setDocumentAssignedUsers(documentId: string, userIds: string[]): Promise<void> {
  const { error: deleteError } = await doc.from("document_assigned_users").delete().eq("document_id", documentId);
  if (deleteError) throw deleteError;

  if (userIds.length === 0) return;

  const { error: insertError } = await doc
    .from("document_assigned_users")
    .insert(userIds.map((userId) => ({ document_id: documentId, user_id: userId })));

  if (insertError) throw insertError;
}

export async function archiveDocument(documentId: string): Promise<void> {
  const { error } = await doc.from("documents").update({ is_active: false }).eq("id", documentId);
  if (error) throw error;
}

// ─── Reads & Acknowledgements ───────────────────────────────────────────────
// Both are scoped to a specific document_version_id, not the parent document —
// "has this user read/acknowledged *this* version" is what a compliance audit
// actually needs, and it survives new versions being uploaded without
// silently carrying old approvals forward.

/** Idempotent — call every time a user opens a version, dedupes on (document_version_id, user_id). */
export async function markDocumentRead(documentVersionId: string, userId: string): Promise<void> {
  const { error } = await doc
    .from("user_document_reads")
    .upsert(
      { document_version_id: documentVersionId, user_id: userId, read_at: new Date().toISOString() },
      { onConflict: "document_version_id,user_id" },
    );

  if (error) throw error;
}

export async function acknowledgeDocument(input: { documentVersionId: string; userId: string; note?: string }): Promise<DocumentAcknowledgement> {
  const { data, error } = await doc
    .from("document_acknowledgements")
    .upsert(
      {
        document_version_id: input.documentVersionId,
        user_id: input.userId,
        acknowledged_at: new Date().toISOString(),
        note: input.note ?? null,
      },
      { onConflict: "document_version_id,user_id" },
    )
    .select()
    .single();

  if (error) throw error;
  return mapAcknowledgement(data);
}

export async function getMyDocumentAcknowledgement(documentVersionId: string, userId: string): Promise<DocumentAcknowledgement | null> {
  const { data, error } = await doc
    .from("document_acknowledgements")
    .select("*")
    .eq("document_version_id", documentVersionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapAcknowledgement(data) : null;
}

/** Admin/doc-owner only per RLS — everyone else's SELECT on this table is restricted to their own row. */
export async function listDocumentAcknowledgements(documentVersionId: string): Promise<DocumentAcknowledgement[]> {
  const { data, error } = await doc
    .from("document_acknowledgements")
    .select("*")
    .eq("document_version_id", documentVersionId)
    .order("acknowledged_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapAcknowledgement);
}

// ─── Resource Categories ────────────────────────────────────────────────────

export async function listResourceCategories(): Promise<ResourceCategory[]> {
  const { data, error } = await doc
    .from("resource_categories")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(mapCategory);
}

export async function createResourceCategory(input: {
  name: string;
  slug?: string;
  sortOrder?: number;
  createdBy: string;
}): Promise<ResourceCategory> {
  const { data, error } = await doc
    .from("resource_categories")
    .insert({
      name: input.name,
      slug: input.slug ?? null,
      sort_order: input.sortOrder ?? 0,
      created_by: input.createdBy,
    })
    .select()
    .single();

  if (error) throw error;
  return mapCategory(data);
}

// ─── Resources ──────────────────────────────────────────────────────────────

export async function listResources(filters?: { categoryId?: string; activeOnly?: boolean }): Promise<DocPlatformResource[]> {
  let query = doc.from("resources").select("*").order("updated_at", { ascending: false });

  if (filters?.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters?.activeOnly !== false) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapResource);
}

export async function createResource(input: {
  title: string;
  description?: string;
  categoryId?: string;
  url: string;
  external?: boolean;
  visibilityScope?: DocPlatformVisibilityScope;
  allowedTeamNames?: string[];
  createdBy: string;
}): Promise<DocPlatformResource> {
  const { data, error } = await doc
    .from("resources")
    .insert({
      title: input.title,
      description: input.description ?? null,
      category_id: input.categoryId ?? null,
      url: input.url,
      external: input.external ?? true,
      visibility_scope: input.visibilityScope ?? "team",
      allowed_team_names: input.allowedTeamNames ?? [],
      created_by: input.createdBy,
    })
    .select()
    .single();

  if (error) throw error;
  return mapResource(data);
}

export async function setResourceAllowedRoles(resourceId: string, roles: DocPlatformUserRole[]): Promise<void> {
  const { error: deleteError } = await doc.from("resource_allowed_roles").delete().eq("resource_id", resourceId);
  if (deleteError) throw deleteError;

  if (roles.length === 0) return;

  const { error: insertError } = await doc
    .from("resource_allowed_roles")
    .insert(roles.map((role) => ({ resource_id: resourceId, role })));

  if (insertError) throw insertError;
}

export async function archiveResource(resourceId: string): Promise<void> {
  const { error } = await doc.from("resources").update({ is_active: false }).eq("id", resourceId);
  if (error) throw error;
}

/** Fire-and-forget style, matching the rest of the app's activity logging — append-only, not deduped. */
export async function logResourceAccess(resourceId: string, userId: string): Promise<void> {
  const { error } = await doc.from("resource_access_logs").insert({ resource_id: resourceId, user_id: userId });
  if (error) logWarning("Failed to log resource access", { resourceId, userId, error });
}
