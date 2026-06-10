import { isGoogleDriveAuthConfigured } from "@/services/googleDriveClient";

export interface GoogleDriveAuthResult {
  authorized: boolean;
  provider: "googleDrive";
  reason?: string;
}

export async function authorizeGoogleDriveProvider(): Promise<GoogleDriveAuthResult> {
  const authorized = isGoogleDriveAuthConfigured();
  return {
    authorized,
    provider: "googleDrive",
    reason: authorized ? undefined : "Google Drive client credentials are not configured.",
  };
}