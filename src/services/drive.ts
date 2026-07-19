import { supabase } from "@/lib/supabase";

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

export async function getDriveConnectorStatus() {
  const response = await fetchDriveApi("status");
  if (response?.error) {
    return { status: "unavailable", message: "Drive service unavailable." };
  }
  return response;
}
