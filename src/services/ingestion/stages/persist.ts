import type { IngestionJob, IngestionResult } from "../types";
import type { EnrichedDocument } from "./enrich";
import type { Document, DriveDocumentReference } from "@/core/operon";
import {
  saveDocument,
  saveDriveDocumentReference,
  saveIngestionJob,
  saveIngestionResult,
} from "@/services/api";
import { toCoreBlocks, toCoreToc } from "./toCoreDocument";

type PersistableDocument = Document | DriveDocumentReference;

function isDriveDocument(
  document: PersistableDocument
): document is DriveDocumentReference {
  return Boolean(
    (document as DriveDocumentReference).driveFileId ||
      document.source === "google_drive" ||
      document.source === "local_drive"
  );
}

export async function persistIngestionResult(
  job: IngestionJob,
  document: PersistableDocument,
  enriched: EnrichedDocument
): Promise<IngestionResult> {
  const now = new Date().toISOString();

  // Attach parsed content to the document in-place. enriched.blocks/toc are
  // still in the parser-layer shape (services/parser/types.ts) — convert to
  // the domain Block/TocItem shapes (core/types.ts) the renderers actually
  // consume rather than casting past the mismatch (see toCoreDocument.ts).
  const coreBlocks = toCoreBlocks(enriched.blocks);
  const coreToc = toCoreToc(enriched.toc);

  const mutableDoc = document as unknown as Record<string, unknown>;
  mutableDoc.blocks           = coreBlocks;
  mutableDoc.parsedBlocks     = coreBlocks;
  mutableDoc.toc              = coreToc;
  mutableDoc.extractedText    = enriched.searchableText;
  mutableDoc.parserStatus     = "parsed";
  mutableDoc.parserVersion    = "1.0";
  mutableDoc.parserConfidence = enriched.confidence;
  mutableDoc.parserWarnings   = enriched.warnings;
  mutableDoc.lifecycleState   = "parsed";
  mutableDoc.ingestionStatus  = "completed";
  mutableDoc.updatedAt        = now;

  if (isDriveDocument(document)) {
    saveDriveDocumentReference(document);
  } else {
    saveDocument(document);
  }

  saveIngestionJob({
    ...job,
    status:      "completed",
    completedAt: now,
    updatedAt:   now,
    progress:    100,
  });

  const result: IngestionResult = {
    id:                `result-${crypto.randomUUID()}`,
    jobId:             job.id,
    documentId:        job.documentId,
    status:            "completed",
    parserConfidence:  enriched.confidence,
    warnings:          enriched.warnings,
    metadata: {
      semanticChunkCount: enriched.semanticChunks.length,
      parserType:         job.parserType,
    },
    semanticChunkCount: enriched.semanticChunks.length,
    indexedAt:          now,
    completedAt:        now,
  };

  saveIngestionResult(result);
  return result;
}