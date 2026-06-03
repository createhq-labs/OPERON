import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { decryptValue, encryptValue, buildGoogleDriveAuthUrl, exchangeGoogleOAuthCode, fetchDriveFileMetadata, fetchGoogleDocsDocument, fetchGoogleUserInfo, findDriveAccounts, getValidAccessToken, createDriveWatchSubscription, findDriveAccountById, deactivateDriveAccount, getCallbackStateCookieName, buildWebhookCallbackUrl, getDriveFolderChildren, determineParserType, extractDriveExportPayload, mapGooglePermissions, saveDriveAccount, isGoogleDriveAuthConfigured } from "@/services/googleDriveClient";
import { enqueueIngestionJob, getIngestionJobs, startIngestionWorker } from "@/services/ingestion";
import { saveDriveDocumentReference, updateDriveDocumentSyncMetadata, saveActivity, getDriveDocumentById, getDriveDocuments, getDocuments } from "@/services/api";
import { getSearchIndexVersion } from "@/services/search/sync";
import type { DriveDocumentReference, DriveDocumentPermission } from "@/core/operon";

function parseCookies(cookieHeader: string | null) {
  if (!cookieHeader) return {} as Record<string, string>;
  return Object.fromEntries(
    cookieHeader.split(";").map((segment) => {
      const [key, ...rest] = segment.trim().split("=");
      return [key, rest.join("=")];
    })
  );
}

function decodeJwt(token: string) {
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

function getUserIdFromRequest(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.replace(/^Bearer\s+/i, "") : undefined;
  const token = bearerToken || parseCookies(request.headers.get("cookie"))["sb-access-token"];
  if (!token) return null;
  const payload = decodeJwt(token);
  if (!payload) return null;
  if (payload.exp && Date.now() / 1000 > payload.exp) return null;
  return payload.sub || payload.user_id || null;
}

async function getCurrentDriveAccount(request: NextRequest, accountId?: string) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return null;
  const accounts = await findDriveAccounts(userId);
  if (!accounts.length) return null;
  if (accountId) {
    return accounts.find((account) => account.legacyId === accountId) ?? accounts[0];
  }
  return accounts[0];
}

function buildErrorResponse(message: string, status = 400) {
  return NextResponse.json({ success: false, message }, { status });
}

function safeJsonResponse(value: unknown) {
  return NextResponse.json(value, { status: 200 });
}

function buildSafeDriveDocument(document: DriveDocumentReference) {
  const { permissionSummary, ...rest } = document;
  return {
    ...rest,
    permissionSummary,
  };
}

