import { supabase } from "@/lib/supabase";
import type { Document, DeptId, DocTag, RoleId, VisibilityScope } from "@/core/types";

export interface DocumentUploadMetadata {
  title: string;
  description?: string;
  departmentId?: DeptId;
  tag: DocTag;
  /** Real global.roles.id UUIDs, from listAssignableRoles(). */
  allowedRoleIds: RoleId[];
  visibilityScope?: VisibilityScope;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function postUpload(formData: FormData): Promise<Document> {
  const headers = await authHeaders();
  const response = await fetch("/api/documents/upload", {
    method: "POST",
    headers,
    body: formData,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "Upload failed. Please try again.");
  }
  return payload.document as Document;
}

/** Uploads a new document. The browser never talks to Google Drive directly. */
export async function uploadDocumentFile(file: File, metadata: DocumentUploadMetadata): Promise<Document> {
  const formData = new FormData();
  formData.set("file", file);
  formData.set("title", metadata.title);
  formData.set("description", metadata.description ?? "");
  if (metadata.departmentId) formData.set("departmentId", metadata.departmentId);
  formData.set("tag", metadata.tag);
  formData.set("allowedRoleIds", JSON.stringify(metadata.allowedRoleIds));
  if (metadata.visibilityScope) formData.set("visibilityScope", metadata.visibilityScope);

  return postUpload(formData);
}

/** Uploads a replacement file as a new version of an existing document. */
export async function uploadDocumentNewVersion(documentId: string, file: File): Promise<Document> {
  const formData = new FormData();
  formData.set("file", file);
  formData.set("existingDocumentId", documentId);
  return postUpload(formData);
}

export interface DocumentMetadataPatch {
  title?: string;
  description?: string;
  tag?: DocTag;
  visibilityScope?: VisibilityScope;
  allowedRoleIds?: RoleId[];
}

/** Edits a document's metadata/permissions. */
export async function updateDocument(documentId: string, patch: DocumentMetadataPatch): Promise<Document> {
  const headers = await authHeaders();
  const response = await fetch(`/api/documents/${documentId}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "Failed to update document.");
  }
  return payload.document as Document;
}

/** Lists documents visible to the current user, filtered server-side. */
export async function listDocuments(): Promise<Document[]> {
  const headers = await authHeaders();
  const response = await fetch("/api/documents", { headers });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "Failed to load documents.");
  }
  return (payload.documents as Document[]) ?? [];
}

export interface DocumentStorageDiagnostics {
  configured: boolean;
  tokenAcquisitionOk: boolean;
  connected: boolean;
}

/** Admin-only: reports whether the central Drive storage integration is healthy. */
export async function getDocumentStorageDiagnostics(): Promise<DocumentStorageDiagnostics> {
  const headers = await authHeaders();
  const response = await fetch("/api/documents?diagnostics=true", { headers });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    return { configured: false, tokenAcquisitionOk: false, connected: false };
  }
  return payload.diagnostics as DocumentStorageDiagnostics;
}
