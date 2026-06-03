export type IngestionStatus =
  | "uploaded"
  | "queued"
  | "processing"
  | "parsed"
  | "indexed"
  | "completed"
  | "failed"
  | "retrying";
export type IngestionSourceType = "localUpload" | "googleDrive" | "html" | "transcript";
export type IngestionParserType = "plainText" | "pdf" | "docx" | "html" | "markdown" | "csv" | "json" | "googleDrive" | string;

export interface IngestionStageRecord {
  stage: string;
  status: "started" | "succeeded" | "failed";
  timestamp: string;
  message?: string;
}

export interface IngestionJobInput {
  uploadId?: string;
  documentId: string;
  sourceType: IngestionSourceType;
  parserType: IngestionParserType;
  sourceUrl?: string;
  fileName?: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
  rawPayload?: unknown;
  file?: File;
  checksum?: string;
}

export interface IngestionJob extends IngestionJobInput {
  id: string;
  status: IngestionStatus;
  retryCount: number;
  progress?: number;
  stageHistory?: IngestionStageRecord[];
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  nextRunAt?: string;
}

export interface IngestionResult {
  id: string;
  jobId: string;
  documentId: string;
  status: "completed";
  parserConfidence: number;
  warnings: string[];
  metadata: Record<string, unknown>;
  semanticChunkCount?: number;
  indexedAt?: string;
  completedAt: string;
}

export interface IngestionFailure {
  id: string;
  jobId: string;
  documentId: string;
  status: "failed";
  failureReason: string;
  attempt: number;
  rawError?: string;
  failureAt: string;
}
