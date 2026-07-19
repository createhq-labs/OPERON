import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { logWarning } from "@/services/logger";
export type { StorageProvider } from "@/services/storage/provider";

const STORAGE_BUCKETS = {
  documents: "documents",
  hr: "hr",
  finance: "finance",
  onboarding: "onboarding",
  videos: "videos",
} as const;

export type StorageBucket = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS];

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

const ALLOWED_UPLOAD_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/svg+xml",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "application/zip",
];

export const MAX_UPLOAD_SIZE_BYTES = 30 * 1024 * 1024;

function sanitizeFileName(fileName: string) {
  return fileName
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .replace(/-+/g, "-")
    .trim();
}

export function isAllowedUploadMimeType(mimeType: string) {
  return ALLOWED_UPLOAD_MIME_TYPES.includes(mimeType.toLowerCase());
}

function getBucketForUpload(mimeType: string, tag?: string, departmentId?: string): StorageBucket {
  const cleanMime = mimeType.toLowerCase();
  if (cleanMime.startsWith("video/")) {
    return STORAGE_BUCKETS.videos;
  }

  if (tag === "hr" || departmentId === "hr") {
    return STORAGE_BUCKETS.hr;
  }

  if (tag === "onboarding" || departmentId === "onboarding") {
    return STORAGE_BUCKETS.onboarding;
  }

  if (tag === "finance" || departmentId === "finance") {
    return STORAGE_BUCKETS.finance;
  }

  return STORAGE_BUCKETS.documents;
}

async function computeFileChecksum(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", arrayBuffer);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return "";
  }
}

async function createSecurePreviewUrl(
  bucket: StorageBucket,
  path: string,
  expiresInSeconds = 60 * 60
): Promise<string | undefined> {
  if (!isSupabaseConfigured()) {
    return undefined;
  }

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) {
    logWarning("Unable to create secure preview URL", { bucket, path, error });
    return undefined;
  }

  return data.signedUrl;
}

export async function uploadFileToStorage(
  file: File,
  authorId: string,
  options?: { tag?: string; departmentId?: string }
): Promise<StorageUploadMetadata | undefined> {
  if (!isSupabaseConfigured()) {
    return undefined;
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    logWarning("Upload rejected: file size exceeds allowed limit", { size: file.size, limit: MAX_UPLOAD_SIZE_BYTES });
    return undefined;
  }

  if (!isAllowedUploadMimeType(file.type || "application/octet-stream")) {
    logWarning("Upload rejected: unsupported MIME type", { mimeType: file.type });
    return undefined;
  }

  const bucket = getBucketForUpload(file.type || "application/octet-stream", options?.tag, options?.departmentId);
  const safeName = sanitizeFileName(file.name || "upload-file");
  const storagePath = `${authorId}/${Date.now()}-${safeName}`;
  const fileChecksum = await computeFileChecksum(file);

  const { data, error } = await supabase.storage.from(bucket).upload(storagePath, file, {
    cacheControl: "3600",
    upsert: false,
  });

  if (error || !data?.path) {
    logWarning("Supabase storage upload failed", { bucket, path: storagePath, error });
    return undefined;
  }

  const publicUrl = supabase.storage.from(bucket).getPublicUrl(data.path).data.publicUrl ?? "";
  const previewUrl = await createSecurePreviewUrl(bucket, data.path);

  return {
    fileName: file.name,
    bucket,
    path: data.path,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    uploadedBy: authorId,
    publicUrl,
    previewUrl,
    fileChecksum,
    storageVersion: "v1",
    storageRegion: process.env.NEXT_PUBLIC_STORAGE_REGION ?? "unknown",
    ingestionSource: "localUpload",
  };
}