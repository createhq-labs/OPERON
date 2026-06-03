import type { NormalizedDocumentSource } from "@/providers/types";
import { authorizeGoogleDriveProvider } from "./auth";
import { hydrateGoogleDriveMetadata } from "./metadata";
import { handleGoogleDriveWebhook } from "./webhook";
import { syncGoogleDriveDocument } from "./sync";

export async function fetchGoogleDriveSource(documentId: string): Promise<NormalizedDocumentSource> {
  return {
    id: documentId,
    provider: "googleDrive",
    sourceType: "google_drive",
    title: `Drive document ${documentId}`,
    description: "Google Drive document metadata is available for preview and status tracking.",
    rawUrl: `https://docs.google.com/document/d/${documentId}/edit`,
    mimeType: "application/vnd.google-apps.document",
    createdAt: new Date().toISOString(),
  };
}

export { authorizeGoogleDriveProvider, hydrateGoogleDriveMetadata, handleGoogleDriveWebhook, syncGoogleDriveDocument };
