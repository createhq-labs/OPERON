import { LocalDriveProvider } from "@/providers/drive/localDriveProvider";
import { GoogleDriveProvider } from "@/providers/drive/googleDriveProvider";
import type { DriveProvider } from "@/providers/drive/driveProvider";

export type DriveProviderMode = "google" | "local";
export type DriveProviderHealthStatus = "connected" | "degraded" | "local" | "unavailable";

export interface DriveProviderDiagnostics {
  activeProvider: "GoogleDriveProvider" | "LocalDriveProvider";
  providerMode: DriveProviderMode;
  status: DriveProviderHealthStatus;
  message: string;
  credentialsAvailable: boolean;
  supportsAuth: boolean;
}

const GOOGLE_DRIVE_CLIENT_ID = process.env.GOOGLE_DRIVE_CLIENT_ID ?? "";
const GOOGLE_DRIVE_CLIENT_SECRET = process.env.GOOGLE_DRIVE_CLIENT_SECRET ?? "";

export const GOOGLE_DRIVE_CREDENTIALS_AVAILABLE = Boolean(
  GOOGLE_DRIVE_CLIENT_ID && GOOGLE_DRIVE_CLIENT_SECRET
);

/**
 * Module-level singleton — scoped to the Node.js module instance.
 * In Next.js development with hot module replacement, modules are re-evaluated
 * on change, so this naturally resets when provider configuration changes.
 * In production, this persists for the lifetime of the server process, which is correct.
 */
let _provider: DriveProvider | null = null;

export function isGoogleDriveConfigured(): boolean {
  return GOOGLE_DRIVE_CREDENTIALS_AVAILABLE;
}

export function getDriveProvider(): DriveProvider {
  if (!_provider) {
    _provider = GOOGLE_DRIVE_CREDENTIALS_AVAILABLE
      ? new GoogleDriveProvider()
      : new LocalDriveProvider();
  }
  return _provider;
}

export function getDriveProviderDiagnostics(): DriveProviderDiagnostics {
  const isGoogle = GOOGLE_DRIVE_CREDENTIALS_AVAILABLE;

  return {
    activeProvider: isGoogle ? "GoogleDriveProvider" : "LocalDriveProvider",
    providerMode: isGoogle ? "google" : "local",
    status: isGoogle ? "connected" : "local",
    message: isGoogle
      ? "Google Drive credentials are configured. GoogleDriveProvider is active."
      : "Google Drive credentials are not configured. LocalDriveProvider is active as fallback.",
    credentialsAvailable: isGoogle,
    supportsAuth: isGoogle,
  };
}