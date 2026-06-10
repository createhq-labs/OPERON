import type { NormalizedDocumentSource } from "@/providers/types";
import { hydrateGoogleDriveMetadata } from "./metadata";

export type GoogleDriveWebhookEventType =
  | "content_changed"
  | "permissions_changed"
  | "deleted"
  | "created"
  | "renamed"
  | "moved";

export interface GoogleDriveWebhookEvent {
  documentId: string;
  eventType: GoogleDriveWebhookEventType;
  timestamp: string;
  /** Optional access token for fetching fresh metadata from the Drive API. */
  accessToken?: string;
  payload?: {
    name?: string;
    mimeType?: string;
    webViewLink?: string;
    modifiedTime?: string;
    [key: string]: unknown;
  };
}

export interface WebhookHandlerResult {
  documentId: string;
  eventType: GoogleDriveWebhookEventType;
  action: "sync" | "remove" | "ignore";
  source: NormalizedDocumentSource | null;
}

export async function handleGoogleDriveWebhook(
  event: GoogleDriveWebhookEvent
): Promise<WebhookHandlerResult> {
  if (!event?.documentId) {
    throw new Error("Drive webhook received without a documentId.");
  }

  const { documentId, eventType, timestamp, payload, accessToken } = event;

  if (eventType === "deleted") {
    return {
      documentId,
      eventType,
      action: "remove",
      source: null,
    };
  }

  if (eventType === "permissions_changed") {
    return {
      documentId,
      eventType,
      action: "ignore",
      source: null,
    };
  }

  // For content_changed, created, renamed, moved — hydrate fresh metadata from Drive
  let source: NormalizedDocumentSource;
  try {
    if (!accessToken) {
      throw new Error("No access token available for Drive API call.");
    }
    source = await hydrateGoogleDriveMetadata(documentId, accessToken);
  } catch {
    // Fall back to constructing from webhook payload if Drive API is unreachable
    source = {
      id: documentId,
      provider: "googleDrive",
      sourceType: "google_drive",
      title: payload?.name ?? "Untitled",
      description: "",
      rawUrl:
        payload?.webViewLink ??
        `https://drive.google.com/file/d/${documentId}/view`,
      mimeType: payload?.mimeType ?? "application/octet-stream",
      createdAt: timestamp,
      updatedAt: payload?.modifiedTime ?? timestamp,
    };
  }

  return {
    documentId,
    eventType,
    action: "sync",
    source,
  };
}