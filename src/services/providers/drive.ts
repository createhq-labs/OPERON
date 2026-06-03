import type { DriveDocumentPermission, DriveDocumentReference, DeptId, DocTag, RoleId, UserType, VisibilityScope, SyncStatus } from "@/core/operon";

export interface DriveFileMetadata {
  driveFileId: string;
  googleDocId: string;
  webViewLink: string;
  fileMimeType: string;
  ownerEmail: string;
  driveUrl?: string;
  folderId?: string;
  folderName?: string;
  permissionSummary?: DriveDocumentPermission[];
}

export interface DriveConnectorStatus {
  connected: boolean;
  provider: string;
  message: string;
  lastCheckedAt: string;
}

export function createDriveReferenceFromMetadata(
  metadata: DriveFileMetadata,
  authorId: string,
  departmentId: DeptId,
  tag: DocTag,
  allowedRoleIds: RoleId[],
  allowedUserTypes: UserType[],
  visibilityScope: VisibilityScope = "department"
): DriveDocumentReference {
  return {
    id: `drive-${Date.now()}`,
    title: metadata.driveUrl ?? metadata.webViewLink,
    description: "Google Drive document linked for future synchronization.",
    departmentId,
    dept: departmentId,
    tag,
    allowedRoleIds,
    allowedUserTypes,
    visibilityScope,
    globalPinned: false,
    mandatoryRead: false,
    broadcastAudience: "none",
    broadcastRoleIds: [],
    broadcastDepartmentIds: [],
    readTime: "1 min",
    authorId,
    author: authorId,
    createdById: authorId,
    updatedAt: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    updatedById: authorId,
    version: "v1.0",
    pinned: false,
    source: "google_drive",
    sourceProvider: "googleDrive",
    lifecycleState: "uploaded",
    driveFileId: metadata.driveFileId,
    googleDocId: metadata.googleDocId,
    webViewLink: metadata.webViewLink,
    fileMimeType: metadata.fileMimeType,
    ownerEmail: metadata.ownerEmail,
    driveUrl: metadata.driveUrl,
    folderId: metadata.folderId,
    folderName: metadata.folderName,
    permissionSummary: metadata.permissionSummary ?? [],
    syncStatus: "pending" as SyncStatus,
    lastSyncedAt: new Date().toISOString(),
    lastDriveModifiedAt: new Date().toISOString(),
  };
}

export interface DriveWebhookSubscription {
  id: string;
  driveFileId: string;
  callbackUrl: string;
  active: boolean;
  createdAt: string;
  lastCheckedAt?: string;
}

export function createDriveWebhookPayload(subscription: DriveWebhookSubscription) {
  return {
    subscriptionId: subscription.id,
    driveFileId: subscription.driveFileId,
    callbackUrl: subscription.callbackUrl,
    active: subscription.active,
    createdAt: subscription.createdAt,
  };
}

export function mapDriveApiFileToMetadata(file: any): DriveFileMetadata {
  return {
    driveFileId: file.id || file.driveFileId || "",
    googleDocId: file.googleDocId || file.id || "",
    webViewLink: file.webViewLink || file.alternateLink || file.webViewLink || "",
    fileMimeType: file.mimeType || file.fileMimeType || "application/octet-stream",
    ownerEmail: file.owner?.emailAddress || file.ownerEmail || "",
    driveUrl: file.webViewLink || file.alternateLink || "",
    folderId: file.parents?.[0] || file.folderId,
    folderName: file.folderName,
    permissionSummary: file.permissionSummary || [],
  };
}
