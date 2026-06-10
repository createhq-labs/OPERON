import type { NormalizedDocumentSource } from "@/providers/types";

export interface LocalUploadSourceParams {
  id: string;
  title: string;
  description: string;
  rawUrl: string;
  mimeType: string;
  storageBucket: string;
  storagePath: string;
  size?: number;
  updatedAt?: string;
}

export function createLocalUploadSource(
  params: LocalUploadSourceParams
): NormalizedDocumentSource {
  if (!params.id) throw new Error("LocalUploadSource requires a non-empty id.");
  if (!params.title) throw new Error("LocalUploadSource requires a non-empty title.");
  if (!params.storageBucket) throw new Error("LocalUploadSource requires a storageBucket.");
  if (!params.storagePath) throw new Error("LocalUploadSource requires a storagePath.");

  const now = new Date().toISOString();

  return {
    id: params.id,
    provider: "localUpload",
    sourceType: "uploaded",
    title: params.title,
    description: params.description,
    rawUrl: params.rawUrl,
    mimeType: params.mimeType,
    createdAt: now,
    updatedAt: params.updatedAt,
    size: params.size,
    storageBucket: params.storageBucket,
    storagePath: params.storagePath,
  };
}