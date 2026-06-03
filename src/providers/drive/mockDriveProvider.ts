import { createDriveDocumentReference, getUserById } from "@/core/operon";
import { getDriveDocumentById, getDriveDocuments, saveDriveDocumentReference } from "@/services/api";
import type { DriveProvider, DriveAttachPayload, DriveConnectResult } from "@/providers/drive/driveProvider";

export class MockDriveProvider implements DriveProvider {
  async connectDrive(): Promise<DriveConnectResult> {
    return {
      connected: true,
      message: "Local enterprise Drive provider is active. Google Drive credentials are not required.",
    };
  }

  async listDocuments() {
    return getDriveDocuments();
  }

  async syncDocuments() {
    return;
  }

  async refreshMetadata(id: string) {
    const document = getDriveDocumentById(id);
    if (!document) {
      throw new Error("Local Drive document not found.");
    }
    return document;
  }

  async getDocumentContent(id: string) {
    const document = getDriveDocumentById(id);
    if (!document) {
      throw new Error("Local Drive document not found.");
    }
    return document.extractedText ?? document.description ?? "";
  }

  async watchChanges() {
    return;
  }

  async attachDocument(payload: DriveAttachPayload) {
    const owner = getUserById(payload.authorId);
    const document = createDriveDocumentReference({
      ...payload,
      driveFileId:
        payload.driveFileId ||
        payload.driveUrl.match(/(?:\/d\/|document\/d\/|spreadsheets\/d\/|file\/d\/)([a-zA-Z0-9_-]+)/)?.[1] ||
        `local-drive-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      googleDocId:
        payload.googleDocId ||
        payload.driveUrl.match(/(?:\/d\/|document\/d\/|spreadsheets\/d\/|file\/d\/)([a-zA-Z0-9_-]+)/)?.[1] ||
        `local-drive-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      webViewLink: payload.driveUrl,
      ownerEmail: owner?.email ?? payload.ownerEmail,
      permissionSummary: [],
      source: "local_drive",
      sourceProvider: "localDrive",
      driveProvider: "localDrive",
    });
    saveDriveDocumentReference(document);
    return document;
  }

  async attachFolder(payload: DriveAttachPayload) {
    const owner = getUserById(payload.authorId);
    const document = createDriveDocumentReference({
      ...payload,
      driveFileId:
        payload.folderId ||
        payload.driveUrl.match(/(?:folders\/|file\/d\/)([a-zA-Z0-9_-]+)/)?.[1] ||
        `local-drive-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      googleDocId:
        payload.folderId ||
        payload.driveUrl.match(/(?:folders\/|file\/d\/)([a-zA-Z0-9_-]+)/)?.[1] ||
        `local-drive-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      webViewLink: payload.driveUrl,
      fileMimeType: "application/vnd.google-apps.folder",
      ownerEmail: owner?.email ?? payload.ownerEmail,
      permissionSummary: [],
      source: "local_drive",
      sourceProvider: "localDrive",
      driveProvider: "localDrive",
    });
    saveDriveDocumentReference(document);
    return document;
  }

  async createFolderReference(payload: DriveAttachPayload) {
    return this.attachFolder(payload);
  }

  async searchDriveDocuments(query: string, departmentId?: string) {
    const documents = getDriveDocuments();
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
