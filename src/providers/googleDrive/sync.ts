import type { NormalizedDocumentSource } from "@/providers/types";

export async function syncGoogleDriveDocument(source: NormalizedDocumentSource) {
  return {
    ...source,
    syncedAt: new Date().toISOString(),
    syncStatus: "synced",
  };
}
