import type { IngestionJob, IngestionResult } from "../types";
import type { EnrichedDocument } from "./enrich";
import { saveDocument, saveDriveDocumentReference, saveIngestionJob, saveIngestionResult } from "@/services/api";

function isDriveDocument(document: any): boolean {
  return Boolean(document && (document.driveFileId || document.source === "google_drive" || document.source === "local_drive"));
}

export async function persistIngestionResult(job: IngestionJob, document: any, enriched: EnrichedDocument): Promise<IngestionResult> {
  const now = new Date().toISOString();

  document.blocks = enriched.blocks;
  document.parsedBlocks = enriched.blocks;
  document.toc = enriched.toc;
  document.extractedText = enriched.searchableText;
  document.parserStatus = "parsed";
  document.parserVersion = "1.0";
  document.parserConfidence = enriched.confidence;
  document.parserWarnings = enriched.warnings;
  document.lifecycleState = "parsed";
  document.ingestionStatus = "completed";
  document.updatedAt = now;

  if (isDriveDocument(document)) {
    saveDriveDocumentReference(document);
  } else {
    saveDocument(document);
  }
  saveIngestionJob({ ...job, status: "completed", completedAt: now, updatedAt: now, progress: 100 });

  const result: IngestionResult = {
    id: `result-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    jobId: job.id,
    documentId: job.documentId,
    status: "completed",
    parserConfidence: enriched.confidence,
    warnings: enriched.warnings,
    metadata: {
      semanticChunkCount: enriched.semanticChunks.length,
      parserType: job.parserType,
    },
    semanticChunkCount: enriched.semanticChunks.length,
    indexedAt: now,
    completedAt: now,
  };

  saveIngestionResult(result);
  return result;
}
