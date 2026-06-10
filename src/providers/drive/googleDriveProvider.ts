import type { DriveDocumentReference, DeptId } from "@/core/operon";
import { getDriveDocuments, getDriveDocumentById } from "@/services/api";
import { isGoogleDriveAuthConfigured } from "@/services/googleDriveClient";
import type { DriveProvider, DriveAttachPayload, DriveConnectResult } from "@/providers/drive/driveProvider";

const DRIVE_ROUTE = "/api/drive";

async function fetchDriveApi(action: string, body?: Record<string, unknown>): Promise<unknown> {
  const url = `${DRIVE_ROUTE}?action=${encodeURIComponent(action)}`;
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Drive API error [${action}]: ${message}`);
  }

  return response.json();
}

export class GoogleDriveProvider implements DriveProvider {
  async connectDrive(): Promise<DriveConnectResult> {
    if (!isGoogleDriveAuthConfigured()) {
      return {
        connected: false,
        message: "Google Drive credentials are not configured in this environment.",
      };
    }

    const response = (await fetchDriveApi("auth")) as { authUrl?: string; message?: string };

    if (response.authUrl) {
      return {
        connected: false,
        authUrl: response.authUrl,
        message: "Authorization required. Redirect to Google Drive OAuth flow.",
      };
    }

    return {
      connected: true,
      message: response.message ?? "Google Drive connected.",
    };
  }

  async listDocuments(): Promise<DriveDocumentReference[]> {
    return getDriveDocuments();
  }

  async syncDocuments(): Promise<void> {
    await fetchDriveApi("sync");
  }

  async refreshMetadata(id: string): Promise<DriveDocumentReference> {
    const cached = getDriveDocumentById(id);
    if (!cached) {
      throw new Error(`Drive document not found: ${id}`);
    }

    if (!isGoogleDriveAuthConfigured()) {
      return cached;
    }

    return fetchDriveApi("refresh", { documentId: id }) as Promise<DriveDocumentReference>;
  }

  async getDocumentContent(id: string): Promise<string> {
    const response = await fetchDriveApi("docs", { docId: id });
    if (typeof response === "string") return response;
    return JSON.stringify(response, null, 2);
  }

  async watchChanges(): Promise<void> {
    await fetchDriveApi("watch");
  }

  async attachDocument(payload: DriveAttachPayload): Promise<DriveDocumentReference> {
    return fetchDriveApi("attach", { ...payload, mode: "document" }) as Promise<DriveDocumentReference>;
  }

  async attachFolder(payload: DriveAttachPayload): Promise<DriveDocumentReference> {
    return fetchDriveApi("attach", { ...payload, mode: "folder" }) as Promise<DriveDocumentReference>;
  }

  async createFolderReference(payload: DriveAttachPayload): Promise<DriveDocumentReference> {
    return this.attachFolder(payload);
  }

  async searchDriveDocuments(query: string, departmentId?: DeptId | "all"): Promise<DriveDocumentReference[]> {
    const documents = getDriveDocuments();
    const normalizedQuery = query.trim().toLowerCase();

    return documents.filter((doc) => {
      const matchesDepartment =
        !departmentId || departmentId === "all" || doc.departmentId === departmentId;

      if (!matchesDepartment) return false;
      if (!normalizedQuery) return true;

      const haystack = [doc.title, doc.description, doc.dept, doc.tag, doc.author, doc.driveUrl]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }
}