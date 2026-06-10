import type { DriveDocumentReference } from "@/core/operon";
import type { NormalizedDocumentSource } from "@/providers/types";
import { hydrateGoogleDriveMetadata } from "./metadata";
import { reconcileDriveDocument, type ReconciliationResult } from "./reconciliation";
import { getGoogleDriveClient } from "@/services/googleDriveClient";

export interface SyncResult {
  documentId: string;
  reconciliation: ReconciliationResult;
  source: NormalizedDocumentSource | null;
  syncedAt: string;
}

export async function syncGoogleDriveDocument(
  reference: DriveDocumentReference,
  accessToken: string
): Promise<SyncResult> {
  const syncedAt = new Date().toISOString();
  const client = getGoogleDriveClient(accessToken);

  let remoteState = null;
  try {
    const file = await client.files.get({
      fileId: reference.driveFileId,
      fields: "id,modifiedTime,trashed,name,mimeType",
    });
    remoteState = file.data as { id: string; modifiedTime: string; trashed?: boolean; name?: string; mimeType?: string };
  } catch {
    // File may have been deleted from Drive — reconciliation will handle as "removed"
  }

  const reconciliation = reconcileDriveDocument(reference, remoteState);

  if (reconciliation.action === "removed") {
    return { documentId: reference.id, reconciliation, source: null, syncedAt };
  }

  if (reconciliation.action === "unchanged") {
    return {
      documentId: reference.id,
      reconciliation,
      source: null,
      syncedAt,
    };
  }

  const source = await hydrateGoogleDriveMetadata(reference.driveFileId, accessToken);
  return { documentId: reference.id, reconciliation, source, syncedAt };
}