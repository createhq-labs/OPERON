import type { ParserResult } from "@/services/parser/types";
import type { ParserProvider } from "@/services/parser/baseParser";
import { getParserByExtension, getParserByMimeType, resolveParser, listRegisteredParsers } from "@/services/parser/registry";

export interface ParserSelectionOptions {
  parserType?: string;
  mimeType?: string;
  fileName?: string;
}

export interface ParserSelectionResult {
  parser: ParserProvider;
  reason: string;
}

export function selectParser(options: ParserSelectionOptions): ParserProvider {
  const { parserType, mimeType, fileName } = options;
  const resolvedByType = parserType ? resolveParser(parserType) : undefined;
  if (resolvedByType) {
    return {
      ...resolvedByType,
      parserType: resolvedByType.parserType,
    };
  }

  const byMime = getParserByMimeType(mimeType);
  if (byMime) {
    return {
      ...byMime,
      parserType: byMime.parserType,
    };
  }

  const extension = fileName?.split(".").pop()?.toLowerCase();
  const byExt = getParserByExtension(extension);
  if (byExt) {
    return {
      ...byExt,
      parserType: byExt.parserType,
    };
  }

  const fallback = resolveParser("plainText");
  if (!fallback) {
    throw new Error("Plain text parser is not registered.");
  }

  return {
    ...fallback,
    parserType: fallback.parserType,
  };
}

export async function parseUploadedDocument(file: File, parserType?: string): Promise<ParserResult> {
  const parser = selectParser({ parserType, mimeType: file.type, fileName: file.name });
  if (parser.parseUploadedFile) {
    return parser.parseUploadedFile(file);
  }

  const fallback = resolveParser("plainText");
  if (fallback?.parseUploadedFile) {
    return fallback.parseUploadedFile(file);
  }

  throw new Error("No parser available for the uploaded document.");
}

export function parseDriveDocument(document: any): ParserResult {
  const parser = resolveParser("googleDrive");
  if (parser?.parseDriveDocument) {
    return parser.parseDriveDocument(document);
  }

  throw new Error("No Google Drive parser available.");
}

export function listParsers() {
  return listRegisteredParsers();
}
