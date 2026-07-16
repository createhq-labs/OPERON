import type { ParserResult } from "@/services/parser/types";
import { parseHtmlDocument } from "@/services/parser/htmlParser";

/**
 * mammoth.convertToHtml (not extractRawText) preserves headings, lists,
 * tables, and embeds images as base64 data URIs by default — real structure,
 * not a flat string. Reusing htmlParser.ts's already-working heading/table/
 * image detection instead of re-solving the same problem for DOCX.
 */
export async function parseDocxDocument(file: File): Promise<ParserResult> {
  try {
    const { default: mammoth } = await import("mammoth");
    const arrayBuffer = await file.arrayBuffer();
    const { value: html, messages } = await mammoth.convertToHtml({ arrayBuffer });

    const result = parseHtmlDocument(html, file.name);
    const mammothWarnings = messages
      .filter((message) => message.type === "warning")
      .map((message) => message.message);

    return mammothWarnings.length > 0
      ? { ...result, warnings: [...(result.warnings ?? []), ...mammothWarnings] }
      : result;
  } catch {
    return {
      title: file.name.replace(/\.[^/.]+$/, ""),
      description: "Unable to extract content from this document.",
      blocks: [
        {
          type: "paragraph",
          content: "The uploaded DOCX file could not be parsed. Please retry with a text-based file or try again later.",
        },
      ],
      toc: [],
      content: "",
    };
  }
}
