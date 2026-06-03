import type { NormalizedDocumentSource } from "@/providers/types";

export async function hydrateGoogleDriveMetadata(documentId: string): Promise<NormalizedDocumentSource> {
  return {
    id: documentId,
    provider: "googleDrive",
    sourceType: "google_drive",
    title: `Google Drive document ${documentId}`,
    description: `Hydrated metadata for Google Drive document ${documentId}.`,
    rawUrl: `https://docs.google.com/document/d/${documentId}/edit`,
    mimeType: "application/vnd.google-apps.document",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
