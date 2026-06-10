import type { NormalizedDocumentSource } from "@/providers/types";
import { getGoogleDriveClient } from "@/services/googleDriveClient";

export async function hydrateGoogleDriveMetadata(documentId: string, accessToken: string): Promise<NormalizedDocumentSource> {
  const client = getGoogleDriveClient(accessToken);
  const file = await client.files.get({
    fileId: documentId,
    fields: "id,name,description,mimeType,createdTime,modifiedTime,webViewLink,size,owners",
  });

  const { id, name, description, mimeType, createdTime, modifiedTime, webViewLink } = file.data;

  return {
    id: (id as string | undefined) ?? documentId,
    provider: "googleDrive",
    sourceType: "google_drive",
    title: (name as string | undefined) ?? "Untitled",
    description: (description as string | undefined) ?? "",
    rawUrl: (webViewLink as string | undefined) ?? `https://drive.google.com/file/d/${documentId}/view`,
    mimeType: (mimeType as string | undefined) ?? "application/octet-stream",
    createdAt: (createdTime as string | undefined) ?? new Date().toISOString(),
    updatedAt: (modifiedTime as string | undefined) ?? new Date().toISOString(),
  };
}