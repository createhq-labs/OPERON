/**
 * Automatic Google Drive Sync Service
 * 
 * Syncs all file uploads to company Google Drive backend automatically.
 * No user interaction required - Drive access is completely hidden from users.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  uploadFileToCompanyDrive,
  replaceFileInCompanyDrive,
  getCompanyDriveFileMetadata,
  isServiceAccountConfigured,
} from "@/services/googleDriveServiceAccount";

export interface DriveUploadTask {
  fileName: string;
  mimeType: string;
  fileContent: Buffer;
  documentId?: string; // Operon document ID for tracking
  replaceFileId?: string; // If updating existing file
  description?: string;
}

export interface DriveUploadResult {
  success: boolean;
  driveFileId?: string;
  driveWebLink?: string;
  version?: number;
  error?: string;
  timestamp: Date;
}

/**
 * Upload file to company Google Drive and link it to Operon document
 */
export async function uploadToDriveAndLink(
  task: DriveUploadTask
): Promise<DriveUploadResult> {
  const timestamp = new Date();

  try {
    // Check if service account is configured
    if (!isServiceAccountConfigured()) {
      return {
        success: false,
        error: "Google Drive service account not configured",
        timestamp,
      };
    }

    let driveFileId: string;
    let driveWebLink: string;
    let version = 1;

    if (task.replaceFileId) {
      // Replace existing file (versioning)
      const result = await replaceFileInCompanyDrive(
        task.replaceFileId,
        task.mimeType,
        task.fileContent
      );
      driveFileId = result.fileId;
      version = result.version;

      // Get updated metadata to get web link
      const metadata = await getCompanyDriveFileMetadata(driveFileId, [
        "id",
        "webViewLink",
      ]);
      driveWebLink = (metadata.webViewLink as string) || "";
    } else {
      // Upload new file
      const uploadResult = await uploadFileToCompanyDrive(
        task.fileName,
        task.mimeType,
        task.fileContent,
        {
          description: task.description || `Uploaded via Operon`,
        }
      );

      driveFileId = uploadResult.fileId;
      driveWebLink = uploadResult.webViewLink;
    }

    // Link Drive file to Operon document in database
    if (task.documentId && supabaseAdmin) {
      await supabaseAdmin
        .from("documents")
        .update({
          google_drive_file_id: driveFileId,
          google_drive_web_link: driveWebLink,
          drive_sync_status: "synced",
          drive_synced_at: timestamp.toISOString(),
        })
        .eq("id", task.documentId);
    }

    return {
      success: true,
      driveFileId,
      driveWebLink,
      version,
      timestamp,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Log sync failure
    if (task.documentId && supabaseAdmin) {
      try {
        await supabaseAdmin
          .from("documents")
          .update({
            drive_sync_status: "failed",
            drive_sync_error: errorMsg,
            drive_last_error_at: timestamp.toISOString(),
          })
          .eq("id", task.documentId);
      } catch {
        // Ignore log failure
      }
    }

    return {
      success: false,
      error: errorMsg,
      timestamp,
    };
  }
}

/**
 * Handle file upload from user
 * Automatically syncs to Drive in background
 */
export async function handleUserFileUpload(
  file: {
    fileName: string;
    mimeType: string;
    content: Buffer;
    size: number;
  },
  metadata: {
    userId?: string;
    department?: string;
    tags?: string[];
    description?: string;
  }
): Promise<{
  documentId: string;
  fileName: string;
  uploadedAt: Date;
  driveSync: DriveUploadResult;
}> {
  const uploadedAt = new Date();

  if (!supabaseAdmin) {
    throw new Error("Supabase admin client not initialized");
  }

  // Create document record first (before Drive sync)
  const { data: document, error: createError } = await supabaseAdmin
    .from("documents")
    .insert({
      title: file.fileName,
      description: metadata.description,
      mime_type: file.mimeType,
      size: file.size,
      upload_status: "completed",
      uploaded_at: uploadedAt.toISOString(),
      uploaded_by: metadata.userId,
      department: metadata.department,
      tags: metadata.tags,
      drive_sync_status: "pending", // Will be updated after Drive upload
    })
    .select("id")
    .single();

  if (createError || !document) {
    throw new Error(`Failed to create document record: ${createError?.message}`);
  }

  // Trigger Drive sync (can be async, doesn't block user)
  const driveSync = await uploadToDriveAndLink({
    fileName: file.fileName,
    mimeType: file.mimeType,
    fileContent: file.content,
    documentId: document.id,
    description: metadata.description,
  });

  return {
    documentId: document.id,
    fileName: file.fileName,
    uploadedAt,
    driveSync,
  };
}

/**
 * Replace file with new version
 * User replaced document in Operon - sync new version to Drive
 */
export async function replaceDocumentVersion(
  documentId: string,
  newFile: {
    fileName: string;
    mimeType: string;
    content: Buffer;
  },
  _userId?: string
): Promise<DriveUploadResult> {
  if (!supabaseAdmin) {
    return {
      success: false,
      error: "Supabase admin client not initialized",
      timestamp: new Date(),
    };
  }

  // Get existing document to find Drive file ID
  const { data: doc, error: fetchError } = await supabaseAdmin
    .from("documents")
    .select("google_drive_file_id, title")
    .eq("id", documentId)
    .single();

  if (fetchError || !doc) {
    return {
      success: false,
      error: `Document not found: ${fetchError?.message}`,
      timestamp: new Date(),
    };
  }

  if (!doc.google_drive_file_id) {
    // No Drive file yet - do full upload
    return uploadToDriveAndLink({
      fileName: newFile.fileName,
      mimeType: newFile.mimeType,
      fileContent: newFile.content,
      documentId,
      description: `Version updated by user`,
    });
  }

  // Replace existing Drive file
  return uploadToDriveAndLink({
    fileName: newFile.fileName,
    mimeType: newFile.mimeType,
    fileContent: newFile.content,
    documentId,
    replaceFileId: doc.google_drive_file_id,
    description: `Version updated by user`,
  });
}

/**
 * Batch sync - use for background job to sync old documents
 * Useful for migrating existing documents to Drive
 */
export async function batchSyncDocumentsToDrive(
  limit: number = 50,
  onlyUnsynced: boolean = true
): Promise<{
  processed: number;
  successful: number;
  failed: number;
  errors: Array<{ documentId: string; error: string }>;
}> {
  // Check if service account is configured
  if (!isServiceAccountConfigured()) {
    return {
      processed: 0,
      successful: 0,
      failed: 0,
      errors: [{ documentId: "", error: "Service account not configured" }],
    };
  }

  if (!supabaseAdmin) {
    return {
      processed: 0,
      successful: 0,
      failed: 0,
      errors: [{ documentId: "", error: "Supabase admin client not initialized" }],
    };
  }

  // Get documents to sync
  let query = supabaseAdmin.from("documents").select("id, title, mime_type, storage_path");

  if (onlyUnsynced) {
    query = query.is("google_drive_file_id", null);
  }

  const { data: docs, error } = await query.limit(limit);

  if (error || !docs) {
    return {
      processed: 0,
      successful: 0,
      failed: 1,
      errors: [{ documentId: "", error: error?.message || "Failed to fetch documents" }],
    };
  }

  const results = {
    processed: docs.length,
    successful: 0,
    failed: 0,
    errors: [] as Array<{ documentId: string; error: string }>,
  };

  for (const doc of docs) {
    try {
      // Fetch raw file bytes from Supabase storage using the document's storage path.
      const storagePath: string | null =
        (doc as Record<string, unknown>).storage_path as string | null ?? null;

      if (!storagePath) {
        results.failed++;
        results.errors.push({
          documentId: doc.id,
          error: "No storage_path — document was never uploaded to Supabase storage.",
        });
        continue;
      }

      const { data: fileData, error: downloadError } = await supabaseAdmin
        .storage
        .from("documents")
        .download(storagePath);

      if (downloadError || !fileData) {
        results.failed++;
        results.errors.push({
          documentId: doc.id,
          error: downloadError?.message ?? "Failed to download file from storage.",
        });
        continue;
      }

      const arrayBuffer = await fileData.arrayBuffer();
      const fileContent = Buffer.from(arrayBuffer);

      const result = await uploadToDriveAndLink({
        fileName: (doc as Record<string, unknown>).title as string ?? doc.id,
        mimeType: (doc as Record<string, unknown>).mime_type as string ?? "application/octet-stream",
        fileContent,
        documentId: doc.id,
      });

      if (result.success) {
        results.successful++;
      } else {
        results.failed++;
        results.errors.push({
          documentId: doc.id,
          error: result.error ?? "Unknown sync error.",
        });
      }
    } catch (error) {
      results.failed++;
      results.errors.push({
        documentId: doc.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

/**
 * Check Drive sync status of document
 */
export async function checkDocumentDriveStatus(
  documentId: string
): Promise<{
  documentId: string;
  driveFileId: string | null;
  syncStatus: "pending" | "synced" | "failed" | null;
  lastSyncedAt: Date | null;
  error: string | null;
}> {
  if (!supabaseAdmin) {
    return {
      documentId,
      driveFileId: null,
      syncStatus: null,
      lastSyncedAt: null,
      error: "Supabase admin client not initialized",
    };
  }

  const { data: doc, error } = await supabaseAdmin
    .from("documents")
    .select(
      "google_drive_file_id, drive_sync_status, drive_synced_at, drive_sync_error"
    )
    .eq("id", documentId)
    .single();

  if (error || !doc) {
    return {
      documentId,
      driveFileId: null,
      syncStatus: null,
      lastSyncedAt: null,
      error: error?.message || "Document not found",
    };
  }

  return {
    documentId,
    driveFileId: doc.google_drive_file_id,
    syncStatus: doc.drive_sync_status,
    lastSyncedAt: doc.drive_synced_at ? new Date(doc.drive_synced_at) : null,
    error: doc.drive_sync_error,
  };
}