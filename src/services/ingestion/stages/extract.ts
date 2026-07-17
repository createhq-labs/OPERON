import type { IngestionJob } from "../types";
import type { ParserResult, DriveDocumentPayload } from "@/services/parser/types";
import { parseUploadedDocument, parseDriveDocument } from "@/services/parser/parserFactory";

type EncodedDriveFile = {
  fileName?: string;
  mimeType?: string;
  contentBase64?: string;
};

function decodeDriveFile(payload: EncodedDriveFile, job: IngestionJob): File {
  if (!payload.contentBase64) {
    throw new Error("Drive file ingestion requires an encoded file payload.");
  }

  const bytes = Buffer.from(payload.contentBase64, "base64");
  const blob = new Blob([bytes], {
    type: payload.mimeType || job.mimeType || "application/octet-stream",
  }) as Blob & { name: string; lastModified: number };
  blob.name = payload.fileName || job.fileName || "uploaded-document";
  blob.lastModified = Date.now();
  return blob as File;
}

export interface ExtractionResult {
  parsed: ParserResult;
}

export async function extractContent(
  job: IngestionJob,
  file: File | undefined
): Promise<ExtractionResult> {
  if (job.sourceType === "googleDrive") {
    if (!job.rawPayload) {
      throw new Error(
        "Google Drive ingestion requires a raw payload for extraction."
      );
    }
    // Native Google Docs provide Docs API structure. Binary files stored in
    // Drive (especially DOCX) provide their original bytes and must use their
    // format-specific parser instead of the Google Docs parser.
    if (job.parserType === "googleDrive") {
      return {
        parsed: parseDriveDocument(job.rawPayload as DriveDocumentPayload),
      };
    }

    const driveFile = decodeDriveFile(job.rawPayload as EncodedDriveFile, job);
    return {
      parsed: await parseUploadedDocument(driveFile, job.parserType),
    };
  }

  if (!file) {
    throw new Error("No source file available for extraction.");
  }

  const parsed = await parseUploadedDocument(file, job.parserType);
  return { parsed };
}
