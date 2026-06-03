import type { IngestionJob } from "../types";
import type { ParserResult } from "@/services/parser/types";
import { parseUploadedDocument, parseDriveDocument } from "@/services/parser/parserFactory";

export interface ExtractionResult {
  parsed: ParserResult;
}

export async function extractContent(job: IngestionJob, file: File | undefined): Promise<ExtractionResult> {
  if (job.sourceType === "googleDrive") {
    if (!job.rawPayload) {
      throw new Error("Google Drive ingestion requires a raw payload for extraction.");
    }
    const parsed = parseDriveDocument(job.rawPayload as any);
    return { parsed };
  }

  if (!file) {
    throw new Error("No source file available for extraction.");
  }

  const parsed = await parseUploadedDocument(file, job.parserType);
  return { parsed };
}
