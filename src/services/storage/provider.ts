import type { StorageBucket } from "@/services/storage";

export interface StorageUploadMetadata {
  fileName: string;
  bucket: StorageBucket;
  path: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  publicUrl: string;
  previewUrl?: string;
  fileChecksum?: string;
  storageVersion: string;
  storageRegion?: string;
  ingestionSource?: string;
}

export interface StorageProvider {
  uploadFile(file: File, authorId: string, options?: { tag?: string; departmentId?: string }): Promise<StorageUploadMetadata | undefined>;
  createSecurePreviewUrl(bucket: StorageBucket, path: string, expiresInSeconds?: number): Promise<string | undefined>;
}
