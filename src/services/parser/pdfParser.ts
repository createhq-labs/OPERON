import type { DocumentBlock, ParserResult } from "@/services/parser/types";

function normalizeTextContent(items: any[]) {
  return items
    .map((item) => {
      if (item.str) return item.str;
      if (item.value) return item.value;
      return "";
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function parsePdfDocument(file: File): Promise<ParserResult> {
  try {
    const pdfjs = (await import("pdfjs-dist")) as any;
    const { getDocument, GlobalWorkerOptions } = pdfjs;
    GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.213/build/pdf.worker.min.js";
    const buffer = await file.arrayBuffer();
    const pdf = await getDocument({ data: buffer }).promise;
    const page = await pdf.getPage(1);
    const content = await page.getTextContent();
    const text = normalizeTextContent(content.items);
    const lines = text.split(/\n|\.\s+/).map((line) => line.trim()).filter(Boolean);
    const blocks: DocumentBlock[] = lines.map((line) => ({ type: "paragraph", content: line }));

    return {
      title: file.name.replace(/\.[^/.]+$/, ""),
      description: lines.slice(0, 2).join(" "),
      blocks: blocks.length > 0 ? blocks : [{ type: "paragraph", content: "The PDF file contains no readable text on the first page." }],
      toc: [],
      content: text,
    };
  } catch (error) {
    return {
      title: file.name.replace(/\.[^/.]+$/, ""),
      description: "Unable to extract content from this PDF file.",
      blocks: [
        {
          type: "paragraph",
          content: "The uploaded PDF could not be parsed. Please retry with a supported version or use a text document.",
        },
      ],
      toc: [],
      content: "",
    };
  }
}
