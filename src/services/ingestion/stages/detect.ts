import type { IngestionJob } from "../types";
import { selectParser } from "@/services/parser/parserFactory";
import type { ParserResult } from "@/services/parser/types";

export interface ParserDetectionResult {
  parserType: string;
  parser: { parseUploadedFile?: (file: File) => Promise<ParserResult>; parseDriveDocument?: (document: any) => ParserResult };
}

export function detectParser(job: IngestionJob): ParserDetectionResult {
  const parser = selectParser({ parserType: job.parserType, mimeType: job.mimeType, fileName: job.fileName });
  const parserType = parser.parserType;
  return {
    parserType,
    parser,
  };
}
