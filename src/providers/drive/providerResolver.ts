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
const GOOGLE_DRIVE_CREDENTIALS_AVAILABLE = Boolean(GOOGLE_DRIVE_CLIENT_ID && GOOGLE_DRIVE_CLIENT_SECRET);

let provider: DriveProvider | null = null;

export function isGoogleDriveConfigured() {
  return GOOGLE_DRIVE_CREDENTIALS_AVAILABLE;
}

export function resolveDriveProvider(): DriveProvider {
  if (!provider) {
    if (GOOGLE_DRIVE_CREDENTIALS_AVAILABLE) {
      provider = new GoogleDriveProvider();
    } else {
      provider = new LocalDriveProvider();
    }
  }
  return provider!;
}

export function getDriveProvider(): DriveProvider {
  return resolveDriveProvider();
}

export function getDriveProviderDiagnostics(): DriveProviderDiagnostics {
  const requestsEnabled = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_DRIVE === "true";
  const providerMode: DriveProviderMode = GOOGLE_DRIVE_CREDENTIALS_AVAILABLE ? "google" : "local";
  const activeProvider: DriveProviderDiagnostics["activeProvider"] = GOOGLE_DRIVE_CREDENTIALS_AVAILABLE
    ? "GoogleDriveProvider"
    : "LocalDriveProvider";
  let status: DriveProviderHealthStatus = GOOGLE_DRIVE_CREDENTIALS_AVAILABLE ? "connected" : "local";
  let message = "Local enterprise Drive provider is active.";

  if (!GOOGLE_DRIVE_CREDENTIALS_AVAILABLE && requestsEnabled) {
    status = "degraded";
    message = "Google Drive credentials are missing. Local enterprise Drive fallback is active.";
  }

  if (GOOGLE_DRIVE_CREDENTIALS_AVAILABLE) {
    message = "Google Drive credentials are configured. GoogleDriveProvider is available.";
  }

  return {
    activeProvider,
    providerMode,
    status,
    message,
    credentialsAvailable: GOOGLE_DRIVE_CREDENTIALS_AVAILABLE,
    supportsAuth: GOOGLE_DRIVE_CREDENTIALS_AVAILABLE,
  };
}
