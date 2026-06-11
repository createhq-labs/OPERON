import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

import type { DriveDocumentReference, DriveDocumentPermission } from "@/core/operon";
import { canManageDrive } from "@/security/permissions";
import {
  getUsers as getAllUsers,
  getDriveDocumentById,
  getDriveDocuments,
  getDocuments,
  saveActivity,
  saveDriveDocumentReference,
  updateDriveDocumentSyncMetadata,
} from "@/services/api";
import {
  buildGoogleDriveAuthUrl,
  buildWebhookCallbackUrl,
  createDriveWatchSubscription,
  deactivateDriveAccount,
  determineParserType,
  encryptValue,
  exchangeGoogleOAuthCode,
  extractDriveExportPayload,
  fetchDriveFileMetadata,
  fetchGoogleDocsDocument,
  fetchGoogleUserInfo,
  findDriveAccounts,
  getCallbackStateCookieName,
  getDriveFolderChildren,
  getValidAccessToken,
  isGoogleDriveAuthConfigured,
  mapGooglePermissions,
  saveDriveAccount,
} from "@/services/googleDriveClient";
import {
  enqueueIngestionJob,
  getIngestionJobs,
  startIngestionWorker,
} from "@/services/ingestion";
import { getSearchIndexVersion } from "@/services/search/sync";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader.split(";").map((segment) => {
      const [key, ...rest] = segment.trim().split("=");
      return [key, rest.join("=")];
    })
  );
}

function decodeJwt(token: string): Record<string, unknown> | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  try {
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function getUserIdFromRequest(request: NextRequest): string | null {
  const authHeader =
    request.headers.get("authorization") ??
    request.headers.get("Authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.replace(/^Bearer\s+/i, "")
    : undefined;
  const cookies = parseCookies(request.headers.get("cookie"));
  const token = bearerToken ?? cookies["sb-access-token"];
  if (!token) return null;
  const payload = decodeJwt(token);
  if (!payload) return null;
  const exp = payload.exp as number | undefined;
  if (exp && Date.now() / 1000 > exp) return null;
  return (payload.sub ?? payload.user_id ?? null) as string | null;
}

async function getCurrentDriveAccount(
  request: NextRequest,
  accountId?: string
) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return null;
  const accounts = await findDriveAccounts(userId);
  if (!accounts.length) return null;
  if (accountId) {
    return accounts.find((a) => a.legacyId === accountId) ?? accounts[0];
  }
  return accounts[0];
}

/**
 * Resolves the authenticated Operon user from the request.
 * Returns null if the session is missing or the user is not found.
 */
async function getAuthenticatedUser(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return null;
  const users = getAllUsers?.() ?? [];
  return (
    users.find(
      (u: { id: string; auth_user_id?: string }) =>
        u.id === userId || u.auth_user_id === userId
    ) ?? null
  );
}

/**
 * Asserts that the caller has Drive management permissions.
 * Logs the denial as a SYSTEM_EVENT and returns an error response when access
 * is denied, so the caller can return it immediately.
 */
async function assertDriveManagementPermission(
  request: NextRequest,
  context: { targetId?: string; meta?: Record<string, string> } = {}
): Promise<{ denied: true; response: NextResponse } | { denied: false; userId: string }> {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return { denied: true, response: buildErrorResponse("Unauthorized: missing session", 401) };
  }
  const user = await getAuthenticatedUser(request);
  if (!user || !canManageDrive(user)) {
    await saveActivity({
      id: generateId("activity"),
      userId: userId ?? "unknown",
      action: "SYSTEM_EVENT",
      targetType: "system",
      targetId: context.targetId,
      timestamp: new Date().toISOString(),
      metadata: { reason: "insufficient_permissions", ...context.meta },
    });
    return {
      denied: true,
      response: buildErrorResponse(
        "Your role does not have permission to manage Drive",
        403
      ),
    };
  }
  return { denied: false, userId };
}

function buildErrorResponse(message: string, status = 400): NextResponse {
  return NextResponse.json(
    { success: false, message, error: message } satisfies ApiResponse,
    { status }
  );
}

function buildSuccessResponse(data: unknown = null): NextResponse {
  return NextResponse.json({ success: true, data } satisfies ApiResponse);
}

/** Strips internal-only fields before sending drive documents to the client. */
function buildSafeDriveDocument(document: DriveDocumentReference) {
  const { permissionSummary, ...rest } = document;
  return { ...rest, permissionSummary };
}

