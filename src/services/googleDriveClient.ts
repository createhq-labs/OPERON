import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { DriveDocumentPermission } from "@/core/operon";

const GOOGLE_DRIVE_CLIENT_ID = process.env.GOOGLE_DRIVE_CLIENT_ID ?? "";
const GOOGLE_DRIVE_CLIENT_SECRET = process.env.GOOGLE_DRIVE_CLIENT_SECRET ?? "";
const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";
const REDIRECT_URI =
  process.env.GOOGLE_DRIVE_REDIRECT_URI ??
  process.env.NEXT_PUBLIC_GOOGLE_OAUTH_REDIRECT_URI ??
  (APP_BASE_URL ? `${APP_BASE_URL}/api/drive?action=callback` : "");
const WEBHOOK_CALLBACK_URL =
  process.env.GOOGLE_DRIVE_WEBHOOK_CALLBACK_URL ??
  (APP_BASE_URL ? `${APP_BASE_URL}/api/drive?action=webhook` : "");
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
  createdTime?: string;
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
  return Boolean(GOOGLE_DRIVE_CLIENT_ID && GOOGLE_DRIVE_CLIENT_SECRET && REDIRECT_URI);
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
    "createdTime",
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

interface GooglePermissionEntry {
  role?: string;
  emailAddress?: string;
  domain?: string;
}

