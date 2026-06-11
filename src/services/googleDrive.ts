/**
 * Google Drive service layer.
 *
 * The per-user OAuth model (GoogleDriveService class, user_drive_tokens,
 * drive_folder_mapping) was removed in migration 001_service_account_drive_refactor.
 * All Drive operations now go through the service account client.
 *
 * Import directly from googleDriveServiceAccount for new code.
 * This file exists only to prevent broken imports in any legacy references.
 */

export {
  getServiceAccountAccessToken,
  uploadFileToCompanyDrive,
  replaceFileInCompanyDrive,
  getCompanyDriveFileMetadata,
  deleteFileFromCompanyDrive,
  exportGoogleDoc,
  getGoogleDocsContent,
  isServiceAccountConfigured,
  getDriveFolderId,
  clearTokenCache,
} from "@/services/googleDriveServiceAccount";

export type {
  ServiceAccountConfig,
  ServiceAccountToken,
} from "@/services/googleDriveServiceAccount";