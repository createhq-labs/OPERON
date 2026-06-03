import type { NormalizedDocumentSource } from "@/providers/types";

export function createLocalUploadSource(params: {
  id: string;
  title: string;
  description: string;
  rawUrl: string;
  mimeType: string;
}): NormalizedDocumentSource {
  return {
    id: params.id,
    provider: "localUpload",
    sourceType: "uploaded",
    title: params.title,
    description: params.description,
    rawUrl: params.rawUrl,
    mimeType: params.mimeType,
    createdAt: new Date().toISOString(),
  };
}