/** Generates a prefixed, crypto-random ID. */
function generateId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function createDocumentPayloadFromMetadata(
  userId: string,
  payload: Record<string, unknown>,
  fileMetadata: Record<string, unknown>,
  permissionSummary: DriveDocumentPermission[]
): Promise<DriveDocumentReference> {
  const now = new Date().toISOString();
  return {
    id: generateId("drive"),
    title:
      (payload.title as string) ||
      (fileMetadata.name as string) ||
      "Google Drive document",
    description:
      (payload.description as string) ||
      (fileMetadata.description as string) ||
      "Linked Google Drive content",
    departmentId: payload.departmentId as import("@/core/types").DeptId,
    dept: payload.departmentId as string,
    tag: payload.tag as import("@/core/types").DocTag,
    allowedRoleIds: payload.allowedRoleIds as string[],
    allowedUserTypes: payload.allowedUserTypes as import("@/core/types").UserType[],
    allowedDepartments: payload.allowedDepartments as import("@/core/types").DeptId[],
    allowedTeamIds: payload.allowedTeamIds as string[],
    visibilityScope: (payload.visibilityScope as import("@/core/types").VisibilityScope) || "department",
    globalPinned: false,
    mandatoryRead: false,
    broadcastAudience: "none",
    broadcastRoleIds: [],
    broadcastDepartmentIds: [],
    readTime: "1 min",
    authorId: payload.authorId as string,
    author: payload.authorId as string,
    createdById: payload.authorId as string,
    updatedAt: now,
    updatedById: payload.authorId as string,
    version: "v1.0",
    pinned: false,
    source: "google_drive",
    sourceProvider: "googleDrive",
    lifecycleState: "uploaded",
    driveFileId: payload.driveFileId as string,
    googleDocId: payload.googleDocId as string,
    webViewLink: payload.driveUrl as string,
    fileMimeType: payload.fileMimeType as string,
    ownerEmail: payload.ownerEmail as string,
    folderId: payload.folderId as string,
    folderName: payload.folderName as string,
    linkedDocumentId: payload.linkedDocumentId as string,
    uploadedBy: (payload.uploadedBy ?? payload.authorId) as string,
    driveUrl: payload.driveUrl as string,
    permissionSummary,
    syncStatus: "pending",
    lastSyncedAt: now,
    lastDriveModifiedAt: (fileMetadata.modifiedTime as string) || now,
    lastDriveCreatedAt: (fileMetadata.createdTime as string) || now,
    extractedText: undefined,
    parsedBlocks: [],
    parserStatus: "pending",
    parserVersion: "1.0",
  };
}

/**
 * Re-syncs a single Drive document: refreshes Drive metadata, re-enqueues
 * ingestion, and transitions the document from "pending/stale/failed" to
 * "syncing" (or "synced" in local-fallback mode).
 */
async function resyncDriveDocument(
  document: DriveDocumentReference,
  userId: string,
  account: Awaited<ReturnType<typeof getCurrentDriveAccount>>,
  localMode: boolean
): Promise<"syncing" | "synced"> {
  const now = new Date().toISOString();
  updateDriveDocumentSyncMetadata(document.id, {
    syncStatus: "syncing",
    lastSyncedAt: now,
    updatedById: userId,
  });

  if (localMode || !account) {
    updateDriveDocumentSyncMetadata(document.id, {
      syncStatus: "synced",
      lastSyncedAt: now,
      lastDriveModifiedAt: document.lastDriveModifiedAt || now,
      updatedAt: now,
      updatedById: userId,
    });
    await startIngestionWorker();
    return "synced";
  }

  const accessToken = await getValidAccessToken(account);
  const metadata = await fetchDriveFileMetadata(accessToken, document.driveFileId);

  updateDriveDocumentSyncMetadata(document.id, {
    lastSyncedAt: now,
    lastDriveModifiedAt: metadata.modifiedTime || now,
    lastDriveCreatedAt: metadata.createdTime || document.lastDriveCreatedAt,
    updatedAt: now,
    updatedById: userId,
  });

  if (metadata.mimeType !== "application/vnd.google-apps.folder") {
    const parserType = determineParserType(metadata.mimeType);
    const rawPayload =
      metadata.mimeType === "application/vnd.google-apps.document"
        ? await fetchGoogleDocsDocument(accessToken, metadata.id)
        : await extractDriveExportPayload(accessToken, metadata.id, metadata);

    enqueueIngestionJob({
      documentId: document.id,
      sourceType: "googleDrive",
      parserType,
      sourceUrl: document.driveUrl,
      fileName: metadata.name,
      mimeType: metadata.mimeType,
      metadata: {
        departmentId: document.departmentId,
        tags: [document.tag],
        authorId: document.authorId,
      },
      rawPayload,
    });
    // Ingestion worker transitions the doc to "synced" or "failed" on completion.
    return "syncing";
  }

  updateDriveDocumentSyncMetadata(document.id, {
    syncStatus: "synced",
    lastSyncedAt: now,
    updatedAt: now,
  });
  return "synced";
}

