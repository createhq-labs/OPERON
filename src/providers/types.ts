/**
 * All supported document source providers.
 * - googleDrive: Google Drive (primary provider, source of truth)
 * - localUpload: File uploaded directly to Supabase storage
 * - localDrive: Local fallback provider when Google Drive is not configured
 */
export type ProviderType = "googleDrive" | "localUpload" | "localDrive";

/**
 * How the document entered the system.
 * - uploaded: User-initiated upload through the Operon UI
 * - google_drive: Sourced from or synced with Google Drive
 * - local_drive: Sourced from the local fallback drive provider
 */
export type DocumentSourceType = "uploaded" | "google_drive" | "local_drive";

export interface NormalizedDocumentSource {
  /** Document ID — matches the Supabase `documents.legacy_id` */
  id: string;

  /** Which provider produced this source record */
  provider?: ProviderType;

  /** How the document entered the system */
  sourceType: DocumentSourceType;

  /** Document title */
  title: string;

  /** Short description or summary */
  description: string;

  /** Publicly accessible URL for viewing the document */
  rawUrl: string;

  /** MIME type of the file */
  mimeType: string;

  /** ISO 8601 timestamp of when the document was created in the source system */
  createdAt?: string;

  /** ISO 8601 timestamp of the last modification in the source system */
  updatedAt?: string;

  /** File size in bytes — present for uploaded files */
  size?: number;

  /** Supabase storage bucket name — present for locally uploaded files */
  storageBucket?: string;

  /** Supabase storage path within the bucket — present for locally uploaded files */
  storagePath?: string;

  // ── Google Drive fields ────────────────────────────────────────────────────

  /** ISO 8601 timestamp of when this metadata was last synced from Drive */
  syncedAt?: string;

  /** Google Drive file ID */
  driveFileId?: string;

  /** ISO 8601 timestamp of the last modification recorded in Google Drive */
  driveModifiedAt?: string;

  /** Summarised permission entries from the Drive API */
  permissionSummary?: Array<{
    role?: string;
    emailAddress?: string;
    domain?: string;
  }>;
}