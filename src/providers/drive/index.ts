import { getDriveProvider as resolveDriveProvider, getDriveProviderDiagnostics, isGoogleDriveConfigured } from "@/providers/drive/providerResolver";
import type { DriveProvider } from "@/providers/drive/driveProvider";

export { resolveDriveProvider, getDriveProviderDiagnostics, isGoogleDriveConfigured };

export function getDriveProvider(): DriveProvider {
  return resolveDriveProvider();
}
