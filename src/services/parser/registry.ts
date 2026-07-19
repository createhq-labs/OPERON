import type { DriveDocumentPayload, ParserResult } from "@/services/parser/types";

export type ParserType =
  | "plainText"
  | "pdf"
  | "docx"
  | "html"
  | "markdown"
  | "csv"
  | "json"
  | "googleDrive";

export type ParserCapability =
  | "heading"
  | "table"
  | "image"
  | "list"
  | "link"
  | "metadata"
  | "semanticChunking"
  | "entityExtraction"
  | "pageAwareness"
  | "ocrReady";

export interface ParserMetadata {
  parserType:          ParserType;
  parserId:            string;
  title:               string;
  description?:        string;
  extensions:          string[];
  mimeTypes:           string[];
  capabilities:        ParserCapability[];
  confidenceBaseline?: number;
}

export type ParserHandler = ParserMetadata & {
  parseUploadedFile?:  (file: File) => Promise<ParserResult>;
  parseDriveDocument?: (document: DriveDocumentPayload) => ParserResult;
};

const parserRegistry = new Map<ParserType, ParserHandler>();

export function registerParser(handler: ParserHandler): void {
  parserRegistry.set(handler.parserType, handler);
}

export function resolveParser(
  parserType: string | undefined
): ParserHandler | undefined {
  if (!parserType) return undefined;
  return parserRegistry.get(parserType as ParserType);
}

export function getParserByMimeType(
  mimeType: string | undefined
): ParserHandler | undefined {
  if (!mimeType) return undefined;
  const normalized = mimeType.toLowerCase();
  return Array.from(parserRegistry.values()).find((handler) =>
    handler.mimeTypes.some((type) => type.toLowerCase() === normalized)
  );
}

export function getParserByExtension(
  extension: string | undefined
): ParserHandler | undefined {
  if (!extension) return undefined;
  const normalized = extension.toLowerCase();
  return Array.from(parserRegistry.values()).find((handler) =>
    handler.extensions.includes(normalized)
  );
}

