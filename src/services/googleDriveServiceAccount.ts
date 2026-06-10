/**
 * Google Drive Service Account Client
 *
 * Single-tenant backend storage layer. All Drive operations use a
 * service account configured via environment variables. No per-user
 * OAuth — Drive is fully invisible to end users.
 *
 * Required environment variables:
 *   GOOGLE_SERVICE_ACCOUNT_JSON   — service account key JSON (plain or base64)
 *   GOOGLE_DRIVE_FOLDER_ID        — root folder ID for company files
 */

import crypto from "crypto";
import jwt from "jsonwebtoken";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ServiceAccountConfig {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

export interface ServiceAccountToken {
  accessToken: string;
  /** Unix timestamp in milliseconds. */
  expiresAt: number;
  tokenType: string;
}

// ─── Token Cache ──────────────────────────────────────────────────────────────
// Module-level cache is acceptable in long-lived Node processes.
// In serverless environments (Vercel Edge, Lambda) each invocation gets
// a fresh module, so this effectively acts as a request-scoped cache.
// The 60-second buffer ensures we never serve a token that expires mid-request.

let _cachedToken: ServiceAccountToken | null = null;
const TOKEN_EXPIRY_BUFFER_MS = 60_000;

// ─── Config ───────────────────────────────────────────────────────────────────

function getServiceAccountConfig(): ServiceAccountConfig {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (!raw) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON is not set. " +
      "Configure service account credentials for Google Drive access."
    );
  }

  // Try plain JSON first, then base64-encoded JSON.
  for (const attempt of [raw, Buffer.from(raw, "base64").toString("utf8")]) {
    try {
      const parsed = JSON.parse(attempt) as ServiceAccountConfig;
      if (parsed.client_email && parsed.private_key) return parsed;
    } catch {
      // Try next format.
    }
  }

  throw new Error(
    "GOOGLE_SERVICE_ACCOUNT_JSON must be valid JSON or base64-encoded JSON " +
    "with client_email and private_key fields."
  );
}

export function getDriveFolderId(): string {
  const id = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
  if (!id) {
    throw new Error(
      "GOOGLE_DRIVE_FOLDER_ID is not set. " +
      "Specify the Google Drive folder where company files are stored."
    );
  }
  return id;
}

export function isServiceAccountConfigured(): boolean {
  try {
    getServiceAccountConfig();
    getDriveFolderId();
    return true;
  } catch {
    return false;
  }
}

// ─── Token Acquisition ────────────────────────────────────────────────────────

function buildJWT(config: ServiceAccountConfig): string {
  const now = Math.floor(Date.now() / 1000);

  return jwt.sign(
    {
      iss: config.client_email,
      sub: config.client_email,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
      scope: [
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/documents",
      ].join(" "),
    },
    config.private_key,
    { algorithm: "RS256", keyid: config.private_key_id }
  );
}

async function exchangeJWT(assertion: string): Promise<ServiceAccountToken> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to obtain service account token: ${body}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
    token_type: string;
  };

  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    tokenType: data.token_type,
  };
}

export async function getServiceAccountAccessToken(): Promise<string> {
  if (_cachedToken && _cachedToken.expiresAt > Date.now() + TOKEN_EXPIRY_BUFFER_MS) {
    return _cachedToken.accessToken;
  }

  const config = getServiceAccountConfig();
  const assertion = buildJWT(config);
  _cachedToken = await exchangeJWT(assertion);

  return _cachedToken.accessToken;
}

/** Clears the token cache. Useful in tests or after credential rotation. */
export function clearTokenCache(): void {
  _cachedToken = null;
}

// ─── Drive Operations ─────────────────────────────────────────────────────────

export async function uploadFileToCompanyDrive(
  fileName: string,
  mimeType: string,
  fileContent: Buffer,
  options?: { description?: string; parentFolderId?: string }
): Promise<{ fileId: string; webViewLink: string }> {
  const accessToken = await getServiceAccountAccessToken();
  const folderId = options?.parentFolderId ?? getDriveFolderId();

  const boundary = "operon_boundary_" + crypto.randomUUID().replace(/-/g, "");

  const metaPart = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify({
      name: fileName,
      mimeType,
      parents: [folderId],
      description: options?.description ?? "",
    }),
  ].join("\r\n");

  const filePart = [
    `--${boundary}`,
    `Content-Type: ${mimeType}`,
    "Content-Transfer-Encoding: binary",
    "",
  ].join("\r\n");

  const body = Buffer.concat([
    Buffer.from(metaPart + "\r\n", "utf8"),
    Buffer.from(filePart + "\r\n", "utf8"),
    fileContent,
    Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
  ]);

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary="${boundary}"`,
        "Content-Length": String(body.length),
      },
      body,
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Drive upload failed: ${err}`);
  }

  const result = (await response.json()) as { id: string; webViewLink: string };
  return { fileId: result.id, webViewLink: result.webViewLink };
}

export async function replaceFileInCompanyDrive(
  fileId: string,
  mimeType: string,
  fileContent: Buffer
): Promise<{ fileId: string; version: number }> {
  const accessToken = await getServiceAccountAccessToken();

  // Fetch current version number before replacing.
  const infoResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=version`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const currentVersion = infoResponse.ok
    ? ((await infoResponse.json()) as { version?: number }).version ?? 1
    : 1;

  const response = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": mimeType,
        "Content-Length": String(fileContent.length),
      },
      body: new Uint8Array(fileContent),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Drive file replace failed: ${err}`);
  }

  return { fileId, version: currentVersion + 1 };
}

export async function getCompanyDriveFileMetadata(
  fileId: string,
  fields: string[] = [
    "id",
    "name",
    "mimeType",
    "webViewLink",
    "modifiedTime",
    "createdTime",
    "version",
    "size",
    "description",
  ]
): Promise<Record<string, unknown>> {
  const accessToken = await getServiceAccountAccessToken();

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=${encodeURIComponent(fields.join(","))}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to fetch Drive file metadata: ${err}`);
  }

  return response.json() as Promise<Record<string, unknown>>;
}

export async function deleteFileFromCompanyDrive(fileId: string): Promise<void> {
  const accessToken = await getServiceAccountAccessToken();

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to delete Drive file: ${err}`);
  }
}

export async function exportGoogleDoc(
  documentId: string,
  exportMimeType = "application/pdf"
): Promise<Buffer> {
  const accessToken = await getServiceAccountAccessToken();

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${documentId}/export?mimeType=${encodeURIComponent(exportMimeType)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to export Google Doc: ${err}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function getGoogleDocsContent(
  documentId: string
): Promise<Record<string, unknown>> {
  const accessToken = await getServiceAccountAccessToken();

  const response = await fetch(
    `https://docs.googleapis.com/v1/documents/${documentId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to fetch Google Docs content: ${err}`);
  }

  return response.json() as Promise<Record<string, unknown>>;
}