async function createDocumentPayloadFromMetadata(
  userId: string,
  payload: Record<string, any>,
  fileMetadata: any,
  permissionSummary: DriveDocumentPermission[]
) {
  const now = new Date().toISOString();
  const document: DriveDocumentReference = {
    id: `drive-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: payload.title || fileMetadata.name || "Google Drive document",
    description: payload.description || fileMetadata.description || "Linked Google Drive content",
    departmentId: payload.departmentId,
    dept: payload.departmentId,
    tag: payload.tag,
    allowedRoleIds: payload.allowedRoleIds,
    allowedUserTypes: payload.allowedUserTypes,
    allowedDepartments: payload.allowedDepartments,
    allowedTeamIds: payload.allowedTeamIds,
    visibilityScope: payload.visibilityScope || "department",
    globalPinned: false,
    mandatoryRead: false,
    broadcastAudience: "none",
    broadcastRoleIds: [],
    broadcastDepartmentIds: [],
    readTime: "1 min",
    authorId: payload.authorId,
    author: payload.authorId,
    createdById: payload.authorId,
    updatedAt: now,
    updatedById: payload.authorId,
    version: "v1.0",
    pinned: false,
    source: "google_drive",
    sourceProvider: "googleDrive",
    lifecycleState: "uploaded",
    driveFileId: payload.driveFileId,
    googleDocId: payload.googleDocId,
    webViewLink: payload.driveUrl,
    fileMimeType: payload.fileMimeType,
    ownerEmail: payload.ownerEmail,
    folderId: payload.folderId,
    folderName: payload.folderName,
    linkedDocumentId: payload.linkedDocumentId,
    uploadedBy: payload.uploadedBy ?? payload.authorId,
    driveUrl: payload.driveUrl,
    permissionSummary,
    syncStatus: "pending",
    lastSyncedAt: now,
    lastDriveModifiedAt: fileMetadata.modifiedTime || now,
    extractedText: undefined,
    parsedBlocks: [],
    parserStatus: "pending",
    parserVersion: "1.0",
  };
  return document;
}

export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get("action");
  if (!action) {
    return buildErrorResponse("Missing action parameter", 404);
  }

  if (action === "status") {
    const localMode = !isGoogleDriveAuthConfigured();
    if (localMode) {
      return safeJsonResponse({
        connected: true,
        provider: "local",
        message: "Local enterprise Drive fallback is active.",
        accounts: [],
      });
    }

    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return buildErrorResponse("Unauthorized: missing Supabase session", 401);
    }
    const legacyAccounts = await findDriveAccounts(userId);
    return safeJsonResponse({
      connected: legacyAccounts.length > 0,
      provider: "google",
      message: "Google Drive connector status retrieved.",
      accounts: legacyAccounts.map((account) => ({
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

  if (action === "diagnostics") {
    const localMode = !isGoogleDriveAuthConfigured();
    const jobs = getIngestionJobs();
    const documents = getDocuments();
    const parserStatusCounts = {
      pending: documents.filter((doc) => doc.parserStatus === "pending").length,
      parsed: documents.filter((doc) => doc.parserStatus === "parsed").length,
      failed: documents.filter((doc) => doc.parserStatus === "failed").length,
    };
    return safeJsonResponse({
      activeProvider: localMode ? "LocalDriveProvider" : "GoogleDriveProvider",
      providerMode: localMode ? "local" : "google",
      status: localMode ? "local" : "connected",
      message: localMode ? "Local enterprise Drive fallback is active." : "Google Drive connector is configured.",
      ingestion: {
        total: jobs.length,
        queued: jobs.filter((job) => job.status === "queued" || job.status === "retrying").length,
        processing: jobs.filter((job) => job.status === "processing").length,
        retrying: jobs.filter((job) => job.status === "retrying").length,
        failed: jobs.filter((job) => job.status === "failed").length,
      },
      parser: parserStatusCounts,
      indexingVersion: getSearchIndexVersion(),
    });
  }

  if (action === "docs") {
    const documentId = request.nextUrl.searchParams.get("docId");
    if (!documentId) {
      return buildErrorResponse("Missing docId parameter", 400);
    }

    const localMode = !isGoogleDriveAuthConfigured();
    if (localMode) {
      const document = getDriveDocumentById(documentId);
      if (!document) {
        return buildErrorResponse("Drive document not found", 404);
      }
      return safeJsonResponse({
        documentId: document.id,
        title: document.title,
        body: {
          content: [{
            type: "paragraph",
            paragraph: {
              elements: [{
                type: "textRun",
                textRun: {
                  content: document.description || document.title,
                },
              }],
            },
          }],
        },
      });
    }

    const account = await getCurrentDriveAccount(request);
    if (!account) {
      return buildErrorResponse("Unauthorized: no connected Drive account available", 401);
    }
    const accessToken = await getValidAccessToken(account);
    const googleDoc = await fetchGoogleDocsDocument(accessToken, documentId);
    return safeJsonResponse(googleDoc);
  }

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
      return buildErrorResponse("Unauthorized: user session required for Drive connect", 401);
    }

    const account = {
      userId,
      googleAccountId: userInfo.sub,
      email: userInfo.email,
      displayName: userInfo.name,
      tokens,
    };

    const savedAccount = await saveDriveAccount({
      ...account,
      id: `drive-account-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      legacyId: `drive-account-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      accessTokenEncrypted: encryptValue(tokens.accessToken),
      refreshTokenEncrypted: tokens.refreshToken ? encryptValue(tokens.refreshToken) : "",
      expiresAt: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
      scopes: tokens.scope.split(" "),
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);

    const html = `<!DOCTYPE html><html><body><script>window.opener?.postMessage({type:'drive-auth-result', connected:true, message:'Google Drive account connected successfully.'}, window.origin); window.close();</script></body></html>`;
    const response = new NextResponse(html, { status: 200 });
    response.headers.set("Content-Type", "text/html");
    response.cookies.delete(getCallbackStateCookieName());
    return response;
  }

  return buildErrorResponse(`Unsupported GET action: ${action}`, 404);
}

export async function POST(request: NextRequest) {
  const action = request.nextUrl.searchParams.get("action");
  if (!action) {
    return buildErrorResponse("Missing action parameter", 404);
  }

  const body = await request.json().catch(() => ({}));

  if (action === "auth") {
    if (!isGoogleDriveAuthConfigured()) {
      return safeJsonResponse({
        connected: true,
        provider: "local",
        message: "Local enterprise Drive fallback is active. Google credentials are not required.",
      });
    }

    const state = crypto.randomBytes(16).toString("hex");
    const authUrl = buildGoogleDriveAuthUrl(state);
    const response = NextResponse.json({ authUrl });
    response.cookies.set(getCallbackStateCookieName(), state, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/api/drive",
      maxAge: 300,
    });
    return response;
  }

  if (action === "attach") {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return buildErrorResponse("Unauthorized: missing Supabase session", 401);
    }

    const localMode = !isGoogleDriveAuthConfigured();
    const account = localMode ? null : await getCurrentDriveAccount(request, body.accountId);
    if (!localMode && !account) {
      return buildErrorResponse("No connected Drive account found", 401);
    }

    const fileId = body.driveFileId || body.googleDocId;
    if (!fileId) {
      return buildErrorResponse("Missing Drive file identifier", 400);
    }

    const metadata = localMode
      ? {
          id: fileId,
          name: body.title || "Local Drive document",
          mimeType: body.fileMimeType,
          webViewLink: body.driveUrl,
          modifiedTime: new Date().toISOString(),
          permissions: [],
          description: body.description,
          owners: [{ emailAddress: body.ownerEmail }],
        }
      : await fetchDriveFileMetadata(await getValidAccessToken(account!), fileId);

    const permissions = mapGooglePermissions(metadata.permissions);
    const document = await createDocumentPayloadFromMetadata(userId, body, metadata, permissions);
    saveDriveDocumentReference(document);

    if (metadata.mimeType === "application/vnd.google-apps.folder") {
      if (localMode) {
        await startIngestionWorker();
        await saveActivity({
          id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          userId,
          action: "DOCUMENT_CREATED",
          targetType: "document",
          targetId: document.id,
          timestamp: new Date().toISOString(),
          metadata: { fileId, source: metadata.mimeType, syncStatus: document.syncStatus },
        });
        return safeJsonResponse(buildSafeDriveDocument(document));
      }

      const accessToken = await getValidAccessToken(account!);
      const children = await getDriveFolderChildren(accessToken, fileId);
      for (const child of children) {
        if (!child.id || !child.mimeType) continue;
        const childPermissions = mapGooglePermissions(child.permissions);
        const childDoc = await createDocumentPayloadFromMetadata(userId, {
          title: child.name,
          description: `Synced from folder ${body.title}`,
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
        }, child, childPermissions);
        saveDriveDocumentReference(childDoc);
        if (child.mimeType !== "application/vnd.google-apps.folder") {
          const childParserType = determineParserType(child.mimeType);
          let childPayload: any;
          if (child.mimeType === "application/vnd.google-apps.document") {
            childPayload = await fetchGoogleDocsDocument(accessToken, child.id);
          } else {
            childPayload = await extractDriveExportPayload(accessToken, child.id, child);
          }
          enqueueIngestionJob({
            documentId: childDoc.id,
            sourceType: "googleDrive",
            parserType: childParserType,
            sourceUrl: childDoc.driveUrl,
            fileName: child.name,
            mimeType: child.mimeType,
            metadata: {
              departmentId: body.departmentId,
              tags: [body.tag],
              authorId: body.authorId,
            },
            rawPayload: childPayload,
          });
        }
      }
    } else {
      if (!localMode) {
        let rawPayload: any = undefined;
        const parserType = determineParserType(metadata.mimeType);

        if (metadata.mimeType === "application/vnd.google-apps.document") {
          rawPayload = await fetchGoogleDocsDocument(await getValidAccessToken(account!), fileId);
        } else {
          rawPayload = await extractDriveExportPayload(await getValidAccessToken(account!), fileId, metadata);
        }

        enqueueIngestionJob({
          documentId: document.id,
          sourceType: "googleDrive",
          parserType,
          sourceUrl: document.driveUrl,
          fileName: metadata.name,
          mimeType: metadata.mimeType,
          metadata: {
            departmentId: body.departmentId,
            tags: [body.tag],
            authorId: body.authorId,
          },
          rawPayload,
        });
      } else {
        await startIngestionWorker();
      }
    }

    await saveActivity({
      id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId,
      action: "DOCUMENT_CREATED",
      targetType: "document",
      targetId: document.id,
      timestamp: new Date().toISOString(),
      metadata: { fileId, source: metadata.mimeType, syncStatus: document.syncStatus },
    });

    return safeJsonResponse(buildSafeDriveDocument(document));
  }

  if (action === "refresh") {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return buildErrorResponse("Unauthorized: missing Supabase session", 401);
    }
    const documentId = body.documentId;
    if (!documentId) {
      return buildErrorResponse("Missing documentId", 400);
    }
    const document = getDriveDocumentById(documentId);
    if (!document) {
      return buildErrorResponse("Drive document not found", 404);
    }

    const localMode = !isGoogleDriveAuthConfigured();
    if (localMode) {
      updateDriveDocumentSyncMetadata(document.id, {
        lastSyncedAt: new Date().toISOString(),
        lastDriveModifiedAt: document.updatedAt || new Date().toISOString(),
        syncStatus: "synced",
        updatedAt: new Date().toISOString(),
        updatedById: userId,
      });
      await startIngestionWorker();
      return safeJsonResponse({ success: true, documentId: document.id, syncStatus: "synced" });
    }

    const account = await getCurrentDriveAccount(request);
    if (!account) {
      return buildErrorResponse("No connected Drive account found", 401);
    }
    const accessToken = await getValidAccessToken(account);
    const metadata = await fetchDriveFileMetadata(accessToken, document.driveFileId);
    updateDriveDocumentSyncMetadata(document.id, {
      lastSyncedAt: new Date().toISOString(),
      lastDriveModifiedAt: metadata.modifiedTime || new Date().toISOString(),
      syncStatus: "synced",
      updatedAt: new Date().toISOString(),
      updatedById: userId,
    });
    if (metadata.mimeType === "application/vnd.google-apps.document") {
      const rawPayload = await fetchGoogleDocsDocument(accessToken, metadata.id);
      enqueueIngestionJob({
        documentId: document.id,
        sourceType: "googleDrive",
        parserType: "googleDrive",
        sourceUrl: document.driveUrl,
        fileName: metadata.name,
        mimeType: metadata.mimeType,
        metadata: { departmentId: document.departmentId, tags: [document.tag], authorId: document.authorId },
        rawPayload,
      });
    }
    return safeJsonResponse({ success: true, documentId: document.id, syncStatus: "synced" });
  }

  if (action === "register") {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return buildErrorResponse("Unauthorized: missing Supabase session", 401);
    }
    const fileId = body.driveFileId;
    if (!fileId) {
      return buildErrorResponse("Missing driveFileId", 400);
    }
    const account = await getCurrentDriveAccount(request, body.accountId);
    if (!account) {
      return buildErrorResponse("No connected Drive account found", 401);
    }
    const accessToken = await getValidAccessToken(account);
    const channelId = `drive-webhook-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const subscription = await createDriveWatchSubscription(accessToken, fileId, channelId, buildWebhookCallbackUrl(), userId);
    return safeJsonResponse({ success: true, subscription });
  }

  if (action === "disconnect") {
    const accountId = body.accountId;
    if (!accountId) {
      return buildErrorResponse("Missing accountId", 400);
    }
    const disconnected = await deactivateDriveAccount(accountId);
    return safeJsonResponse({ success: !!disconnected, accountId });
  }

  if (action === "webhook") {
    const resourceUri = request.headers.get("x-goog-resource-uri") || body.resourceUri;
    const resourceId = request.headers.get("x-goog-resource-id") || body.resourceId;
    const channelId = request.headers.get("x-goog-channel-id") || body.channelId;
    const resourceState = request.headers.get("x-goog-resource-state") || body.resourceState;

    if (!resourceUri || !resourceId) {
      return NextResponse.json({ success: false, message: "Webhook missing required headers." }, { status: 400 });
    }

    const match = resourceUri.match(/\/files\/([^/?]+)/);
    const fileId = match?.[1];
    if (!fileId) {
      return safeJsonResponse({ success: true });
    }

    try {
      const userId = getUserIdFromRequest(request);
      const account = userId ? await getCurrentDriveAccount(request) : null;
      if (account) {
        const accessToken = await getValidAccessToken(account);
        const metadata = await fetchDriveFileMetadata(accessToken, fileId);
        const permissions = mapGooglePermissions(metadata.permissions);
        const document = getDriveDocuments().find((doc) => doc.driveFileId === fileId);
        if (document) {
          saveDriveDocumentReference({
            ...document,
            permissionSummary: permissions,
            lastDriveModifiedAt: metadata.modifiedTime || document.lastDriveModifiedAt,
            syncStatus: "pending",
            updatedAt: new Date().toISOString(),
            driveUrl: metadata.webViewLink || document.driveUrl,
          });
          if (metadata.mimeType === "application/vnd.google-apps.document") {
            const rawPayload = await fetchGoogleDocsDocument(accessToken, fileId);
            enqueueIngestionJob({
              documentId: document.id,
              sourceType: "googleDrive",
              parserType: "googleDrive",
              sourceUrl: document.driveUrl,
              fileName: metadata.name,
              mimeType: metadata.mimeType,
              metadata: { departmentId: document.departmentId, tags: [document.tag], authorId: document.authorId },
              rawPayload,
            });
          }
        }
      }
    } catch (error) {
      return buildErrorResponse(`Webhook sync failed: ${String(error)}`, 500);
    }

    return safeJsonResponse({ success: true, resourceId, channelId, resourceState });
  }

  return buildErrorResponse(`Unsupported POST action: ${action}`, 404);
}
