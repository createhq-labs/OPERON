import "server-only";
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  determineParserType,
  extractDriveExportPayload,
  getValidAccessToken,
  findDriveAccounts,
  isGoogleDriveAuthConfigured,
  mapGooglePermissions,
} from "@/services/googleDriveClient";
import { enqueueIngestionJob, startIngestionWorker } from "@/services/ingestion";
import { saveDriveDocumentReference, saveActivity } from "@/services/api";
import type { DriveDocumentReference, DeptId, DocTag } from "@/core/operon";

// ---------------------------------------------------------------------------
// Supabase admin client (server-side only — never exposed to the browser)
// ---------------------------------------------------------------------------

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

/**
 * Resolves the calling user's active Drive account.
 * Returns null when Google Drive auth is not configured (local-fallback mode)
 * or when the user has no connected account.
 */
async function resolveDriveAccount(userId: string) {
  if (!isGoogleDriveAuthConfigured()) return null;
  const accounts = await findDriveAccounts(userId);
  return accounts.find((a) => a.active) ?? accounts[0] ?? null;
}

// ---------------------------------------------------------------------------
// POST /api/drive/upload
// ---------------------------------------------------------------------------

/**
 * Upload a file to Google Drive, persist document metadata to Supabase,
 * and enqueue an ingestion job so the document becomes searchable.
 *
 * Expected multipart/form-data fields:
 *   file        — the binary file
 *   userId      — Operon user ID (legacy_id or auth_user_id)
 *   roleId      — target RBAC role / Drive folder (e.g. "role_hr")
 *   title       — display title stored in Supabase
 *   description — optional description
 *   tag         — document category tag
 *   departmentId — legacy department ID
 *   visibilityScope — "global" | "department" | "private"
 *   allowedRoleIds  — JSON-encoded string[]
 *   allowedUserTypes — JSON-encoded string[]
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const formData = await request.formData();

    // -- Validate required fields -------------------------------------------
    const file = formData.get("file") as File | null;
    const userId = formData.get("userId") as string | null;
    const roleId = formData.get("roleId") as string | null;
    const title = formData.get("title") as string | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      );
    }
    if (!userId || !roleId || !title) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: userId, roleId, title" },
        { status: 400 }
      );
    }

    // -- Optional fields -----------------------------------------------------
    const description =
      (formData.get("description") as string | null) ?? "";
    const tag = (formData.get("tag") as string | null) ?? "general";
    const departmentId =
      (formData.get("departmentId") as string | null) ?? undefined;
    const visibilityScope =
      (formData.get("visibilityScope") as string | null) ?? "department";
    const allowedRoleIds: string[] = safeParseJson(
      formData.get("allowedRoleIds"),
      [roleId]
    );
    const allowedUserTypes: string[] = safeParseJson(
      formData.get("allowedUserTypes"),
      []
    );

    // -- Drive upload --------------------------------------------------------
    const now = new Date().toISOString();
    const localMode = !isGoogleDriveAuthConfigured();
    const account = localMode ? null : await resolveDriveAccount(userId);

    if (!localMode && !account) {
      return NextResponse.json(
        { success: false, error: "No connected Drive account found" },
        { status: 401 }
      );
    }

    let driveFileId: string;
    let driveWebViewLink: string;
    let fileMimeType = file.type;
    let fileBytes: Buffer;
    let uploadedFileName = file.name;

    if (localMode || !account) {
      // Local-fallback: store the file in Supabase Storage instead of Drive.
      fileBytes = Buffer.from(await file.arrayBuffer());
      const storagePath = `documents/${userId}/${generateId("upload")}-${file.name}`;
      const { error: storageError } = await supabase.storage
        .from("documents")
        .upload(storagePath, fileBytes, { contentType: file.type, upsert: false });

      if (storageError) {
        throw new Error(`Storage upload failed: ${storageError.message}`);
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("documents").getPublicUrl(storagePath);

      driveFileId = storagePath;
      driveWebViewLink = publicUrl;
    } else {
      // Live Drive upload via the Drive API.
      const accessToken = await getValidAccessToken(account);
      fileBytes = Buffer.from(await file.arrayBuffer());

      const uploadMetadata = {
        name: file.name,
        description,
        appProperties: { operon: "true", uploadedBy: userId, roleId },
      };

      const uploaded = await uploadFileToDrive(
        accessToken,
        file.name,
        file.type,
        fileBytes,
        roleId,
        uploadMetadata
      );

      driveFileId = uploaded.id;
      driveWebViewLink = uploaded.webViewLink ?? "";
      fileMimeType = uploaded.mimeType ?? file.type;
      uploadedFileName = uploaded.name ?? file.name;
    }

    // -- Persist metadata to Supabase documents table -----------------------
    const legacyId = generateId("doc");

    const { data: document, error: dbError } = await supabase
      .from("documents")
      .insert({
        legacy_id: legacyId,
        title,
        description,
        dept: departmentId ?? null,
        department_legacy_id: departmentId ?? null,
        tag,
        allowed_role_ids: allowedRoleIds,
        allowed_user_types: allowedUserTypes,
        visibility_scope: visibilityScope,
        source: localMode ? "local_upload" : "google_drive",
        source_provider: localMode ? "localUpload" : "googleDrive",
        raw_source_url: driveWebViewLink,
        mime_type: fileMimeType,
        storage_size: file.size,
        uploaded_by: userId,
        author_legacy_id: userId,
        author: userId,
        created_by_id: userId,
        updated_by_id: userId,
        parser_status: "pending",
        parser_version: "1.0",
        lifecycle_state: "uploaded",
        version: "v1.0",
        pinned: false,
        updated_at: now,
      })
      .select()
      .single();

    if (dbError || !document) {
      throw new Error(
        `Failed to persist document metadata: ${dbError?.message ?? "unknown error"}`
      );
    }

    // -- Register as a DriveDocumentReference (in-memory store) -------------
    const permissions = localMode
      ? []
      : mapGooglePermissions([]);

    const driveRef: DriveDocumentReference = {
      id: legacyId,
      title,
      description,
      departmentId: (departmentId ?? "operations") as DeptId,
      dept: departmentId ?? "",
      tag: tag as DocTag,
      allowedRoleIds,
      allowedUserTypes: allowedUserTypes as import("@/core/types").UserType[],
      allowedTeamIds: [],
      visibilityScope: visibilityScope as DriveDocumentReference["visibilityScope"],
      globalPinned: false,
      mandatoryRead: false,
      broadcastAudience: "none",
      broadcastRoleIds: [],
      broadcastDepartmentIds: [],
      readTime: estimateReadTime(file.size),
      authorId: userId,
      author: userId,
      createdById: userId,
      updatedAt: now,
      updatedById: userId,
      version: "v1.0",
      pinned: false,
      source: localMode ? "local_drive" : "google_drive",
      sourceProvider: localMode ? "localDrive" : "googleDrive",
      lifecycleState: "uploaded",
      driveFileId,
      googleDocId: driveFileId,
      webViewLink: driveWebViewLink,
      fileMimeType,
      ownerEmail: "",
      folderId: roleId,
      folderName: roleId,
      linkedDocumentId: undefined,
      uploadedBy: userId,
      driveUrl: driveWebViewLink,
      permissionSummary: permissions,
      syncStatus: "pending",
      lastSyncedAt: now,
      lastDriveModifiedAt: now,
      lastDriveCreatedAt: now,
      extractedText: undefined,
      parsedBlocks: [],
      parserStatus: "pending",
      parserVersion: "1.0",
    };

    saveDriveDocumentReference(driveRef);

    // -- Enqueue ingestion ---------------------------------------------------
    if (localMode) {
      enqueueIngestionJob({
        documentId: legacyId,
        sourceType: "localUpload",
        parserType: determineParserType(fileMimeType),
        sourceUrl: driveWebViewLink,
        fileName: uploadedFileName,
        mimeType: fileMimeType,
        metadata: { departmentId: departmentId ?? "", tags: [tag], authorId: userId },
        file,
      });
      startIngestionWorker();
    } else {
      const parserType = determineParserType(fileMimeType);
      const rawPayload = await extractDriveExportPayload(
        await getValidAccessToken(account!),
        driveFileId,
        { id: driveFileId, mimeType: fileMimeType, name: uploadedFileName }
      );
      enqueueIngestionJob({
        documentId: legacyId,
        sourceType: "googleDrive",
        parserType,
        sourceUrl: driveWebViewLink,
        fileName: uploadedFileName,
        mimeType: fileMimeType,
        metadata: { departmentId: departmentId ?? "", tags: [tag], authorId: userId },
        rawPayload,
      });
      startIngestionWorker();
    }

    // -- Activity log --------------------------------------------------------
    await saveActivity({
      id: generateId("activity"),
      userId,
      action: "DOCUMENT_CREATED",
      targetType: "document",
      targetId: legacyId,
      timestamp: now,
      metadata: {
        title,
        mimeType: fileMimeType,
        source: localMode ? "local_upload" : "google_drive",
      },
    });

    return NextResponse.json(
      {
        success: true,
        document: {
          id: legacyId,
          title,
          driveFileId,
          driveUrl: driveWebViewLink,
          syncStatus: "pending",
        },
      },
      { status: 201 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Upload failed";
    console.error("[drive/upload] Error:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// Internal utilities
// ---------------------------------------------------------------------------

function safeParseJson<T>(value: FormDataEntryValue | null, fallback: T): T {
  if (!value || typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Returns a human-readable estimate of reading time based on file size. */
function estimateReadTime(bytes: number): string {
  // Rough proxy: average document density ~2 000 words per 10 KB.
  const words = (bytes / 10_000) * 2_000;
  const minutes = Math.max(1, Math.round(words / 200));
  return `${minutes} min`;
}

/**
 * Uploads a file to Google Drive using the multipart upload API.
 * Returns the Drive file metadata object.
 */
async function uploadFileToDrive(
  accessToken: string,
  name: string,
  mimeType: string,
  data: Buffer,
  folderId: string,
  metadata: Record<string, unknown>
): Promise<{ id: string; webViewLink?: string; mimeType?: string; name?: string }> {
  const boundary = `operon-${crypto.randomUUID()}`;
  const metadataJson = JSON.stringify({ name, parents: [folderId], ...metadata });

  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadataJson}\r\n`
    ),
    Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    data,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink&supportsAllDrives=true",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": String(body.length),
      },
      body,
    }
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    throw new Error(`Drive upload failed (${response.status}): ${detail}`);
  }

  return response.json() as Promise<{
    id: string;
    webViewLink?: string;
    mimeType?: string;
    name?: string;
  }>;
}
