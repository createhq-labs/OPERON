import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  buildWebhookCallbackUrl,
  createDriveWatchSubscription,
  determineParserType,
  extractDriveExportPayload,
  fetchDriveFileMetadata,
  fetchGoogleDocsDocument,
  findDriveAccounts,
  getValidAccessToken,
  mapGooglePermissions,
} from "@/services/googleDriveClient";
import type { GoogleDriveAccount } from "@/services/googleDriveClient";
import { enqueueIngestionJob } from "@/services/ingestion";
import {
  getDriveDocuments,
  saveDriveDocumentReference,
  updateDriveDocumentSyncMetadata,
  saveActivity,
} from "@/services/api";
import type { DriveDocumentReference } from "@/core/operon";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How close to expiry (ms) a webhook channel must be before we renew it. */
const RENEWAL_THRESHOLD_MS = 60 * 60 * 1_000; // 1 hour

/** New channel lifetime requested from Google Drive (ms). */
const CHANNEL_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000; // 7 days

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

/**
 * Resolves a Drive account for the given user ID.
 * Returns null when no active account exists.
 */
async function resolveDriveAccount(userId: string) {
  const accounts = await findDriveAccounts(userId);
  return accounts.find((a) => a.active) ?? accounts[0] ?? null;
}

/**
 * Returns true when the file's content has changed since the document was
 * last synced.  We use the Drive `modifiedTime` as a proxy rather than
 * comparing MD5 checksums, which avoids an extra API call.
 */
function hasContentChanged(
  document: DriveDocumentReference,
  driveModifiedTime: string | undefined
): boolean {
  if (!driveModifiedTime) return true;
  if (!document.lastDriveModifiedAt) return true;
  return (
    new Date(driveModifiedTime).getTime() >
    new Date(document.lastDriveModifiedAt).getTime()
  );
}

/**
 * Re-ingests a Drive document whose content has changed.
 * Handles both Google Docs native format and binary/export-able formats.
 */
async function reIngestDocument(
  accessToken: string,
  document: DriveDocumentReference,
  metadata: {
    id: string;
    name: string;
    mimeType: string;
    modifiedTime?: string;
    webViewLink?: string;
  }
): Promise<void> {
  const now = new Date().toISOString();

  // Update sync metadata immediately so the UI reflects the in-progress state.
  updateDriveDocumentSyncMetadata(document.id, {
    syncStatus: "syncing",
    lastSyncedAt: now,
    lastDriveModifiedAt: metadata.modifiedTime || now,
    updatedAt: now,
  });

  if (metadata.mimeType === "application/vnd.google-apps.document") {
    const rawPayload = await fetchGoogleDocsDocument(
      accessToken,
      metadata.id
    );
    enqueueIngestionJob({
      documentId: document.id,
      sourceType: "googleDrive",
      parserType: "googleDrive",
      sourceUrl: document.driveUrl,
      fileName: metadata.name,
      mimeType: metadata.mimeType,
      metadata: {
        departmentId: document.departmentId,
        tags: [document.tag],
        authorId: document.authorId,
      },
      rawPayload,
    });
  } else {
    const parserType = determineParserType(metadata.mimeType);
    const rawPayload = await extractDriveExportPayload(
      accessToken,
      metadata.id,
      metadata
    );
    enqueueIngestionJob({
      documentId: document.id,
      sourceType: "googleDrive",
      parserType,
      sourceUrl: document.driveUrl,
      fileName: metadata.name,
      mimeType: metadata.mimeType,
      metadata: {
        departmentId: document.departmentId,
        tags: [document.tag],
        authorId: document.authorId,
      },
      rawPayload,
    });
  }
}

/**
 * Renews a Drive watch subscription before it expires.
 * Called automatically when an incoming notification is close to channel
 * expiry so we never lose real-time coverage.
 */
async function renewChannelIfExpiring(
  accessToken: string,
  fileId: string,
  expirationHeader: string | null,
  userId: string
): Promise<void> {
  if (!expirationHeader) return;

  const expiresAt = new Date(expirationHeader).getTime();
  const remaining = expiresAt - Date.now();

  if (remaining > RENEWAL_THRESHOLD_MS) return;

  const channelId = generateId("drive-webhook");
  const expiration = Date.now() + CHANNEL_LIFETIME_MS;

  await createDriveWatchSubscription(
    accessToken,
    fileId,
    channelId,
    buildWebhookCallbackUrl(),
    userId,
    expiration
  );
}

// ---------------------------------------------------------------------------
// POST /api/drive/webhook
// ---------------------------------------------------------------------------

