import type { DriveDocumentPayload, ParserResult } from "@/services/parser/types";
import type { ParserCapability, ParserType } from "@/services/parser/registry";

export interface ParserProvider {
  parserType: ParserType;
  parserId: string;
  title: string;
  description?: string;
  extensions: string[];
  mimeTypes: string[];
  capabilities: ParserCapability[];
  confidenceBaseline?: number;
  parseUploadedFile?: (file: File) => Promise<ParserResult>;
  parseDriveDocument?: (document: DriveDocumentPayload) => ParserResult;
}
