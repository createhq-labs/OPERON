import type { IngestionJob, IngestionResult, IngestionFailure } from "./types";
import type { Document, DriveDocumentReference } from "@/core/operon";
import { validateIngestionJob } from "./stages/validate";
import { detectParser } from "./stages/detect";
import { extractContent } from "./stages/extract";
import { normalizeParsedDocument } from "./stages/normalize";
import { enrichParsedDocument } from "./stages/enrich";
import { indexParsedDocument } from "./stages/index";
import { persistIngestionResult } from "./stages/persist";
import {
  saveIngestionJob,
  saveActivity,
  getDocumentById,
  getDriveDocumentById,
  updateDriveDocumentSyncMetadata,
} from "@/services/api";

type PipelineDocument = Document | DriveDocumentReference;

function isDriveDocument(document: PipelineDocument): document is DriveDocumentReference {
  return Boolean(
    (document as DriveDocumentReference).driveFileId ||
    document.source === "google_drive" ||
    document.source === "local_drive"
  );
}

function updateJobStatus(
  job: IngestionJob,
  status: IngestionJob["status"],
  stage: string,
  message?: string
): IngestionJob {
  const updatedJob: IngestionJob = {
    ...job,
    status,
    progress:  status === "completed" ? 100 : status === "processing" ? 40 : job.progress,
    updatedAt: new Date().toISOString(),
    stageHistory: [
      ...(job.stageHistory ?? []),
      { stage, status: "started" as const, timestamp: new Date().toISOString(), message },
    ],
  };
  saveIngestionJob(updatedJob);
  return updatedJob;
}

export async function runIngestionPipeline(job: IngestionJob): Promise<IngestionResult> {
  let activeJob = updateJobStatus(job, "processing", "pipeline.start", "Starting ingestion pipeline");

  const document: PipelineDocument | undefined =
    getDocumentById(activeJob.documentId) ?? getDriveDocumentById(activeJob.documentId) ?? undefined;

  if (!document) {
    throw new Error("Document referenced by ingestion job was not found.");
  }

  const driveDocument = isDriveDocument(document);
  if (driveDocument) {
    updateDriveDocumentSyncMetadata(document.id, {
      syncStatus:   "syncing",
      lastSyncedAt: new Date().toISOString(),
    });
  }

  try {
    const validation  = await validateIngestionJob(activeJob);
    const detection   = detectParser(activeJob);
    activeJob = { ...activeJob, parserType: detection.parserType };

    const { parsed }  = await extractContent(activeJob, validation.file);
    const normalized  = normalizeParsedDocument(parsed);
    const enriched    = enrichParsedDocument(normalized, activeJob);
    await indexParsedDocument(enriched, activeJob);

    const result = await persistIngestionResult(activeJob, document, enriched);

    if (driveDocument) {
      updateDriveDocumentSyncMetadata(document.id, {
        syncStatus:   "synced",
        lastSyncedAt: new Date().toISOString(),
        updatedAt:    new Date().toISOString(),
      });
    }

    await saveActivity({
      id:         `activity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId:     (activeJob.metadata?.authorId as string) || document.authorId,
      action:     "DOCUMENT_UPDATED",
      targetType: "document",
      targetId:   document.id,
      timestamp:  new Date().toISOString(),
      metadata: {
        ingestionStatus: result.status,
        parserType:      activeJob.parserType,
      },
    });

    return result;
  } catch (error) {
    const failure = createFallbackIngestionFailure(activeJob, error);

    if (driveDocument) {
      updateDriveDocumentSyncMetadata(document.id, {
        syncStatus:   "failed",
        lastSyncedAt: new Date().toISOString(),
      });
    }

    void saveActivity({
      id:         `activity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId:     (activeJob.metadata?.authorId as string) || document.authorId,
      action:     "INGESTION_FAILED",
      targetType: "document",
      targetId:   document.id,
      timestamp:  new Date().toISOString(),
      metadata: {
        ingestionStatus: "failed",
        failureReason:   failure.failureReason,
        jobId:           activeJob.id,
      },
    });

    throw error;
  }
}

function createFallbackIngestionFailure(
  job: IngestionJob,
  error: unknown
): IngestionFailure {
  const failureReason = error instanceof Error ? error.message : String(error);
  return {
    id:            `failure-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    jobId:         job.id,
    documentId:    job.documentId,
    status:        "failed",
    failureReason,
    attempt:       job.retryCount + 1,
    rawError:      failureReason,
    failureAt:     new Date().toISOString(),
  };
}