import type { DriveDocumentReference } from "@/core/operon";
import type { NormalizedDocumentSource } from "@/providers/types";
import { hydrateGoogleDriveMetadata } from "./metadata";
import { reconcileDriveDocument, type ReconciliationResult } from "./reconciliation";
import { getCompanyDriveFileMetadata } from "@/services/googleDriveServiceAccount";

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

  let remoteState = null;
  try {
    const file = await getCompanyDriveFileMetadata(reference.driveFileId, [
      "id", "modifiedTime", "trashed", "name", "mimeType",
    ]);
    remoteState = file as {
      id: string;
      modifiedTime: string;
      trashed?: boolean;
      name?: string;
      mimeType?: string;
    };
  } catch {
    // File may have been deleted — reconciliation will handle as "removed"
  }

  const reconciliation = reconcileDriveDocument(reference, remoteState);

  if (reconciliation.action === "removed" || reconciliation.action === "unchanged") {
    return { documentId: reference.id, reconciliation, source: null, syncedAt };
  }

  const source = await hydrateGoogleDriveMetadata(reference.driveFileId, accessToken);
  return { documentId: reference.id, reconciliation, source, syncedAt };
}