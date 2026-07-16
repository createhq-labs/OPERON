import { supabase } from "@/lib/supabase";
import { DEFAULT_ROLE_ID } from "@/core/roles";
import type { DriveDocumentReference } from "@/core/operon";
import type { DriveAttachPayload, DriveConnectResult } from "@/providers/drive/driveProvider";

export interface DriveDiagnostics {
  activeProvider: string;
  providerMode: "local" | "google";
  status: string;
  message: string;
  ingestion: {
    total: number;
    queued: number;
    processing: number;
    retrying: number;
    failed: number;
  };
  parser: {
    pending: number;
    parsed: number;
    failed: number;
  };
  indexingVersion: number;
}

async function fetchDriveApi(action: string, body?: Record<string, unknown>) {
  const url = `/api/drive?action=${encodeURIComponent(action)}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  try {
    const sessionResponse = await supabase.auth.getSession();
    const token = sessionResponse?.data?.session?.access_token;
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // If session lookup fails, continue using credentials include.
  }

  try {
    const response = await fetch(url, {
      method: body ? "POST" : "GET",
      headers,
      credentials: "include",
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      return { error: true, message: "Drive service unavailable." };
    }

    const json = await response.json();
    if (json?.success === false) {
      return { error: true, message: json.message || json.error || "Drive service unavailable." };
    }
    // The API wraps successful payloads as { success, data }; some actions
    // (e.g. the OAuth "auth" redirect) respond with a flat shape instead.
    // Unwrap when present so callers always see the payload directly.
    return json?.data !== undefined ? json.data : json;
  } catch {
    return { error: true, message: "Drive service unavailable." };
  }
}

export async function connectDrive(): Promise<DriveConnectResult> {
  const response = await fetchDriveApi("auth", {});
  const authUrl = response.authUrl as string | undefined;
  if (!authUrl) {
    return {
      connected: Boolean(response.connected),
      message: response.message || "Local enterprise Drive fallback is active.",
    };
  }

  const popup = window.open(authUrl, "drive-connect", "width=700,height=700");
  if (!popup) {
    return { connected: false, message: "Popup blocked. Allow popups to connect Google Drive." };
  }

  return new Promise<DriveConnectResult>((resolve) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", listener);
      resolve({ connected: false, message: "Google Drive connection timed out." });
    }, 120000);

    const listener = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "drive-auth-result") return;
      window.clearTimeout(timeout);
      window.removeEventListener("message", listener);
      resolve({ connected: event.data.connected, message: event.data.message });
    };

    window.addEventListener("message", listener);
  });
}

export async function attachDriveDocument(payload: DriveAttachPayload): Promise<DriveDocumentReference | undefined> {
  const response = await fetchDriveApi("attach", { ...payload, mode: "document" });
  if (response?.error) {
    return undefined;
  }
  return response as DriveDocumentReference;
}

export async function attachDriveFolder(payload: DriveAttachPayload): Promise<DriveDocumentReference | undefined> {
  const response = await fetchDriveApi("attach", { ...payload, mode: "folder" });
  if (response?.error) {
    return undefined;
  }
  return response as DriveDocumentReference;
}

export async function refreshDriveMetadata(id: string): Promise<DriveDocumentReference | undefined> {
  const response = await fetchDriveApi("refresh", { documentId: id });
  if (response?.error) {
    return undefined;
  }
  return response as DriveDocumentReference;
}

export type DriveSyncMode = "manual" | "incremental" | "full";

export interface DriveSyncResult {
  success: boolean;
  mode: DriveSyncMode;
  synced: number;
  documents: Array<{ id: string; syncStatus: string }>;
}

/**
 * Trigger a Drive sync.
 * - manual: re-sync a single document (requires documentId)
 * - incremental: re-sync only documents that are pending, stale, or failed
 * - full: re-sync every connected Drive document
 */
export async function syncDrive(mode: DriveSyncMode, options?: { documentId?: string; accountId?: string }): Promise<DriveSyncResult> {
  const response = await fetchDriveApi("sync", {
    mode,
    documentId: options?.documentId,
    accountId: options?.accountId,
  });
  if (response?.error) {
    return { success: false, mode, synced: 0, documents: [] };
  }
  return response as DriveSyncResult;
}

export async function registerDriveWebhook(subscriptionId: string, callbackUrl: string) {
  try {
    return await fetchDriveApi("register", { subscriptionId, callbackUrl });
  } catch {
    return undefined;
  }
}

export async function disconnectDrive(accountId: string) {
  try {
    return await fetchDriveApi("disconnect", { accountId });
  } catch {
    return undefined;
  }
}

export async function getDriveConnectorStatus() {
  const response = await fetchDriveApi("status");
  if (response?.error) {
    return { status: "unavailable", message: "Drive service unavailable." };
  }
  return response;
}

export async function getDriveDiagnostics(): Promise<DriveDiagnostics> {
  const response = await fetchDriveApi("diagnostics");
  if (response?.error) {
    return {
      activeProvider: "none",
      providerMode: "local",
      status: "unavailable",
      message: "Drive service unavailable.",
      ingestion: { total: 0, queued: 0, processing: 0, retrying: 0, failed: 0 },
      parser: { pending: 0, parsed: 0, failed: 0 },
      indexingVersion: 0,
    };
  }
  return response as DriveDiagnostics;
}

/**
 * Uploads a file through the /api/drive/upload endpoint.
 * Reports upload progress via the optional `onProgress` callback.
 * Returns the Drive file ID on success.
 */
export async function uploadToProvider(
  file: File,
  onProgress?: (progress: number) => void
): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  // Retrieve the current Supabase session to get the userId and auth token.
  const sessionResponse = await supabase.auth.getSession();
  const session = sessionResponse?.data?.session;
  const userId = session?.user?.id ?? "anonymous";
  const token = session?.access_token;

  formData.append("userId", userId);
  // Use a sensible default for required fields; callers can extend this
  // by calling the API directly with full metadata.
  formData.append("roleId", DEFAULT_ROLE_ID);
  formData.append("title", file.name);

  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        const progress = Math.round((event.loaded / event.total) * 100);
        onProgress?.(progress);
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const result = JSON.parse(xhr.responseText) as {
            success?: boolean;
            document?: { id?: string; driveFileId?: string };
            error?: string;
          };
          if (result.success && result.document?.id) {
            onProgress?.(100);
            resolve(result.document.id);
          } else {
            reject(new Error(result.error ?? "Upload failed: no document ID returned."));
          }
        } catch {
          reject(new Error("Upload failed: unexpected response from server."));
        }
      } else {
        try {
          const result = JSON.parse(xhr.responseText) as { error?: string };
          reject(new Error(result.error ?? `Upload failed with status ${xhr.status}.`));
        } catch {
          reject(new Error(`Upload failed with status ${xhr.status}.`));
        }
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Upload failed: network error."));
    });

    xhr.addEventListener("abort", () => {
      reject(new Error("Upload aborted."));
    });

    xhr.open("POST", "/api/drive/upload");
    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }
    xhr.send(formData);
  });
}