/**
 * Receives real-time change notifications from Google Drive.
 *
 * Google requires a 2xx response within a few seconds or it will retry.
 * We therefore acknowledge immediately and process the change inline but
 * swallow errors after logging — a failed sync will be caught on the next
 * incremental sync pass.
 *
 * Header reference:
 *   x-goog-channel-id        — the subscription channel ID
 *   x-goog-resource-id       — opaque resource identifier
 *   x-goog-resource-uri      — Drive API URI of the changed resource
 *   x-goog-resource-state    — "sync" (subscription created) | "update" | "remove"
 *   x-goog-channel-expiration — ISO-8601 expiry of this subscription channel
 *   x-goog-channel-token     — optional verification token set at subscribe time
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const resourceId = request.headers.get("x-goog-resource-id") ?? "";
  const resourceUri = request.headers.get("x-goog-resource-uri") ?? "";
  const channelId = request.headers.get("x-goog-channel-id") ?? "";
  const resourceState = request.headers.get("x-goog-resource-state") ?? "";
  const channelExpiration = request.headers.get("x-goog-channel-expiration");

  // "sync" is a handshake notification sent when a subscription is first
  // created.  Nothing to process — acknowledge and return.
  if (resourceState === "sync") {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  if (!resourceId || !resourceUri) {
    // Malformed notification — still 200 to prevent Google retrying forever.
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Extract the Drive file ID from the resource URI.
  const fileIdMatch = resourceUri.match(/\/files\/([^/?]+)/);
  const fileId = fileIdMatch?.[1];
  if (!fileId) {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Run the sync in the background without blocking the response.
  processWebhookEvent(
    request,
    fileId,
    resourceState,
    channelId,
    resourceId,
    channelExpiration
  ).catch((err) =>
    console.error("[drive/webhook] Unhandled processing error:", err)
  );

  return NextResponse.json({ received: true }, { status: 200 });
}

// ---------------------------------------------------------------------------
// Background processing
// ---------------------------------------------------------------------------

async function processWebhookEvent(
  request: NextRequest,
  fileId: string,
  resourceState: string,
  channelId: string,
  resourceId: string,
  channelExpiration: string | null
): Promise<void> {
  // Resolve any active Drive account to authenticate subsequent API calls.
  // We use the first active account found; in a multi-account deployment this
  // would need to be matched against the channel's owning user.
  const accounts = await findAllActiveAccounts();
  if (!accounts.length) return;

  const account = accounts[0];
  const accessToken = await getValidAccessToken(account);

  // Proactively renew the subscription channel if it is close to expiring.
  await renewChannelIfExpiring(
    accessToken,
    fileId,
    channelExpiration,
    account.userId
  ).catch((err) =>
    console.warn("[drive/webhook] Channel renewal failed:", err)
  );

  // "remove" means the file was deleted or access was revoked.
  if (resourceState === "remove") {
    await handleFileDeletion(fileId, account.userId);
    return;
  }

  // For all other states ("update", "add") fetch current Drive metadata.
  const metadata = await fetchDriveFileMetadata(accessToken, fileId);

  // Find the corresponding Operon document (if registered).
  const document = getDriveDocuments().find((d) => d.driveFileId === fileId);
  if (!document) {
    // File not yet registered in Operon — nothing to sync.
    return;
  }

  const permissions = mapGooglePermissions(metadata.permissions ?? []);

  // Apply metadata updates (link, permissions, modified timestamp).
  saveDriveDocumentReference({
    ...document,
    permissionSummary: permissions,
    lastDriveModifiedAt:
      metadata.modifiedTime || document.lastDriveModifiedAt,
    syncStatus: "pending",
    updatedAt: new Date().toISOString(),
    driveUrl: metadata.webViewLink || document.driveUrl,
    webViewLink: metadata.webViewLink || document.webViewLink,
  });

  // Re-ingest content only when it has actually changed to avoid redundant
  // parse / index cycles.
  if (
    metadata.mimeType !== "application/vnd.google-apps.folder" &&
    hasContentChanged(document, metadata.modifiedTime)
  ) {
    await reIngestDocument(accessToken, document, {
      id: metadata.id ?? fileId,
      name: metadata.name ?? document.title,
      mimeType: metadata.mimeType,
      modifiedTime: metadata.modifiedTime,
      webViewLink: metadata.webViewLink,
    });
  } else {
    // Metadata-only change (rename, permission update, etc.)
    updateDriveDocumentSyncMetadata(document.id, {
      syncStatus: "synced",
      lastSyncedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  await saveActivity({
    id: generateId("activity"),
    userId: account.userId,
    action: "SYSTEM_EVENT",
    targetType: "document",
    targetId: document.id,
    timestamp: new Date().toISOString(),
    metadata: {
      event: "drive_webhook_sync",
      resourceState,
      channelId,
      fileId,
      mimeType: metadata.mimeType,
    },
  });
}

/**
 * Handles a Drive "remove" notification — marks the document unavailable
 * without destroying its history, as required by the architecture.
 */
async function handleFileDeletion(
  fileId: string,
  userId: string
): Promise<void> {
  const document = getDriveDocuments().find((d) => d.driveFileId === fileId);
  if (!document) return;

  updateDriveDocumentSyncMetadata(document.id, {
    syncStatus: "deleted" as DriveDocumentReference["syncStatus"],
    lastSyncedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    updatedById: userId,
  });

  saveDriveDocumentReference({
    ...document,
    lifecycleState: "archived",
    syncStatus: "deleted" as DriveDocumentReference["syncStatus"],
    updatedAt: new Date().toISOString(),
  });

  await saveActivity({
    id: generateId("activity"),
    userId,
    action: "SYSTEM_EVENT",
    targetType: "document",
    targetId: document.id,
    timestamp: new Date().toISOString(),
    metadata: { event: "drive_file_removed", fileId },
  });
}

/**
 * Returns all active Drive accounts across all users.
 * In the current single-tenant architecture this is a flat list; a future
 * multi-tenant deployment would scope this per organisation.
 */
async function findAllActiveAccounts(): Promise<GoogleDriveAccount[]> {
  const serviceUserId = process.env.OPERON_SERVICE_ACCOUNT_USER_ID;
  if (!serviceUserId) return [];
  const accounts = await findDriveAccounts(serviceUserId);
  return accounts.filter((a) => a.active);
}