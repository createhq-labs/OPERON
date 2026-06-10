import type { NormalizedDocumentSource } from "@/providers/types";
import { hydrateGoogleDriveMetadata } from "./metadata";

export async function fetchGoogleDriveSource(documentId: string, accessToken: string): Promise<NormalizedDocumentSource> {
  return hydrateGoogleDriveMetadata(documentId, accessToken);
}

export { authorizeGoogleDriveProvider } from "./auth";
export type { GoogleDriveAuthResult } from "./auth";

export { hydrateGoogleDriveMetadata } from "./metadata";

export { reconcileDriveDocument } from "./reconciliation";
export type { ReconciliationResult, RemoteDriveFileState } from "./reconciliation";

export { createSyncSchedule, advanceSyncSchedule, isSyncScheduleDue } from "./scheduler";
export type { SyncSchedule } from "./scheduler";

export { syncGoogleDriveDocument } from "./sync";
export type { SyncResult } from "./sync";

export { handleGoogleDriveWebhook } from "./webhook";
export type { GoogleDriveWebhookEvent, GoogleDriveWebhookEventType, WebhookHandlerResult } from "./webhook";

export { registerDriveWebhookChannel, stopDriveWebhookChannel } from "./webhooks";
export type { GoogleDriveWebhookRegistration, GoogleDriveWebhookRegistrationOptions } from "./webhooks";