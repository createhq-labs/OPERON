import type { ParserResult } from "@/services/parser/types";
import { parsePlainTextDocument } from "@/services/parser/plainTextParser";

export async function parseDocxDocument(file: File): Promise<ParserResult> {
  try {
    const { default: mammoth } = await import("mammoth");
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    const text = result.value.replace(/\r\n/g, "\n").trim();
    return parsePlainTextDocument(text, file.name);
  } catch (error) {
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
