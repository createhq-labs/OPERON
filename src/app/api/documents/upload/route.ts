import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveRequestUser } from "@/app/api/documents/identity";
import { canUploadDocument, canPublishGlobally } from "@/security/permissions";
import {
  resolveCategoryFolderId,
  uploadFileToCompanyDrive,
  deleteFileFromCompanyDrive,
  isServiceAccountConfigured,
} from "@/services/googleDriveServiceAccount";
import { sanitizeFileName, isAllowedUploadMimeType, MAX_UPLOAD_SIZE_BYTES } from "@/services/storage";
import { resolveCategoryId, resolveCategoryTag } from "@/app/api/documents/categories";
import { writeAllowedRoles, writeHomeDepartment, fetchRoleNames } from "@/app/api/documents/joins";
import { documentRowToDocument, toWorkforceVisibilityScope, type DocumentRow } from "../mapping";
import type { SchemaDb } from "@/app/api/documents/db";
import type { Document, DocTag, VisibilityScope } from "@/core/types";

// Uploads to the central Drive folder via a service account and requires
// Buffer/crypto — not edge-compatible.
export const runtime = "nodejs";

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function parseJsonArray(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function estimateReadTime(bytes: number): string {
  const words = (bytes / 10_000) * 2_000;
  const minutes = Math.max(1, Math.round(words / 200));
  return `${minutes} min`;
}

async function performDriveUpload(file: File, mimeType: string, safeName: string, tag: DocTag) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const folderId = await resolveCategoryFolderId(tag);
  return uploadFileToCompanyDrive(safeName, mimeType, buffer, { parentFolderId: folderId });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!supabaseAdmin) {
    return errorResponse("Server is not configured for document uploads.", 503);
  }

  const user = await resolveRequestUser(request);
  if (!user) {
    return errorResponse("Unauthorized: sign in required.", 401);
  }
  if (!canUploadDocument(user)) {
    return errorResponse("Your role does not have permission to upload documents.", 403);
  }
  if (!isServiceAccountConfigured()) {
    return errorResponse("Central Drive storage is not configured. Contact an administrator.", 503);
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return errorResponse("Malformed upload request.", 400);
  }

  const file = formData.get("file");
  const existingDocumentId = (formData.get("existingDocumentId") as string | null) || null;

  if (!(file instanceof File)) {
    return errorResponse("No file provided.", 400);
  }
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return errorResponse("File exceeds the maximum allowed upload size.", 400);
  }
  const mimeType = file.type || "application/octet-stream";
  if (!isAllowedUploadMimeType(mimeType)) {
    return errorResponse("Unsupported file type.", 400);
  }
  const safeName = sanitizeFileName(file.name || "upload-file");
  const db = supabaseAdmin.schema("workforce");
  const globalDb = supabaseAdmin.schema("global");

  if (existingDocumentId) {
    return handleNewVersion(db, globalDb, user.id, existingDocumentId, file, mimeType, safeName);
  }

  const title = (formData.get("title") as string | null)?.trim();
  if (!title) {
    return errorResponse("Document title is required.", 400);
  }

  const tag = (formData.get("tag") as DocTag | null) ?? "internal";
  const allowedRoleIds = parseJsonArray(formData.get("allowedRoleIds"));
  if (allowedRoleIds.length === 0) {
    return errorResponse("Document upload requires at least one allowed role.", 400);
  }
  const description = ((formData.get("description") as string | null) ?? "").trim();
  const departmentId = (formData.get("departmentId") as string | null) ?? undefined;
  const visibilityScope = (formData.get("visibilityScope") as VisibilityScope | null) ?? "department";

  if (visibilityScope === "global" && !canPublishGlobally(user)) {
    return errorResponse("You are not authorized to publish documents globally.", 403);
  }

  let uploaded: { fileId: string; webViewLink: string };
  try {
    uploaded = await performDriveUpload(file, mimeType, safeName, tag);
  } catch (err) {
    return errorResponse(
      `Central Drive storage is unavailable: ${err instanceof Error ? err.message : "upload failed"}`,
      502
    );
  }

  try {
    const categoryId = await resolveCategoryId(db, tag);

    const { data: inserted, error: insertError } = await db
      .from("documents")
      .insert({
        title,
        description,
        category_id: categoryId,
        storage_path: uploaded.fileId,
        preview_url: uploaded.webViewLink,
        file_name: safeName,
        mime_type: mimeType,
        file_size_bytes: file.size,
        visibility_scope: toWorkforceVisibilityScope(visibilityScope),
        current_version: 1,
        created_by: user.id,
      })
      .select("*")
      .single<DocumentRow>();

    if (insertError || !inserted) {
      throw new Error(insertError?.message ?? "Failed to create document record.");
    }

    const { data: versionRow, error: versionError } = await db
      .from("document_versions")
      .insert({
        document_id: inserted.id,
        version_number: 1,
        storage_path: uploaded.fileId,
        file_name: safeName,
        mime_type: mimeType,
        file_size_bytes: file.size,
        created_by: user.id,
      })
      .select("id")
      .single<{ id: string }>();

    if (versionError || !versionRow) {
      throw new Error(versionError?.message ?? "Failed to create document version.");
    }

    await Promise.all([
      writeAllowedRoles(db, inserted.id, allowedRoleIds),
      writeHomeDepartment(db, inserted.id, departmentId),
    ]);

    const roleNames = await fetchRoleNames(globalDb, allowedRoleIds);
    const document: Document = documentRowToDocument(inserted, {
      currentVersionId: versionRow.id,
      tag,
      departmentId,
      allowedRoleNames: allowedRoleIds.map((id) => roleNames.get(id) ?? id),
      readTime: estimateReadTime(file.size),
    });

    return NextResponse.json({ success: true, document }, { status: 201 });
  } catch (err) {
    // The Drive file was uploaded but the database write failed — clean up
    // rather than leaving an orphaned file with no app record.
    await deleteFileFromCompanyDrive(uploaded.fileId).catch(() => undefined);
    return errorResponse(
      `Failed to save document: ${err instanceof Error ? err.message : "unknown error"}`,
      500
    );
  }
}

