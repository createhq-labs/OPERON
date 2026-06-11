import type { DriveDocumentPayload, ParserResult } from "@/services/parser/types";

function flattenDriveContent(nodes: DriveDocumentPayload['body']['content']): string {
  return nodes
    .flatMap((node) => {
      if (node.type === "paragraph" && node.paragraph?.elements) {
        return node.paragraph.elements.map((element) => element.textRun?.content ?? "").filter(Boolean);
      }
      if (node.type === "table" && node.table?.tableRows) {
        return node.table.tableRows.flatMap((row) => row.tableCells.flatMap((cell) => flattenDriveContent(cell.content)));
      }
      return [""];
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseGoogleDocsDocument(document: DriveDocumentPayload): ParserResult {
  const blocks: ParserResult["blocks"] = [];
  const content = flattenDriveContent(document.body.content);

  document.body.content.forEach((node) => {
    if (node.type === "paragraph" && node.paragraph) {
      const paragraphText = node.paragraph.elements?.map((element) => element.textRun?.content ?? "").join("")?.trim();
      if (paragraphText) {
        if (paragraphText.startsWith("#")) {
          const headingText = paragraphText.replace(/^#+\s*/, "");
          blocks.push({ type: "heading", id: headingText.toLowerCase().replace(/\s+/g, "-"), content: paragraphText });
        } else {
          blocks.push({ type: "paragraph", content: paragraphText });
        }
      }
    }

    if (node.type === "table" && node.table) {
      const rows = node.table.tableRows.map((row) => row.tableCells.map((cell) => flattenDriveContent(cell.content)));
      blocks.push({ type: "table", content: { rows } });
    }
  });

  return {
    title: document.title,
    description: content.split(" ").slice(0, 40).join(" "),
    blocks: blocks.length > 0 ? blocks : [{ type: "paragraph", content: content || "No content extracted from Google Drive document." }],
    toc: [],
    content,
    warnings: [],
    confidence: 0.8,
    metadata: {
      source: "googleDrive",
      documentId: document.documentId,
    },
  };
}
