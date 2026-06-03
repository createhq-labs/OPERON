import type { DriveProvider, DriveAttachPayload, DriveConnectResult } from "@/providers/drive/driveProvider";
import { getDriveDocuments, getDriveDocumentById } from "@/services/api";
import { isGoogleDriveAuthConfigured } from "@/services/googleDriveClient";

const DRIVE_ROUTE = "/api/drive";

async function fetchDriveApi(action: string, body?: Record<string, unknown>) {
  const url = `${DRIVE_ROUTE}?action=${encodeURIComponent(action)}`;
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Drive API request failed: ${message}`);
  }

  return response.json();
}

export class GoogleDriveProvider implements DriveProvider {
  async connectDrive(): Promise<DriveConnectResult> {
    if (!isGoogleDriveAuthConfigured()) {
      return { connected: false, message: "Google Drive credentials are not configured in this environment." };
    }

    const response = await fetchDriveApi("auth");
    return {
      connected: false,
      message: response.authUrl ? "Redirect to Google Drive OAuth flow." : response.message || "Unable to connect to Google Drive.",
    };
  }

  async listDocuments() {
    return getDriveDocuments();
  }

  async syncDocuments() {
    await fetchDriveApi("status");
  }

  async refreshMetadata(id: string) {
    const document = getDriveDocumentById(id);
    if (!document) {
      throw new Error("Drive document not found.");
    }

    if (!isGoogleDriveAuthConfigured()) {
      return document;
    }

    return fetchDriveApi("refresh", { documentId: id }) as Promise<import("@/core/operon").DriveDocumentReference>;
  }

  async getDocumentContent(id: string) {
    const response = await fetchDriveApi("docs", { docId: id });
    if (typeof response === "string") {
      return response;
    }
    return JSON.stringify(response, null, 2);
  }

  async watchChanges(): Promise<void> {
    await fetchDriveApi("diagnostics");
  }

  async attachDocument(payload: DriveAttachPayload) {
    return fetchDriveApi("attach", { ...payload, mode: "document" }) as Promise<import("@/core/operon").DriveDocumentReference>;
  }

  async attachFolder(payload: DriveAttachPayload) {
    return fetchDriveApi("attach", { ...payload, mode: "folder" }) as Promise<import("@/core/operon").DriveDocumentReference>;
  }

  async createFolderReference(payload: DriveAttachPayload) {
    return this.attachFolder(payload);
  }

  async searchDriveDocuments(query: string, departmentId?: string) {
    const documents = getDriveDocuments();
    const normalizedQuery = query.trim().toLowerCase();

    return documents.filter((document) => {
      const haystack = [
        document.title,
        document.description,
        document.dept,
        document.tag,
        document.author,
        document.driveUrl,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesQuery = !normalizedQuery || haystack.includes(normalizedQuery);
      const matchesDepartment = !departmentId || departmentId === "all" || document.departmentId === departmentId;
      return matchesQuery && matchesDepartment;
    });
  }
}
