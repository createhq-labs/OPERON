import { promises as fs } from "fs";
import path from "path";
import { createDriveDocumentReference, getUserById } from "@/core/operon";
import { saveDriveDocumentReference } from "@/services/api";
import type { DriveDocumentReference } from "@/core/operon";
import type { DriveProvider, DriveAttachPayload, DriveConnectResult } from "@/providers/drive/driveProvider";

const LOCAL_DRIVE_STATE_FILENAME = ".operon-local-drive.json";

async function getStateFilePath() {
  return path.join(process.cwd(), LOCAL_DRIVE_STATE_FILENAME);
}

async function readLocalDriveState(): Promise<DriveDocumentReference[]> {
  try {
    const filePath = await getStateFilePath();
    const raw = await fs.readFile(filePath, "utf8");
    const payload = JSON.parse(raw) as { documents: DriveDocumentReference[] };
    return Array.isArray(payload.documents) ? payload.documents : [];
  } catch {
    return [];
  }
}

async function writeLocalDriveState(documents: DriveDocumentReference[]) {
  try {
    const filePath = await getStateFilePath();
    await fs.writeFile(filePath, JSON.stringify({ documents }, null, 2), "utf8");
  } catch {
    // ignore persistence failures in the local drive provider
  }
}

function createLocalMetadata(payload: DriveAttachPayload, docId: string) {
  const now = new Date().toISOString();
  const document = createDriveDocumentReference({
    ...payload,
    title: payload.title || "Local Drive document",
    description: payload.description || payload.title || "Local Drive document attached locally.",
    departmentId: payload.departmentId,
    authorId: payload.authorId,
    tag: payload.tag,
    driveFileId: payload.driveFileId,
    googleDocId: payload.googleDocId,
    webViewLink: payload.webViewLink,
    fileMimeType: payload.fileMimeType,
    ownerEmail: payload.ownerEmail,
    allowedRoleIds: payload.allowedRoleIds,
    allowedUserTypes: payload.allowedUserTypes,
    allowedDepartments: payload.allowedDepartments,
    allowedTeamIds: payload.allowedTeamIds,
    visibilityScope: payload.visibilityScope,
    folderId: payload.folderId,
    folderName: payload.folderName,
    linkedDocumentId: payload.linkedDocumentId,
    source: "local_drive",
    sourceProvider: "localDrive",
    driveProvider: "localDrive",
    permissionSummary: [],
  });

  document.id = docId;
  document.createdById = payload.authorId;
  document.updatedById = payload.authorId;
  document.updatedAt = now;
  document.version = "v1.0";
  document.lifecycleState = "uploaded";
  document.syncStatus = "synced";
  document.lastSyncedAt = now;
  document.lastDriveModifiedAt = now;
  document.parserStatus = "pending";
  document.parserVersion = "1.0";
  return document;
}

export class LocalDriveProvider implements DriveProvider {
  async connectDrive(): Promise<DriveConnectResult> {
    return {
      connected: true,
      message: "Local enterprise Drive provider is active. Google Drive credentials are not required.",
    };
  }

  async listDocuments() {
    const documents = await readLocalDriveState();
    return documents;
  }

  async syncDocuments() {
    return;
  }

  async refreshMetadata(id: string) {
    const documents = await readLocalDriveState();
    const document = documents.find((doc) => doc.id === id);
    if (!document) {
      throw new Error("Local Drive document not found.");
    }
    return document;
  }

  async getDocumentContent(id: string) {
    const documents = await readLocalDriveState();
    const document = documents.find((doc) => doc.id === id);
    if (!document) {
      throw new Error("Local Drive document not found.");
    }
    return document.extractedText ?? document.description ?? document.title;
  }

  async watchChanges() {
    return;
  }

  async attachDocument(payload: DriveAttachPayload) {
    const owner = getUserById(payload.authorId);
    const docId = payload.driveFileId || `local-drive-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const document = createLocalMetadata({
      ...payload,
      fileMimeType: payload.fileMimeType || "application/vnd.google-apps.document",
      ownerEmail: owner?.email ?? payload.ownerEmail,
    }, docId);

    const documents = await readLocalDriveState();
    const index = documents.findIndex((item) => item.id === document.id);
    if (index >= 0) {
      documents[index] = document;
    } else {
      documents.unshift(document);
    }
    await writeLocalDriveState(documents);
    saveDriveDocumentReference(document);
    return document;
  }

  async attachFolder(payload: DriveAttachPayload) {
    const owner = getUserById(payload.authorId);
    const folderId = payload.folderId || payload.driveFileId || `local-drive-folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const document = createLocalMetadata({
      ...payload,
      driveFileId: folderId,
      googleDocId: folderId,
      fileMimeType: payload.fileMimeType || "application/vnd.google-apps.folder",
      ownerEmail: owner?.email ?? payload.ownerEmail,
      folderName: payload.folderName || payload.title,
    }, folderId);

    const documents = await readLocalDriveState();
    const index = documents.findIndex((item) => item.id === document.id);
    if (index >= 0) {
      documents[index] = document;
    } else {
      documents.unshift(document);
    }
    await writeLocalDriveState(documents);
    saveDriveDocumentReference(document);
    return document;
  }

  async createFolderReference(payload: DriveAttachPayload) {
    return this.attachFolder(payload);
  }

  async searchDriveDocuments(query: string, departmentId?: string) {
    const documents = await readLocalDriveState();
    const normalized = query.trim().toLowerCase();
    return documents.filter((document) => {
      if (!normalized) return true;
      const haystack = [document.title, document.description, document.driveUrl, document.tag, document.dept]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }
}