export function mapGooglePermissions(permissions?: GooglePermissionEntry[]): DriveDocumentPermission[] {
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
    endpoint.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,webViewLink,modifiedTime,createdTime,owners,permissions,parents,description)");
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
  token: string,
  expiration?: number
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
      ...(expiration !== undefined ? { expiration: String(expiration) } : {}),
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
}, existingId?: string, existingLegacyId?: string) {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + account.tokens.expiresIn * 1000).toISOString();
  return {
    id: existingId ?? `drive-account-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    legacy_id: existingLegacyId ?? `drive-account-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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

/**
 * Maps a database row (snake_case) to the GoogleDriveAccount interface (camelCase).
 */
function mapSupabaseToDriveAccount(row: any): GoogleDriveAccount {
  return {
    id: row.id,
    legacyId: row.legacy_id,
    userId: row.user_legacy_id,
    googleAccountId: row.google_account_id,
    email: row.email,
    displayName: row.display_name,
    accessTokenEncrypted: row.access_token_encrypted,
    refreshTokenEncrypted: row.refresh_token_encrypted,
    expiresAt: row.expires_at,
    scopes: row.scopes || [],
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createUpsertPayload(account: any) {
  return { ...account, legacy_id: account.id };
}

export async function saveDriveAccount(account: GoogleDriveAccount) {
  if (!supabaseAdmin) return account;
  const payload = buildDriveAccountPayload({
    userId: account.userId,
    googleAccountId: account.googleAccountId,
    email: account.email,
    displayName: account.displayName,
    tokens: {
      accessToken: decryptValue(account.accessTokenEncrypted),
      refreshToken: account.refreshTokenEncrypted ? decryptValue(account.refreshTokenEncrypted) : undefined,
      expiresIn: account.expiresAt ? Math.floor((new Date(account.expiresAt).getTime() - Date.now()) / 1000) : 3600,
      scope: account.scopes.join(" "),
      tokenType: "Bearer"
    }
  }, account.id, account.legacyId);
  
  const result = await supabaseAdmin.from("drive_accounts").upsert(payload, { onConflict: "legacy_id" });
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
  return (data ?? []).map(mapSupabaseToDriveAccount);
}

export async function findDriveAccountById(accountId: string) {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin.from("drive_accounts").select("*").eq("legacy_id", accountId).single();
  if (error) {
    throw new Error(error.message);
  }
  if (!data) return null;
  return mapSupabaseToDriveAccount(data);
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
  return mapSupabaseToDriveAccount(data);
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

// ─── Google API Client Adapter ───────────────────────────────────────────────
//
// Lightweight adapter that exposes a subset of the Google Drive REST API using
// the same interface shape as the `googleapis` npm package. This allows
// providers that were written against the googleapis SDK to call through this
// module without importing the full SDK (which would bloat the server bundle).
//
// Supported surface:
//   client.files.get(params)           → GET /drive/v3/files/:fileId
//   client.files.watch(params)         → POST /drive/v3/files/:fileId/watch
//   client.channels.stop(params)       → POST /drive/v3/channels/stop
//
// Access tokens are resolved lazily via supabaseAdmin on the first call that
// requires authentication.  The client is stateless — re-create as needed.

interface ApiResponse<T> {
  data: T;
  status: number;
}

interface FilesGetParams {
  fileId: string;
  fields?: string;
}

interface FilesWatchParams {
  fileId: string;
  requestBody: {
    id: string;
    type: string;
    address: string;
    expiration?: string;
    token?: string;
  };
}

interface ChannelsStopParams {
  requestBody: {
    id: string;
    resourceId: string;
  };
}

export interface GoogleDriveClientAdapter {
  files: {
    get(params: FilesGetParams): Promise<ApiResponse<Record<string, unknown>>>;
    watch(params: FilesWatchParams): Promise<ApiResponse<{
      id?: string;
      resourceId?: string;
      expiration?: string;
    }>>;
  };
  channels: {
    stop(params: ChannelsStopParams): Promise<ApiResponse<void>>;
  };
}

/**
 * Returns a lightweight Google Drive REST client adapter.
 *
 * This adapter requires a valid access token to be supplied via the
 * `accessToken` parameter before calling any authenticated methods.
 * If `accessToken` is omitted, individual method calls will throw unless
 * the operation does not require authentication.
 *
 * Usage:
 *   const client = getGoogleDriveClient(accessToken);
 *   const file = await client.files.get({ fileId, fields: "id,name" });
 */
export function getGoogleDriveClient(accessToken?: string): GoogleDriveClientAdapter {
  function requireToken(): string {
    if (!accessToken) {
      throw new Error(
        "getGoogleDriveClient: accessToken is required for authenticated API calls. " +
        "Retrieve a valid token via getValidAccessToken() and pass it to getGoogleDriveClient()."
      );
    }
    return accessToken;
  }

  return {
    files: {
      async get(params: FilesGetParams): Promise<ApiResponse<Record<string, unknown>>> {
        const token = requireToken();
        const fieldsParam = params.fields ? `?fields=${encodeURIComponent(params.fields)}` : "";
        const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(params.fileId)}${fieldsParam}`;
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          const detail = await response.text().catch(() => response.statusText);
          throw new Error(`Drive files.get failed (${response.status}): ${detail}`);
        }
        const data = (await response.json()) as Record<string, unknown>;
        return { data, status: response.status };
      },

      async watch(params: FilesWatchParams): Promise<ApiResponse<{ id?: string; resourceId?: string; expiration?: string }>> {
        const token = requireToken();
        const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(params.fileId)}/watch`;
        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(params.requestBody),
        });
        if (!response.ok) {
          const detail = await response.text().catch(() => response.statusText);
          throw new Error(`Drive files.watch failed (${response.status}): ${detail}`);
        }
        const data = (await response.json()) as { id?: string; resourceId?: string; expiration?: string };
        return { data, status: response.status };
      },
    },

    channels: {
      async stop(params: ChannelsStopParams): Promise<ApiResponse<void>> {
        const token = requireToken();
        const url = "https://www.googleapis.com/drive/v3/channels/stop";
        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(params.requestBody),
        });
        if (!response.ok) {
          const detail = await response.text().catch(() => response.statusText);
          throw new Error(`Drive channels.stop failed (${response.status}): ${detail}`);
        }
        return { data: undefined, status: response.status };
      },
    },
  };
}
