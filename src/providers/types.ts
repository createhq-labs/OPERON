export type ProviderType = "localUpload" | "googleDrive" | "dropbox" | "notion";

export interface NormalizedDocumentSource {
  id: string;
  provider: ProviderType;
  sourceType: "uploaded" | "google_drive";
  title: string;
  description: string;
  rawUrl?: string;
  mimeType?: string;
  createdAt: string;
  updatedAt?: string;
}