/** Documents that require an incremental sync pass. */
function needsIncrementalSync(document: DriveDocumentReference): boolean {
  return (
    document.syncStatus === "pending" ||
    document.syncStatus === "stale" ||
    document.syncStatus === "failed"
  );
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const action = request.nextUrl.searchParams.get("action");
  if (!action) return buildErrorResponse("Missing action parameter", 404);

  // -- status ----------------------------------------------------------------
  if (action === "status") {
    const localMode = !isGoogleDriveAuthConfigured();
    if (localMode) {
      return buildSuccessResponse({
        connected: true,
        provider: "local",
        message: "Local enterprise Drive fallback is active.",
        accounts: [],
      });
    }

    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return buildErrorResponse("Unauthorized: missing session", 401);
    }

    const accounts = await findDriveAccounts(userId);
    return buildSuccessResponse({
      connected: accounts.length > 0,
      provider: "google",
      message: "Google Drive connector status retrieved.",
      accounts: accounts.map((account) => ({
        id: account.legacyId,
        googleAccountId: account.googleAccountId,
        email: account.email,
        displayName: account.displayName,
        scopes: account.scopes,
        active: account.active,
        expiresAt: account.expiresAt,
        updatedAt: account.updatedAt,
      })),
    });
  }

  // -- diagnostics (admin only) ----------------------------------------------
  if (action === "diagnostics") {
    const guard = await assertDriveManagementPermission(request);
    if (guard.denied) return guard.response;

    const localMode = !isGoogleDriveAuthConfigured();
    const jobs = getIngestionJobs();
    const documents = getDocuments();

    return buildSuccessResponse({
      activeProvider: localMode ? "LocalDriveProvider" : "GoogleDriveProvider",
      providerMode: localMode ? "local" : "google",
      status: localMode ? "local" : "connected",
      ingestion: {
        total: jobs.length,
        queued: jobs.filter(
          (j) => j.status === "queued" || j.status === "retrying"
        ).length,
        processing: jobs.filter((j) => j.status === "processing").length,
        retrying: jobs.filter((j) => j.status === "retrying").length,
        failed: jobs.filter((j) => j.status === "failed").length,
      },
      parser: {
        pending: documents.filter((d) => d.parserStatus === "pending").length,
        parsed: documents.filter((d) => d.parserStatus === "parsed").length,
        failed: documents.filter((d) => d.parserStatus === "failed").length,
      },
      indexingVersion: getSearchIndexVersion(),
    });
  }

  // -- docs ------------------------------------------------------------------
  if (action === "docs") {
    const documentId = request.nextUrl.searchParams.get("docId");
    if (!documentId) return buildErrorResponse("Missing docId parameter", 400);

    const localMode = !isGoogleDriveAuthConfigured();
    if (localMode) {
      const document = getDriveDocumentById(documentId);
      if (!document) return buildErrorResponse("Drive document not found", 404);
      return buildSuccessResponse({
        documentId: document.id,
        title: document.title,
        body: {
          content: [
            {
              type: "paragraph",
              paragraph: {
                elements: [
                  {
                    type: "textRun",
                    textRun: { content: document.description || document.title },
                  },
                ],
              },
            },
          ],
        },
      });
    }

    const account = await getCurrentDriveAccount(request);
    if (!account) {
      return buildErrorResponse(
        "Unauthorized: no connected Drive account available",
        401
      );
    }
    const accessToken = await getValidAccessToken(account);
    const googleDoc = await fetchGoogleDocsDocument(accessToken, documentId);
    return buildSuccessResponse(googleDoc);
  }

  // -- callback (OAuth redirect) ---------------------------------------------
  if (action === "callback") {
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    const cookieState = request.cookies.get(getCallbackStateCookieName())?.value;

    if (!code || !state || !cookieState || state !== cookieState) {
      return buildErrorResponse("Invalid OAuth callback state", 400);
    }

    const tokens = await exchangeGoogleOAuthCode(code);
    const userInfo = await fetchGoogleUserInfo(tokens.accessToken);
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return buildErrorResponse(
        "Unauthorized: user session required for Drive connect",
        401
      );
    }

    await saveDriveAccount({
      id: generateId("drive-account"),
      legacyId: generateId("drive-account"),
      userId,
      googleAccountId: userInfo.sub,
      email: userInfo.email,
      displayName: userInfo.name,
      tokens,
      accessTokenEncrypted: encryptValue(tokens.accessToken),
      refreshTokenEncrypted: tokens.refreshToken
        ? encryptValue(tokens.refreshToken)
        : "",
      expiresAt: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
      scopes: tokens.scope.split(" "),
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as Parameters<typeof saveDriveAccount>[0]);

    const html = `<!DOCTYPE html><html><body><script>
      window.opener?.postMessage(
        { type: 'drive-auth-result', connected: true, message: 'Google Drive connected.' },
        window.origin
      );
      window.close();
    </script></body></html>`;

    const response = new NextResponse(html, {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
    response.cookies.delete(getCallbackStateCookieName());
    return response;
  }

  return buildErrorResponse(`Unsupported GET action: ${action}`, 404);
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  const action = request.nextUrl.searchParams.get("action");
  if (!action) return buildErrorResponse("Missing action parameter", 404);

  const body: Record<string, unknown> = await request.json().catch(() => ({}));

  // -- auth (initiate OAuth) -------------------------------------------------
  if (action === "auth") {
    const guard = await assertDriveManagementPermission(request, {
      meta: { event: "drive_auth_attempt" },
    });
    if (guard.denied) return guard.response;

    if (!isGoogleDriveAuthConfigured()) {
      return buildSuccessResponse({
        connected: true,
        provider: "local",
        message: "Local enterprise Drive fallback is active.",
      });
    }

    const state = crypto.randomBytes(16).toString("hex");
    const authUrl = buildGoogleDriveAuthUrl(state);
    const response = NextResponse.json({ success: true, authUrl });
    response.cookies.set(getCallbackStateCookieName(), state, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/api/drive",
      maxAge: 300,
    });
    return response;
  }

  // -- attach (link a Drive file or folder) ----------------------------------
  if (action === "attach") {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return buildErrorResponse("Unauthorized: missing session", 401);
    }

    const localMode = !isGoogleDriveAuthConfigured();
    const account = localMode
      ? null
      : await getCurrentDriveAccount(request, body.accountId as string);

    if (!localMode && !account) {
      return buildErrorResponse("No connected Drive account found", 401);
    }

    const fileId = (body.driveFileId ?? body.googleDocId) as string | undefined;
    if (!fileId) {
      return buildErrorResponse("Missing Drive file identifier", 400);
    }

    const metadata: Record<string, unknown> = localMode
      ? {
          id: fileId,
          name: body.title ?? "Local Drive document",
          mimeType: body.fileMimeType,
          webViewLink: body.driveUrl,
          modifiedTime: new Date().toISOString(),
          permissions: [],
          description: body.description,
          owners: [{ emailAddress: body.ownerEmail }],
        }
      : await fetchDriveFileMetadata(
          await getValidAccessToken(account!),
          fileId
        ) as unknown as Record<string, unknown>;

    const permissions = mapGooglePermissions(
      (metadata.permissions as Array<{ role?: string; emailAddress?: string; domain?: string }>) ?? []
    );
    const document = await createDocumentPayloadFromMetadata(
      userId,
      body,
      metadata,
      permissions
    );
    saveDriveDocumentReference(document);

    if (metadata.mimeType === "application/vnd.google-apps.folder") {
      if (localMode) {
        await startIngestionWorker();
      } else {
        const accessToken = await getValidAccessToken(account!);
        const children = await getDriveFolderChildren(accessToken, fileId);

        for (const child of children) {
          if (!child.id || !child.mimeType) continue;
          const childPermissions = mapGooglePermissions(child.permissions ?? []);
          const childDoc = await createDocumentPayloadFromMetadata(
            userId,
            {
              title: child.name,
              description: `Synced from folder ${body.title as string}`,
              departmentId: body.departmentId,
              authorId: body.authorId,
              tag: body.tag,
              allowedRoleIds: body.allowedRoleIds,
              allowedUserTypes: body.allowedUserTypes,
              allowedDepartments: body.allowedDepartments,
              allowedTeamIds: body.allowedTeamIds,
              visibilityScope: body.visibilityScope,
              driveUrl: child.webViewLink,
              driveFileId: child.id,
              googleDocId: child.id,
              fileMimeType: child.mimeType,
              ownerEmail: body.ownerEmail,
              folderId: fileId,
              folderName: body.folderName,
              linkedDocumentId: body.linkedDocumentId,
            },
            child as unknown as Record<string, unknown>,
            childPermissions
          );
          saveDriveDocumentReference(childDoc);

          if (child.mimeType !== "application/vnd.google-apps.folder") {
            const childParserType = determineParserType(child.mimeType);
            const childPayload =
              child.mimeType === "application/vnd.google-apps.document"
                ? await fetchGoogleDocsDocument(accessToken, child.id)
                : await extractDriveExportPayload(accessToken, child.id, child);

            enqueueIngestionJob({
              documentId: childDoc.id,
              sourceType: "googleDrive",
              parserType: childParserType,
              sourceUrl: childDoc.driveUrl,
              fileName: child.name,
              mimeType: child.mimeType,
              metadata: {
                departmentId: body.departmentId as string,
                tags: [body.tag as string],
                authorId: body.authorId as string,
              },
              rawPayload: childPayload,
            });
          }
        }
      }
    } else {
      if (!localMode) {
        const accessToken = await getValidAccessToken(account!);
        const parserType = determineParserType(metadata.mimeType as string);
        const rawPayload =
          metadata.mimeType === "application/vnd.google-apps.document"
            ? await fetchGoogleDocsDocument(accessToken, fileId)
            : await extractDriveExportPayload(
                accessToken,
                fileId,
                metadata as unknown as import("@/services/googleDriveClient").GoogleDriveFileMetadata
              );

        enqueueIngestionJob({
          documentId: document.id,
          sourceType: "googleDrive",
          parserType,
          sourceUrl: document.driveUrl,
          fileName: metadata.name as string,
          mimeType: metadata.mimeType as string,
          metadata: {
            departmentId: body.departmentId as string,
            tags: [body.tag as string],
            authorId: body.authorId as string,
          },
          rawPayload,
        });
      } else {
        await startIngestionWorker();
      }
    }

    await saveActivity({
      id: generateId("activity"),
      userId,
      action: "DOCUMENT_CREATED",
      targetType: "document",
      targetId: document.id,
      timestamp: new Date().toISOString(),
      metadata: {
        fileId,
        source: metadata.mimeType as string,
        syncStatus: document.syncStatus,
      },
    });

    return buildSuccessResponse(buildSafeDriveDocument(document));
  }

  // -- refresh (re-sync a single document) -----------------------------------
  if (action === "refresh") {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return buildErrorResponse("Unauthorized: missing session", 401);
    }

    const documentId = body.documentId as string | undefined;
    if (!documentId) return buildErrorResponse("Missing documentId", 400);

    const document = getDriveDocumentById(documentId);
    if (!document) return buildErrorResponse("Drive document not found", 404);

    const localMode = !isGoogleDriveAuthConfigured();
    if (localMode) {
      const now = new Date().toISOString();
      updateDriveDocumentSyncMetadata(document.id, {
        lastSyncedAt: now,
        lastDriveModifiedAt: document.updatedAt || now,
        syncStatus: "synced",
        updatedAt: now,
        updatedById: userId,
      });
      await startIngestionWorker();
      return buildSuccessResponse({
        documentId: document.id,
        syncStatus: "synced",
      });
    }

    const account = await getCurrentDriveAccount(request);
    if (!account) {
      return buildErrorResponse("No connected Drive account found", 401);
    }

    const accessToken = await getValidAccessToken(account);
    const metadata = await fetchDriveFileMetadata(
      accessToken,
      document.driveFileId
    );
    const now = new Date().toISOString();

    updateDriveDocumentSyncMetadata(document.id, {
      lastSyncedAt: now,
      lastDriveModifiedAt: metadata.modifiedTime || now,
      syncStatus: "synced",
      updatedAt: now,
      updatedById: userId,
    });

    if (metadata.mimeType === "application/vnd.google-apps.document") {
      const rawPayload = await fetchGoogleDocsDocument(
        accessToken,
        metadata.id
      );
      enqueueIngestionJob({
        documentId: document.id,
        sourceType: "googleDrive",
        parserType: "googleDrive",
        sourceUrl: document.driveUrl,
        fileName: metadata.name,
        mimeType: metadata.mimeType,
        metadata: {
          departmentId: document.departmentId,
          tags: [document.tag],
          authorId: document.authorId,
        },
        rawPayload,
      });
    }

    return buildSuccessResponse({ documentId: document.id, syncStatus: "synced" });
  }

  // -- sync (batch sync) -----------------------------------------------------
  if (action === "sync") {
    const guard = await assertDriveManagementPermission(request, {
      meta: { mode: body.mode as string },
    });
    if (guard.denied === true) return guard.response;

    const userId = guard.userId;
    const mode =
      (body.mode as "manual" | "incremental" | "full") ?? "manual";
    const localMode = !isGoogleDriveAuthConfigured();
    const account = localMode
      ? null
      : await getCurrentDriveAccount(request, body.accountId as string);

    if (!localMode && !account) {
      return buildErrorResponse("No connected Drive account found", 401);
    }

    if (mode === "manual") {
      const documentId = body.documentId as string | undefined;
      const document = documentId
        ? getDriveDocumentById(documentId)
        : undefined;
      if (!document) {
        return buildErrorResponse(
          "Drive document not found for manual sync",
          404
        );
      }
      const status = await resyncDriveDocument(
        document,
        userId,
        account,
        localMode
      );
      await saveActivity({
        id: generateId("activity"),
        userId,
        action: "SYSTEM_EVENT",
        targetType: "document",
        targetId: document.id,
        timestamp: new Date().toISOString(),
        metadata: { mode, syncStatus: status },
      });
      return buildSuccessResponse({
        mode,
        synced: 1,
        documents: [{ id: document.id, syncStatus: status }],
      });
    }

    const allDriveDocuments = getDriveDocuments();
    const targets =
      mode === "incremental"
        ? allDriveDocuments.filter(needsIncrementalSync)
        : allDriveDocuments;

    const results: Array<{ id: string; syncStatus: string }> = [];
    for (const document of targets) {
      try {
        const status = await resyncDriveDocument(
          document,
          userId,
          account,
          localMode
        );
        results.push({ id: document.id, syncStatus: status });
      } catch {
        updateDriveDocumentSyncMetadata(document.id, {
          syncStatus: "failed",
          lastSyncedAt: new Date().toISOString(),
        });
        results.push({ id: document.id, syncStatus: "failed" });
      }
    }

    await saveActivity({
      id: generateId("activity"),
      userId,
      action: "SYSTEM_EVENT",
      targetType: "system",
      timestamp: new Date().toISOString(),
      metadata: {
        event: "drive_sync",
        mode,
        count: String(results.length),
        successCount: String(
          results.filter((r) => r.syncStatus === "synced").length
        ),
      },
    });

    return buildSuccessResponse({
      mode,
      synced: results.length,
      documents: results,
    });
  }

  // -- register (subscribe a file to webhook) --------------------------------
  if (action === "register") {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return buildErrorResponse("Unauthorized: missing session", 401);
    }

    const fileId = body.driveFileId as string | undefined;
    if (!fileId) return buildErrorResponse("Missing driveFileId", 400);

    const account = await getCurrentDriveAccount(
      request,
      body.accountId as string
    );
    if (!account) {
      return buildErrorResponse("No connected Drive account found", 401);
    }

    const accessToken = await getValidAccessToken(account);
    const channelId = generateId("drive-webhook");
    const subscription = await createDriveWatchSubscription(
      accessToken,
      fileId,
      channelId,
      buildWebhookCallbackUrl(),
      userId
    );
    return buildSuccessResponse({ subscription });
  }

  // -- disconnect ------------------------------------------------------------
  if (action === "disconnect") {
    const guard = await assertDriveManagementPermission(request, {
      targetId: body.accountId as string,
    });
    if (guard.denied === true) return guard.response;

    const userId = guard.userId;
    const accountId = body.accountId as string | undefined;
    if (!accountId) return buildErrorResponse("Missing accountId", 400);

    try {
      const disconnected = await deactivateDriveAccount(accountId);
      await saveActivity({
        id: generateId("activity"),
        userId,
        action: "SYSTEM_EVENT",
        targetType: "system",
        targetId: accountId,
        timestamp: new Date().toISOString(),
        metadata: {
          event: "drive_account_disconnected",
          success: String(!!disconnected),
        },
      });
      return buildSuccessResponse({ accountId, disconnected: !!disconnected });
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Disconnect failed";
      await saveActivity({
        id: generateId("activity"),
        userId,
        action: "SYSTEM_EVENT",
        targetType: "system",
        targetId: accountId,
        timestamp: new Date().toISOString(),
        metadata: { error: errorMsg },
      });
      return buildErrorResponse(errorMsg, 500);
    }
  }

  // -- webhook (inbound Drive change notification) ---------------------------
  if (action === "webhook") {
    const resourceUri =
      (request.headers.get("x-goog-resource-uri") as string) ??
      (body.resourceUri as string);
    const resourceId =
      (request.headers.get("x-goog-resource-id") as string) ??
      (body.resourceId as string);
    const channelId =
      (request.headers.get("x-goog-channel-id") as string) ??
      (body.channelId as string);
    const resourceState =
      (request.headers.get("x-goog-resource-state") as string) ??
      (body.resourceState as string);

    if (!resourceUri || !resourceId) {
      return NextResponse.json(
        { success: false, message: "Webhook missing required headers." },
        { status: 400 }
      );
    }

    const match = resourceUri.match(/\/files\/([^/?]+)/);
    const fileId = match?.[1];
    if (!fileId) {
      // Sync notifications for non-file resources are acknowledged silently.
      return buildSuccessResponse(null);
    }

    try {
      const userId = getUserIdFromRequest(request);
      const account = userId
        ? await getCurrentDriveAccount(request)
        : null;

      if (account) {
        const accessToken = await getValidAccessToken(account);
        const metadata = await fetchDriveFileMetadata(accessToken, fileId);
        const permissions = mapGooglePermissions(
          metadata.permissions ?? []
        );
        const document = getDriveDocuments().find(
          (doc) => doc.driveFileId === fileId
        );

        if (document) {
          saveDriveDocumentReference({
            ...document,
            permissionSummary: permissions,
            lastDriveModifiedAt:
              metadata.modifiedTime || document.lastDriveModifiedAt,
            syncStatus: "pending",
            updatedAt: new Date().toISOString(),
            driveUrl: metadata.webViewLink || document.driveUrl,
          });

          if (
            metadata.mimeType === "application/vnd.google-apps.document"
          ) {
            const rawPayload = await fetchGoogleDocsDocument(
              accessToken,
              fileId
            );
            enqueueIngestionJob({
              documentId: document.id,
              sourceType: "googleDrive",
              parserType: "googleDrive",
              sourceUrl: document.driveUrl,
              fileName: metadata.name,
              mimeType: metadata.mimeType,
              metadata: {
                departmentId: document.departmentId,
                tags: [document.tag],
                authorId: document.authorId,
              },
              rawPayload,
            });
          } else if (
            metadata.mimeType !== "application/vnd.google-apps.folder"
          ) {
            // Binary/export-able formats (PDF, DOCX, XLSX, etc.)
            const parserType = determineParserType(metadata.mimeType);
            const rawPayload = await extractDriveExportPayload(
              accessToken,
              fileId,
              metadata
            );
            enqueueIngestionJob({
              documentId: document.id,
              sourceType: "googleDrive",
              parserType,
              sourceUrl: document.driveUrl,
              fileName: metadata.name,
              mimeType: metadata.mimeType,
              metadata: {
                departmentId: document.departmentId,
                tags: [document.tag],
                authorId: document.authorId,
              },
              rawPayload,
            });
          }
        }
      }
    } catch (err) {
      // Webhook errors must not return 4xx/5xx — Google will retry indefinitely.
      // Log the failure and acknowledge.
      console.error("[drive/webhook] Sync error:", err);
    }

    return buildSuccessResponse({ resourceId, channelId, resourceState });
  }

  return buildErrorResponse(`Unsupported POST action: ${action}`, 404);
}