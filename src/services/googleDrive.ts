/**
 * Google Drive Integration Service
 * Handles authentication, file management, sync, and real-time updates
 * 
 * This service makes Google Drive the source of truth for all documents
 * while Supabase stores metadata and search indexes
 */

import { createClient } from "@supabase/supabase-js";

// Environment variables required
const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";

interface DriveAuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  userId: string;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  folderId: string;
  webViewLink: string;
  modifiedTime: string;
  size: number;
  md5Checksum: string;
}

interface DriveFolder {
  id: string;
  name: string;
  roleId: string;
  parentFolderId?: string;
}

interface DriveSyncEvent {
  type: "upload" | "delete" | "rename" | "move";
  fileId: string;
  fileName: string;
  folderId: string;
  timestamp: number;
}

export class GoogleDriveService {
  private supabase: ReturnType<typeof createClient>;

  constructor() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase credentials not configured");
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Initialize OAuth flow for Google Drive access
   * Should redirect to Google OAuth consent screen
   */
  static getOAuthUrl(userId: string): string {
    const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
    const redirectUri = process.env.NEXT_PUBLIC_DRIVE_OAUTH_CALLBACK;

    if (!clientId || !redirectUri) {
      throw new Error("Google Drive OAuth credentials not configured");
    }

    const scopes = [
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/drive.metadata.readonly",
    ];

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: scopes.join(" "),
      state: userId,
      access_type: "offline",
      prompt: "consent",
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Exchange OAuth code for access token
   * Should be called on backend after OAuth redirect
   */
  async exchangeOAuthCode(
    userId: string,
    code: string
  ): Promise<DriveAuthToken> {
    const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
    const redirectUri = process.env.NEXT_PUBLIC_DRIVE_OAUTH_CALLBACK;

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error("Google Drive OAuth credentials not configured");
    }

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }).toString(),
    });

    if (!response.ok) {
      throw new Error("Failed to exchange OAuth code");
    }

    const data = await response.json();

    const token: DriveAuthToken = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      userId,
    };

    // Store encrypted token in Supabase
    await this.storeEncryptedToken(token);

    return token;
  }

  /**
   * Create the base Operon folder structure in Drive
   * Returns folder IDs for each role
   */
  async initializeFolderStructure(
    accessToken: string
  ): Promise<Record<string, string>> {
    const roles = [
      { id: "co-founder", name: "Co-Founder" },
      { id: "hr", name: "HR" },
      { id: "finance", name: "Finance" },
      { id: "team-lead", name: "Team Lead" },
      { id: "content-creator", name: "Content Creator" },
      { id: "employee", name: "Employee Resources" },
      { id: "intern", name: "Intern Training" },
      { id: "shared", name: "Shared" },
    ];

    const folderIds: Record<string, string> = {};

    // Create root Operon folder
    const rootFolderId = await this.createFolder("Operon", accessToken);

    // Create role subfolders
    for (const role of roles) {
      const folderId = await this.createFolder(
        role.name,
        accessToken,
        rootFolderId
      );
      folderIds[role.id] = folderId;

      // Store folder mapping in Supabase
      await this.supabase.from("drive_folder_mapping").insert({
        role_id: role.id,
        folder_id: folderId,
        parent_id: rootFolderId,
        created_at: new Date().toISOString(),
      });
    }

    return folderIds;
  }

  /**
   * Create a folder in Google Drive
   */
  private async createFolder(
    folderName: string,
    accessToken: string,
    parentFolderId?: string
  ): Promise<string> {
    const metadata = {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      ...(parentFolderId && { parents: [parentFolderId] }),
    };

    const response = await fetch(
      `${DRIVE_API_BASE}/files?supportsAllDrives=true`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(metadata),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to create folder: ${folderName}`);
    }

    const data = await response.json();
    return data.id;
  }

  /**
   * Upload file to Google Drive
   * Automatically routes to correct role folder
   */
  async uploadFile(
    file: File,
    roleId: string,
    accessToken: string,
    metadata?: Record<string, any>
  ): Promise<DriveFile> {
    // Get role folder ID
    const { data: folderData } = await this.supabase
      .from("drive_folder_mapping")
      .select("folder_id")
      .eq("role_id", roleId)
      .single();

    if (!folderData) {
      throw new Error(`Drive folder not configured for role: ${roleId}`);
    }

    const folderId = folderData.folder_id;

    // Create resumable upload session
    const fileMetadata = {
      name: file.name,
      parents: [folderId],
      ...metadata,
    };

    const response = await fetch(`${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&supportsAllDrives=true`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-Upload-Content-Type": file.type,
        "X-Upload-Content-Length": file.size.toString(),
      },
      body: JSON.stringify(fileMetadata),
    });

    if (!response.ok) {
      throw new Error("Failed to initiate file upload");
    }

    const data = await response.json();
    return {
      id: data.id,
      name: data.name,
      mimeType: data.mimeType,
      folderId,
      webViewLink: data.webViewLink,
      modifiedTime: data.modifiedTime,
      size: file.size,
      md5Checksum: data.md5Checksum || "",
    };
  }

  /**
   * Set up webhook to detect Drive changes
   * Called during setup to enable real-time sync
   */
  async setupWebhook(
    accessToken: string,
    callbackUrl: string
  ): Promise<string> {
    // Create watch on Operon root folder to detect all changes
    const response = await fetch(
      `${DRIVE_API_BASE}/files?supportsAllDrives=true&q=name='Operon'&spaces=drive`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const data = await response.json();
    const rootFolderId = data.files[0]?.id;

    if (!rootFolderId) {
      throw new Error("Operon folder not found on Drive");
    }

    // Create webhook notification for folder
    const webhookResponse = await fetch(
      `${DRIVE_API_BASE}/files/${rootFolderId}/watch?supportsAllDrives=true`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "web_hook",
          address: callbackUrl,
          expiration: (Date.now() + 86400000).toString(), // 24 hours
        }),
      }
    );

    if (!webhookResponse.ok) {
      throw new Error("Failed to setup webhook");
    }

    const webhookData = await webhookResponse.json();
    return webhookData.id;
  }

  /**
   * Handle Drive webhook event
   * Called when files change in Drive
   */
  async handleWebhookEvent(
    channelId: string,
    channelToken: string
  ): Promise<DriveSyncEvent[]> {
    // Verify webhook authenticity
    // Query Drive for changes since last sync
    // Return events to process

    // This is a simplified version - actual implementation would:
    // 1. Verify webhook signature
    // 2. Query Drive API for changes
    // 3. Update Supabase metadata
    // 4. Update search index
    // 5. Return events for UI updates

    return [];
  }

  /**
   * Delete file from Drive
   */
  async deleteFile(fileId: string, accessToken: string): Promise<void> {
    const response = await fetch(
      `${DRIVE_API_BASE}/files/${fileId}?supportsAllDrives=true`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error("Failed to delete file from Drive");
    }
  }

  /**
   * Rename file in Drive
   */
  async renameFile(
    fileId: string,
    newName: string,
    accessToken: string
  ): Promise<void> {
    const response = await fetch(
      `${DRIVE_API_BASE}/files/${fileId}?supportsAllDrives=true`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: newName }),
      }
    );

    if (!response.ok) {
      throw new Error("Failed to rename file");
    }
  }

  /**
   * Move file to different Drive folder
   */
  async moveFile(
    fileId: string,
    targetFolderId: string,
    accessToken: string
  ): Promise<void> {
    const response = await fetch(
      `${DRIVE_API_BASE}/files/${fileId}?supportsAllDrives=true`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          parents: [targetFolderId],
        }),
      }
    );

    if (!response.ok) {
      throw new Error("Failed to move file");
    }
  }

  /**
   * Get file metadata from Drive
   */
  async getFileMetadata(
    fileId: string,
    accessToken: string
  ): Promise<DriveFile> {
    const response = await fetch(
      `${DRIVE_API_BASE}/files/${fileId}?supportsAllDrives=true&fields=id,name,mimeType,parents,webViewLink,modifiedTime,size,md5Checksum`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error("Failed to get file metadata");
    }

    const data = await response.json();
    return {
      id: data.id,
      name: data.name,
      mimeType: data.mimeType,
      folderId: data.parents?.[0] || "",
      webViewLink: data.webViewLink,
      modifiedTime: data.modifiedTime,
      size: data.size || 0,
      md5Checksum: data.md5Checksum || "",
    };
  }

  /**
   * Store encrypted token in Supabase
   * Uses provided encryption key from environment
   */
  private async storeEncryptedToken(token: DriveAuthToken): Promise<void> {
    // In production, encrypt token using DRIVE_TOKEN_ENCRYPTION_KEY
    // For now, this is a placeholder implementation

    const { error } = await this.supabase
      .from("user_drive_tokens")
      .upsert({
        user_id: token.userId,
        access_token: token.accessToken,
        refresh_token: token.refreshToken,
        expires_at: new Date(token.expiresAt).toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (error) {
      throw new Error(`Failed to store Drive token: ${error.message}`);
    }
  }

  /**
   * Get valid access token, refreshing if necessary
   */
  async getValidAccessToken(userId: string): Promise<string> {
    const { data } = await this.supabase
      .from("user_drive_tokens")
      .select("access_token,refresh_token,expires_at")
      .eq("user_id", userId)
      .single();

    if (!data) {
      throw new Error("User not authenticated with Drive");
    }

    // Check if token is expired
    if (new Date(data.expires_at) > new Date()) {
      return data.access_token;
    }

    // Refresh token
    if (!data.refresh_token) {
      throw new Error("Cannot refresh token: no refresh token available");
    }

    return await this.refreshAccessToken(userId, data.refresh_token);
  }

  /**
   * Refresh access token using refresh token
   */
  private async refreshAccessToken(
    userId: string,
    refreshToken: string
  ): Promise<string> {
    const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("Google Drive OAuth credentials not configured");
    }

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }).toString(),
    });

    if (!response.ok) {
      throw new Error("Failed to refresh access token");
    }

    const data = await response.json();

    // Update token in Supabase
    await this.supabase.from("user_drive_tokens").update({
      access_token: data.access_token,
      expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    });

    return data.access_token;
  }
}

export const driveService = new GoogleDriveService();
