import type { NormalizedDocumentSource } from "@/providers/types";
import {
  fetchDriveFileMetadata,
  mapGooglePermissions,
} from "@/services/googleDriveClient";

/**
 * Fetches live metadata for a Google Drive file and normalises it into
 * the provider-agnostic NormalizedDocumentSource shape.
 *
 * @param documentId  The Google Drive file ID.
 * @param accessToken A valid OAuth or service-account access token.
 */
export async function hydrateGoogleDriveMetadata(
  documentId: string,
  accessToken: string
): Promise<NormalizedDocumentSource> {
  const file = await fetchDriveFileMetadata(accessToken, documentId);

  return {
    id: file.id,
    sourceType: "google_drive",
    title: file.name,
    description: file.description ?? "",
    rawUrl: file.webViewLink ?? "",
    mimeType: file.mimeType,
    driveFileId: file.id,
    driveModifiedAt: file.modifiedTime,
    permissionSummary: mapGooglePermissions(
      file.permissions as Array<{ role?: string; emailAddress?: string; domain?: string }> | undefined
    ),
  };
}