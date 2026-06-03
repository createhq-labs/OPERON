import type { IngestionJob } from "../types";
import { MAX_UPLOAD_SIZE_BYTES, isAllowedUploadMimeType } from "@/services/storage";

export interface ValidationResult {
  file?: File;
  mimeType?: string;
}

export async function validateIngestionJob(job: IngestionJob): Promise<ValidationResult> {
  if (job.sourceType === "localUpload" && !job.file) {
    throw new Error("Local upload ingestion requires a file payload.");
  }

  if (job.file) {
    if (job.file.size > MAX_UPLOAD_SIZE_BYTES) {
      throw new Error("Uploaded file exceeds maximum allowed size.");
    }

    if (!isAllowedUploadMimeType(job.file.type || "application/octet-stream")) {
      throw new Error(`Unsupported upload MIME type: ${job.file.type}`);
    }
  }

  return {
    file: job.file,
    mimeType: job.mimeType || job.file?.type,
  };
}
