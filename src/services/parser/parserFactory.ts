import type { ParserResult, DriveDocumentPayload } from "@/services/parser/types";
import type { ParserProvider } from "@/services/parser/baseParser";
import type { ParserHandler } from "@/services/parser/registry";
import {
  getParserByExtension,
  getParserByMimeType,
  resolveParser,
  listRegisteredParsers,
} from "@/services/parser/registry";

export interface ParserSelectionOptions {
  parserType?: string;
  mimeType?:   string;
  fileName?:   string;
}

export interface ParserSelectionResult {
  parser: ParserProvider;
  reason: string;
}

// ---------------------------------------------------------------------------
// Parser selection
// ---------------------------------------------------------------------------

export function selectParser(options: ParserSelectionOptions): ParserProvider {
  const { parserType, mimeType, fileName } = options;

  if (parserType) {
    const byType = resolveParser(parserType);
    if (byType) return byType;
  }

  if (mimeType) {
    const byMime = getParserByMimeType(mimeType);
    if (byMime) return byMime;
  }

  const extension = fileName?.split(".").pop()?.toLowerCase();
  if (extension) {
    const byExt = getParserByExtension(extension);
    if (byExt) return byExt;
  }

  const fallback = resolveParser("plainText");
  if (!fallback) {
    throw new Error(
      "Plain text parser is not registered. Ensure registerParsers() has been called."
    );
  }

  return fallback;
}

// ---------------------------------------------------------------------------
// Upload parsing
// ---------------------------------------------------------------------------

export async function parseUploadedDocument(
  file: File,
  parserType?: string
): Promise<ParserResult> {
  const parser = selectParser({
    parserType,
    mimeType: file.type,
    fileName: file.name,
  });

  if (parser.parseUploadedFile) {
    return parser.parseUploadedFile(file);
  }

  const fallback = resolveParser("plainText");
  if (fallback?.parseUploadedFile) {
    return fallback.parseUploadedFile(file);
  }

  throw new Error("No parser available for the uploaded document.");
}

// ---------------------------------------------------------------------------
// Drive parsing
// ---------------------------------------------------------------------------

export function parseDriveDocument(
  document: DriveDocumentPayload
): ParserResult {
  const parser = resolveParser("googleDrive");
  if (parser?.parseDriveDocument) {
    return parser.parseDriveDocument(document);
  }
  throw new Error(
    "No Google Drive parser available. Ensure registerParsers() has been called."
  );
}

// ---------------------------------------------------------------------------
// Registry inspection
// ---------------------------------------------------------------------------

export function listParsers(): ParserHandler[] {
  return listRegisteredParsers();
}