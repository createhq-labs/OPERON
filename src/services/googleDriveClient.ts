import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase";
import type { DriveDocumentPermission } from "@/core/operon";

const GOOGLE_DRIVE_CLIENT_ID = process.env.GOOGLE_DRIVE_CLIENT_ID ?? "";
const GOOGLE_DRIVE_CLIENT_SECRET = process.env.GOOGLE_DRIVE_CLIENT_SECRET ?? "";
const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const REDIRECT_URI = process.env.GOOGLE_DRIVE_REDIRECT_URI ?? `${APP_BASE_URL}/api/drive?action=callback`;
const WEBHOOK_CALLBACK_URL = process.env.GOOGLE_DRIVE_WEBHOOK_CALLBACK_URL ?? `${APP_BASE_URL}/api/drive?action=webhook`;
const OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/documents.readonly",
].join(" ");
const GOOGLE_OAUTH_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_OAUTH_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

export interface GoogleOAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  scope: string;
  tokenType: string;
  idToken?: string;
}

export interface GoogleDriveAccount {
  id: string;
  legacyId: string;
  userId: string;
  googleAccountId: string;
  email: string;
  displayName: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string;
  expiresAt?: string;
  scopes: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GoogleDriveFileMetadata {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  modifiedTime?: string;
  owners?: Array<{ emailAddress?: string }>;
  permissions?: DriveDocumentPermission[];
  parents?: string[];
  description?: string;
}

export interface GoogleDriveExportPayload {
  fileName: string;
  mimeType: string;
  contentBase64: string;
  parserType: string;
}

function getEncryptionKey() {
  const rawKey = process.env.DRIVE_TOKEN_ENCRYPTION_KEY ?? "";
  if (!rawKey) {
    throw new Error("Missing DRIVE_TOKEN_ENCRYPTION_KEY environment variable for token encryption.");
  }
  return crypto.createHash("sha256").update(rawKey, "utf8").digest();
}

function encodeBase64Url(value: string) {
  return value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string) {
  const pad = value.length % 4 === 0 ? value : value + "=".repeat(4 - (value.length % 4));
  return Buffer.from(pad.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function encryptValue(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptValue(payload: string) {
  const [ivB64, tagB64, encryptedB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !encryptedB64) {
    throw new Error("Invalid encrypted payload");
  }
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const encrypted = Buffer.from(encryptedB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

function encodeQueryParams(params: Record<string, string>) {
  return Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

export function buildGoogleDriveAuthUrl(state: string) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", GOOGLE_DRIVE_CLIENT_ID);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", OAUTH_SCOPES);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

export function isGoogleDriveAuthConfigured() {
  return Boolean(GOOGLE_DRIVE_CLIENT_ID && GOOGLE_DRIVE_CLIENT_SECRET);
}

export async function exchangeGoogleOAuthCode(code: string): Promise<GoogleOAuthTokens> {
  if (!GOOGLE_DRIVE_CLIENT_ID || !GOOGLE_DRIVE_CLIENT_SECRET) {
    throw new Error("Google Drive OAuth is not configured.");
  }

  const body = encodeQueryParams({
    code,
    client_id: GOOGLE_DRIVE_CLIENT_ID,
    client_secret: GOOGLE_DRIVE_CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: "authorization_code",
  });

  const response = await fetch(GOOGLE_OAUTH_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`OAuth token exchange failed: ${JSON.stringify(payload)}`);
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresIn: payload.expires_in,
    scope: payload.scope,
    tokenType: payload.token_type,
    idToken: payload.id_token,
  };
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<GoogleOAuthTokens> {
  if (!GOOGLE_DRIVE_CLIENT_ID || !GOOGLE_DRIVE_CLIENT_SECRET) {
    throw new Error("Google Drive OAuth is not configured.");
  }

  const body = encodeQueryParams({
    client_id: GOOGLE_DRIVE_CLIENT_ID,
    client_secret: GOOGLE_DRIVE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch(GOOGLE_OAUTH_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Google token refresh failed: ${JSON.stringify(payload)}`);
  }

  return {
    accessToken: payload.access_token,
    refreshToken: refreshToken,
    expiresIn: payload.expires_in,
    scope: payload.scope,
    tokenType: payload.token_type,
    idToken: payload.id_token,
  };
}

export async function fetchGoogleUserInfo(accessToken: string) {
  const response = await fetch(GOOGLE_OAUTH_USERINFO_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Google userinfo fetch failed: ${detail}`);
  }

  return response.json() as Promise<{ sub: string; email: string; name: string; picture?: string }>;
}

export async function fetchDriveFileMetadata(accessToken: string, fileId: string) {
  const fields = [
    "id",
    "name",
    "mimeType",
    "webViewLink",
    "modifiedTime",
    "permissions",
    "parents",
    "description",
    "owners",
  ].join(",");

  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(fields)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Drive metadata fetch failed: ${body}`);
  }

  return (await response.json()) as GoogleDriveFileMetadata;
}

export async function fetchGoogleDocsDocument(accessToken: string, documentId: string) {
  const response = await fetch(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Docs fetch failed: ${body}`);
  }

  return response.json();
}

export async function downloadDriveFileBytes(accessToken: string, fileId: string, exportMimeType?: string) {
  const isGoogleAppFile = Boolean(exportMimeType);
  const url = isGoogleAppFile
    ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(exportMimeType ?? "text/plain")}`
    : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Drive file download failed: ${body}`);
  }

  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

export function determineParserType(mimeType: string) {
  if (mimeType === "application/vnd.google-apps.document") return "googleDrive";
  if (mimeType === "application/pdf") return "pdf";
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword"
  ) {
    return "docx";
  }
  if (mimeType === "text/plain") return "plainText";
  if (mimeType === "text/markdown") return "markdown";
  if (mimeType === "text/html") return "html";
  if (mimeType === "text/csv") return "csv";
  if (mimeType === "application/json") return "json";
  if (mimeType === "application/vnd.google-apps.spreadsheet") return "html";
  if (mimeType === "application/vnd.google-apps.presentation") return "html";
  return "plainText";
}

export function chooseExportMimeType(mimeType: string) {
  if (mimeType === "application/vnd.google-apps.spreadsheet") return "text/csv";
  if (mimeType === "application/vnd.google-apps.presentation") return "text/plain";
  if (mimeType === "application/vnd.google-apps.document") return "text/plain";
  return "";
}

export function mapGooglePermissions(permissions?: any[]): DriveDocumentPermission[] {
  if (!Array.isArray(permissions)) return [];
  return permissions.map((permission) => ({
    role: permission.role || "reader",
    emailAddress: permission.emailAddress,
    domain: permission.domain,
  }));
}

export async function getDriveFolderChildren(accessToken: string, folderId: string) {
  const children: GoogleDriveFileMetadata[] = [];
  let pageToken: string | undefined = undefined;
  do {
    const q = `\'${folderId}' in parents and trashed = false`;
    const endpoint = new URL("https://www.googleapis.com/drive/v3/files");
    endpoint.searchParams.set("q", q);
    endpoint.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,webViewLink,modifiedTime,owners,permissions,parents,description)");
    endpoint.searchParams.set("pageSize", "100");
    if (pageToken) endpoint.searchParams.set("pageToken", pageToken);

    const response = await fetch(endpoint.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Folder listing failed: ${body}`);
    }

    const payload = await response.json();
    children.push(...((payload.files ?? []) as GoogleDriveFileMetadata[]));
    pageToken = payload.nextPageToken;
  } while (pageToken);

  return children;
}

export async function createDriveWatchSubscription(
  accessToken: string,
  fileId: string,
  channelId: string,
  callbackUrl: string,
  token: string
) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/watch`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: channelId,
      type: "web_hook",
      address: callbackUrl,
      token,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Drive webhook registration failed: ${body}`);
  }

  return response.json();
}

export function buildDriveAccountPayload(account: {
  userId: string;
  googleAccountId: string;
  email: string;
  displayName: string;
  tokens: GoogleOAuthTokens;
}) {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + account.tokens.expiresIn * 1000).toISOString();
  return {
    id: `drive-account-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    legacy_id: `drive-account-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    user_legacy_id: account.userId,
    google_account_id: account.googleAccountId,
    email: account.email,
    display_name: account.displayName,
    access_token_encrypted: encryptValue(account.tokens.accessToken),
    refresh_token_encrypted: account.tokens.refreshToken ? encryptValue(account.tokens.refreshToken) : "",
    expires_at: expiresAt,
    scopes: account.tokens.scope.split(" "),
    active: true,
    created_at: now,
    updated_at: now,
  };
}

export async function saveDriveAccount(account: GoogleDriveAccount) {
  if (!supabaseAdmin) return account;
  const result = await supabaseAdmin.from("drive_accounts").upsert(account, { onConflict: "legacy_id" });
  if (result.error) {
    throw new Error(`Failed to save drive account: ${result.error.message}`);
  }
  return account;
}

export async function findDriveAccounts(userId: string) {
  if (!supabaseAdmin) return [];
  const { data, error } = await supabaseAdmin.from("drive_accounts").select("*").eq("user_legacy_id", userId).eq("active", true);
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as GoogleDriveAccount[];
}

export async function findDriveAccountById(accountId: string) {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin.from("drive_accounts").select("*").eq("legacy_id", accountId).single();
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? null) as GoogleDriveAccount | null;
}

export async function deactivateDriveAccount(accountId: string) {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from("drive_accounts")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("legacy_id", accountId)
    .select("*")
    .single();
  if (error) {
    throw new Error(error.message);
  }
  return data as GoogleDriveAccount;
}

export async function getValidAccessToken(account: GoogleDriveAccount) {
  const now = Date.now();
  const expiresAt = account.expiresAt ? new Date(account.expiresAt).getTime() : 0;
  if (expiresAt > now + 60000) {
    return decryptValue(account.accessTokenEncrypted);
  }

  if (!account.refreshTokenEncrypted) {
    throw new Error("Drive account refresh token is unavailable.");
  }

  const refreshToken = decryptValue(account.refreshTokenEncrypted);
  const tokens = await refreshGoogleAccessToken(refreshToken);
  account.accessTokenEncrypted = encryptValue(tokens.accessToken);
  account.expiresAt = new Date(Date.now() + tokens.expiresIn * 1000).toISOString();
  account.scopes = tokens.scope.split(" ");
  await saveDriveAccount(account);
  return tokens.accessToken;
}

export async function extractDriveExportPayload(accessToken: string, fileId: string, metadata: GoogleDriveFileMetadata) {
  const parserType = determineParserType(metadata.mimeType);
  const exportMimeType = chooseExportMimeType(metadata.mimeType);
  const bytes = await downloadDriveFileBytes(accessToken, fileId, exportMimeType);
  const base64 = Buffer.from(bytes).toString("base64");
  return {
    fileName: `${metadata.name || fileId}.${exportMimeType === "text/csv" ? "csv" : exportMimeType === "text/plain" ? "txt" : "bin"}`,
    mimeType: metadata.mimeType,
    contentBase64: base64,
    parserType,
  } as GoogleDriveExportPayload;
}

export function buildWebhookCallbackUrl() {
  return WEBHOOK_CALLBACK_URL;
}

export function getCallbackStateCookieName() {
  return "drive_oauth_state";
}

export function getDriveWebhookChannelToken(userId: string) {
  return `drive-${userId}-${crypto.randomBytes(8).toString("hex")}`;
}