async function handleNewVersion(
  db: SchemaDb,
  globalDb: SchemaDb,
  userId: string,
  documentId: string,
  file: File,
  mimeType: string,
  safeName: string
): Promise<NextResponse> {
  const { data: doc, error: docError } = await db
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .single<DocumentRow>();

  if (docError || !doc) {
    return errorResponse("Document not found.", 404);
  }

  const tag = await resolveCategoryTag(db, doc.category_id);

  let uploaded: { fileId: string; webViewLink: string };
  try {
    uploaded = await performDriveUpload(file, mimeType, safeName, tag);
  } catch (err) {
    return errorResponse(
      `Central Drive storage is unavailable: ${err instanceof Error ? err.message : "upload failed"}`,
      502
    );
  }

  const nextVersion = doc.current_version + 1;

  try {
    const { data: versionRow, error: versionError } = await db
      .from("document_versions")
      .insert({
        document_id: documentId,
        version_number: nextVersion,
        storage_path: uploaded.fileId,
        file_name: safeName,
        mime_type: mimeType,
        file_size_bytes: file.size,
        created_by: userId,
      })
      .select("id")
      .single<{ id: string }>();

    if (versionError || !versionRow) {
      throw new Error(versionError?.message ?? "Failed to create document version.");
    }

    const now = new Date().toISOString();
    const { data: updatedDoc, error: updateError } = await db
      .from("documents")
      .update({
        current_version: nextVersion,
        storage_path: uploaded.fileId,
        preview_url: uploaded.webViewLink,
        file_name: safeName,
        mime_type: mimeType,
        file_size_bytes: file.size,
        updated_at: now,
        updated_by: userId,
      })
      .eq("id", documentId)
      .select("*")
      .single<DocumentRow>();

    if (updateError || !updatedDoc) {
      throw new Error(updateError?.message ?? "Failed to update document.");
    }

    const [roleIds, departmentId] = await Promise.all([
      db.from("document_allowed_roles").select("role_id").eq("document_id", documentId).returns<Array<{ role_id: string }>>(),
      db.from("document_allowed_departments").select("department_id").eq("document_id", documentId).maybeSingle<{ department_id: string }>(),
    ]);
    const allowedRoleIds = (roleIds.data ?? []).map((r) => r.role_id);
    const roleNames = await fetchRoleNames(globalDb, allowedRoleIds);

    const document: Document = documentRowToDocument(updatedDoc, {
      currentVersionId: versionRow.id,
      tag,
      departmentId: departmentId.data?.department_id,
      allowedRoleNames: allowedRoleIds.map((id) => roleNames.get(id) ?? id),
      readTime: estimateReadTime(file.size),
    });

    return NextResponse.json({ success: true, document }, { status: 200 });
  } catch (err) {
    await deleteFileFromCompanyDrive(uploaded.fileId).catch(() => undefined);
    return errorResponse(
      `Failed to save new version: ${err instanceof Error ? err.message : "unknown error"}`,
      500
    );
  }
}
