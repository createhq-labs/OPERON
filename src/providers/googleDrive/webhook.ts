import type { NormalizedDocumentSource } from "@/providers/types";

export interface GoogleDriveWebhookEvent {
  documentId: string;
  eventType: "content_changed" | "permissions_changed" | "deleted" | "created";
  timestamp: string;
  payload?: Record<string, unknown>;
}

export function handleGoogleDriveWebhook(event: GoogleDriveWebhookEvent): NormalizedDocumentSource | null {
  if (!event?.documentId) {
    console.warn("Received Drive webhook without a documentId", event);
    return null;
  }

  const rawUrl = `https://docs.google.com/document/d/${event.documentId}/edit`;
  const title = `Google Drive ${event.documentId}`;
  const description = `Received Drive webhook event ${event.eventType} for document ${event.documentId}.`;

  return {
    id: event.documentId,
    provider: "googleDrive",
    sourceType: "google_drive",
    title,
    description,
    rawUrl,
    mimeType: "application/vnd.google-apps.document",
    createdAt: event.timestamp,
    updatedAt: event.timestamp,
  };
}
