import { promises as fs } from "fs";
import path from "path";
import { createDriveDocumentReference, getUserById } from "@/core/operon";
import { saveDriveDocumentReference } from "@/services/api";
import type { DriveDocumentReference, DeptId } from "@/core/operon";
import type { DriveProvider, DriveAttachPayload, DriveConnectResult } from "@/providers/drive/driveProvider";

const LOCAL_DRIVE_STATE_FILENAME = ".operon-local-drive.json";
const STATE_FILE_PATH = path.join(process.cwd(), LOCAL_DRIVE_STATE_FILENAME);

async function readLocalDriveState(): Promise<DriveDocumentReference[]> {
  try {
    const raw = await fs.readFile(STATE_FILE_PATH, "utf8");
    const payload = JSON.parse(raw) as { documents: DriveDocumentReference[] };
    return Array.isArray(payload.documents) ? payload.documents : [];
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("[LocalDriveProvider] Failed to read state file:", err);
    }
    return [];
  }
}

async function writeLocalDriveState(documents: DriveDocumentReference[]): Promise<void> {
  try {
    await fs.writeFile(STATE_FILE_PATH, JSON.stringify({ documents }, null, 2), "utf8");
  } catch (err) {
    console.error("[LocalDriveProvider] Failed to persist state:", err);
  }
}

function buildDocumentMetadata(payload: DriveAttachPayload, docId: string): DriveDocumentReference {
  const now = new Date().toISOString();
  const ownerEmail = getUserById(payload.authorId)?.email ?? payload.ownerEmail;

  const document = createDriveDocumentReference({
    ...payload,
    title: payload.title || "Untitled Document",
    description: payload.description || payload.title || "No description provided.",
    fileMimeType: payload.fileMimeType || "application/vnd.google-apps.document",
    ownerEmail,
    source: "local_drive",
    sourceProvider: "localDrive",
    driveProvider: "localDrive",
    permissionSummary: [],
  });

  return {
    ...document,
    id: docId,
    createdById: payload.authorId,
    updatedById: payload.authorId,
    updatedAt: now,
    version: "v1.0",
    lifecycleState: "uploaded",
    syncStatus: "synced",
    lastSyncedAt: now,
    lastDriveModifiedAt: now,
    parserStatus: "pending",
    parserVersion: "1.0",
    documentVersionId: payload.documentVersionId,
  };
}

async function upsertDocument(
  document: DriveDocumentReference
): Promise<DriveDocumentReference> {
  const documents = await readLocalDriveState();
  const existingIndex = documents.findIndex((d) => d.id === document.id);

  if (existingIndex >= 0) {
    documents[existingIndex] = document;
  } else {
    documents.unshift(document);
  }

  await writeLocalDriveState(documents);
  saveDriveDocumentReference(document);
  return document;
}

export class LocalDriveProvider implements DriveProvider {
  async connectDrive(): Promise<DriveConnectResult> {
    return {
      connected: true,
      message: "Local Drive provider active. Google Drive credentials are not configured.",
    };
  }

  async listDocuments(): Promise<DriveDocumentReference[]> {
    return readLocalDriveState();
  }

  async syncDocuments(): Promise<void> {
    // No-op: local provider has no remote to synchronize with.
  }

  async refreshMetadata(id: string): Promise<DriveDocumentReference> {
    const documents = await readLocalDriveState();
    const document = documents.find((d) => d.id === id);
    if (!document) {
      throw new Error(`Local Drive document not found: ${id}`);
    }
    return document;
  }

  async getDocumentContent(id: string): Promise<string> {
    const documents = await readLocalDriveState();
    const document = documents.find((d) => d.id === id);
    if (!document) {
      throw new Error(`Local Drive document not found: ${id}`);
    }
    return document.extractedText ?? document.description ?? document.title;
  }

  async watchChanges(): Promise<void> {
    // No-op: local provider has no remote change events.
  }

  async attachDocument(payload: DriveAttachPayload): Promise<DriveDocumentReference> {
    const docId =
      payload.driveFileId ||
      `local-drive-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const document = buildDocumentMetadata(payload, docId);
    return upsertDocument(document);
  }

  async attachFolder(payload: DriveAttachPayload): Promise<DriveDocumentReference> {
    const folderId =
      payload.folderId ||
      payload.driveFileId ||
      `local-drive-folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const document = buildDocumentMetadata(
      {
        ...payload,
        driveFileId: folderId,
        googleDocId: folderId,
        fileMimeType: payload.fileMimeType || "application/vnd.google-apps.folder",
        folderName: payload.folderName || payload.title,
      },
      folderId
    );

    return upsertDocument(document);
  }

  async createFolderReference(payload: DriveAttachPayload): Promise<DriveDocumentReference> {
    return this.attachFolder(payload);
  }

  async searchDriveDocuments(query: string, departmentId?: DeptId | "all"): Promise<DriveDocumentReference[]> {
    const documents = await readLocalDriveState();
    const normalized = query.trim().toLowerCase();

    return documents.filter((doc) => {
      const matchesDepartment =
        !departmentId || departmentId === "all" || doc.departmentId === departmentId;

      if (!matchesDepartment) return false;
      if (!normalized) return true;

      const haystack = [doc.title, doc.description, doc.driveUrl, doc.tag, doc.dept]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalized);
    });
  }
}