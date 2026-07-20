export type { StorageProvider } from "@/services/storage/provider";

export type StorageBucket = "documents" | "hr" | "finance" | "onboarding" | "videos";

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

export function sanitizeFileName(fileName: string) {
  return fileName
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .replace(/-+/g, "-")
    .trim();
}

export function isAllowedUploadMimeType(mimeType: string) {
  return ALLOWED_UPLOAD_MIME_TYPES.includes(mimeType.toLowerCase());
}

