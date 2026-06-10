import type { DriveDocumentReference } from "@/core/operon";

export interface RemoteDriveFileState {
  id: string;
  modifiedTime: string;
  trashed?: boolean;
  name?: string;
  mimeType?: string;
}

export interface ReconciliationResult {
  documentId: string;
  action: "created" | "updated" | "removed" | "unchanged";
  remoteModifiedAt: string | null;
  previousModifiedAt: string | null;
}

export function reconcileDriveDocument(
  reference: DriveDocumentReference,
  remoteState: RemoteDriveFileState | null
): ReconciliationResult {
  if (!remoteState || remoteState.trashed) {
    return {
      documentId: reference.id,
      action: "removed",
      remoteModifiedAt: null,
      previousModifiedAt: reference.lastDriveModifiedAt ?? null,
    };
  }

  const previousModifiedAt = reference.lastDriveModifiedAt ?? null;
  const remoteModifiedAt = remoteState.modifiedTime;
  const isNew = !previousModifiedAt;
  const isChanged = !isNew && remoteModifiedAt !== previousModifiedAt;

  return {
    documentId: reference.id,
    action: isNew ? "created" : isChanged ? "updated" : "unchanged",
    remoteModifiedAt,
    previousModifiedAt,
  };
}