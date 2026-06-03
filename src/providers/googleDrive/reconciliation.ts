import type { DriveDocumentReference } from "@/core/operon";

export interface ReconciliationResult {
  id: string;
  action: "updated" | "created" | "ignored" | "removed";
  documentId: string;
  metadata?: Record<string, unknown>;
}

export function reconcileDriveDocument(reference: DriveDocumentReference, remoteState: any): ReconciliationResult {
  const remoteModifiedAt = remoteState?.modifiedTime;
  const changed = remoteModifiedAt && remoteModifiedAt !== reference.lastDriveModifiedAt;
  const action = !remoteState ? "ignored" : changed ? "updated" : "ignored";

  return {
    id: `reconcile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    action,
    documentId: reference.id,
    metadata: {
      remoteModifiedAt,
      previousModifiedAt: reference.lastDriveModifiedAt,
      changed: Boolean(changed),
    },
  };
}
