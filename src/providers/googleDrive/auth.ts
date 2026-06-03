import { isGoogleDriveAuthConfigured } from "@/services/googleDriveClient";

export async function authorizeGoogleDriveProvider(): Promise<{ authorized: boolean; provider: string }> {
  return {
    authorized: isGoogleDriveAuthConfigured(),
    provider: "googleDrive",
  };
}
