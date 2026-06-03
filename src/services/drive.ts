import { supabase } from "@/lib/supabase";
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

  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers,
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Drive API request failed: ${message}`);
  }

  return response.json();
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

export async function attachDriveDocument(payload: DriveAttachPayload): Promise<DriveDocumentReference> {
  const response = await fetchDriveApi("attach", { ...payload, mode: "document" });
  return response as DriveDocumentReference;
}

export async function attachDriveFolder(payload: DriveAttachPayload): Promise<DriveDocumentReference> {
  const response = await fetchDriveApi("attach", { ...payload, mode: "folder" });
  return response as DriveDocumentReference;
}

export async function refreshDriveMetadata(id: string): Promise<DriveDocumentReference | undefined> {
  const response = await fetchDriveApi("refresh", { documentId: id });
  return response as DriveDocumentReference;
}

export async function registerDriveWebhook(subscriptionId: string, callbackUrl: string) {
  return fetchDriveApi("register", { subscriptionId, callbackUrl });
}

export async function disconnectDrive(accountId: string) {
  return fetchDriveApi("disconnect", { accountId });
}

export async function getDriveConnectorStatus() {
  return fetchDriveApi("status");
}

export async function getDriveDiagnostics(): Promise<DriveDiagnostics> {
  return fetchDriveApi("diagnostics");
}
