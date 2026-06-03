import type { ParserResult } from "@/services/parser/types";
import { parsePlainTextDocument } from "@/services/parser/plainTextParser";
import { parsePdfDocument } from "@/services/parser/pdfParser";
import { parseDriveDocument } from "@/services/parser/driveParser";
import { parseDocxDocument } from "@/services/parser/docxParser";
import { parseHtmlDocument } from "@/services/parser/htmlParser";
import { parseMarkdownDocument } from "@/services/parser/markdownParser";
import { parseCsvDocument } from "@/services/parser/csvParser";
import { parseJsonDocument } from "@/services/parser/jsonParser";
import { parseGoogleDocsDocument } from "@/services/parser/googleDocsParser";
import { getParserByExtension, getParserByMimeType, registerParser, resolveParser } from "@/services/parser/registry";

registerParsers();

function registerParsers() {
  registerParser({
    parserType: "plainText",
    parserId: "plain-text-parser",
    title: "Plain Text Parser",
    description: "Parses raw text uploads and simple document content.",
    extensions: ["txt", "text"],
    mimeTypes: ["text/plain"],
    capabilities: ["heading", "list", "metadata"],
    parseUploadedFile: async (file: File) => {
      const rawText = await readFileAsText(file);
      return parsePlainTextDocument(rawText, file.name);
    },
  });

  registerParser({
    parserType: "markdown",
    parserId: "markdown-parser",
    title: "Markdown Parser",
    description: "Parses markdown files into semantic blocks and headings.",
    extensions: ["md", "markdown"],
    mimeTypes: ["text/markdown", "text/x-markdown"],
    capabilities: ["heading", "list", "table", "link", "metadata"],
    parseUploadedFile: async (file: File) => {
      const rawText = await readFileAsText(file);
      return parseMarkdownDocument(rawText, file.name);
    },
  });

  registerParser({
    parserType: "html",
    parserId: "html-parser",
    title: "HTML Parser",
    description: "Extracts structured content from HTML files.",
    extensions: ["html", "htm"],
    mimeTypes: ["text/html"],
    capabilities: ["heading", "list", "link", "table", "metadata"],
    parseUploadedFile: async (file: File) => {
      const rawText = await readFileAsText(file);
      return parseHtmlDocument(rawText, file.name);
    },
  });

  registerParser({
    parserType: "csv",
    parserId: "csv-parser",
    title: "CSV Parser",
    description: "Converts CSV rows into searchable tables and structured content.",
    extensions: ["csv"],
    mimeTypes: ["text/csv"],
    capabilities: ["table", "metadata"],
    parseUploadedFile: async (file: File) => {
      const rawText = await readFileAsText(file);
      return parseCsvDocument(rawText, file.name);
    },
  });

  registerParser({
    parserType: "json",
    parserId: "json-parser",
    title: "JSON Parser",
    description: "Normalizes JSON documents into structured blocks and metadata.",
    extensions: ["json"],
    mimeTypes: ["application/json", "text/json"],
    capabilities: ["metadata", "semanticChunking"],
    parseUploadedFile: async (file: File) => {
      const rawText = await readFileAsText(file);
      return parseJsonDocument(rawText, file.name);
    },
  });

  registerParser({
    parserType: "pdf",
    parserId: "pdf-parser",
    title: "PDF Parser",
    description: "Extracts text and layout hints from PDF files.",
    extensions: ["pdf"],
    mimeTypes: ["application/pdf"],
    capabilities: ["heading", "table", "pageAwareness", "ocrReady"],
    parseUploadedFile: parsePdfDocument,
  });

  registerParser({
    parserType: "docx",
    parserId: "docx-parser",
    title: "DOCX Parser",
    description: "Extracts headings, lists, tables, and inline formatting from DOCX files.",
    extensions: ["docx"],
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
    ],
    capabilities: ["heading", "table", "list", "metadata"],
    parseUploadedFile: parseDocxDocument,
  });

  registerParser({
    parserType: "googleDrive",
    parserId: "google-drive-parser",
    title: "Google Drive Document Parser",
    description: "Parses Google Docs documents and hydrates structured content.",
    extensions: [],
    mimeTypes: ["application/vnd.google-apps.document"],
    capabilities: ["heading", "list", "table", "metadata"],
    parseDriveDocument: parseGoogleDocsDocument,
  });
}

export async function parseUploadedFile(file: File): Promise<ParserResult> {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "txt";
  const parser = getParserByMimeType(file.type) || getParserByExtension(extension) || resolveParser("plainText");

  if (parser?.parseUploadedFile) {
    return parser.parseUploadedFile(file);
  }

  const rawText = await readFileAsText(file);
  return parsePlainTextDocument(rawText, file.name);
}

export function parseGoogleDriveDocument(document: any): ParserResult {
  const parser = resolveParser("googleDrive");
  if (parser?.parseDriveDocument) {
    return parser.parseDriveDocument(document);
  }
  return parseDriveDocument(document);
}

function readFileAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
