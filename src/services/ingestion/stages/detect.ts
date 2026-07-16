import type { IngestionJob } from "../types";
import type { ParserProvider } from "@/services/parser/baseParser";
import { selectParser } from "@/services/parser/parserFactory";
// Side-effect import — registers every parser into the shared registry.
// Without this, parser resolution here only works by accident (today it
// happens to work because core/operon.ts imports @/services/parser
// elsewhere first, which is fragile — this makes it explicit and direct).
import "@/services/parser";

export interface ParserDetectionResult {
  parserType: string;
  parser: ParserProvider;
}

export function detectParser(job: IngestionJob): ParserDetectionResult {
  const parser = selectParser({
    parserType: job.parserType,
    mimeType:   job.mimeType,
    fileName:   job.fileName,
  });
  return {
    parserType: parser.parserType,
    parser,
  };
}