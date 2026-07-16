import type { DriveDocumentPayload, ParserResult } from "@/services/parser/types";

type DriveContentNode = DriveDocumentPayload["body"]["content"][number];

type DriveElement = {
  paragraph?: { elements?: Array<{ textRun?: { content?: string } }> };
};

function extractParagraphText(element: DriveElement): string {
  if (!element.paragraph) return "";
  return (element.paragraph.elements ?? [])
    .map((item) => item.textRun?.content ?? "")
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

type DriveTableRow = {
  tableCells: Array<{ content: DriveDocumentPayload["body"]["content"] }>;
};

function extractTableContent(tableRows: DriveTableRow[]): {
  headers: string[];
  rows: string[][];
} {
  const headers =
    tableRows[0]?.tableCells?.map((cell) =>
      extractParagraphText(
        (cell.content[0] as DriveElement) ?? {}
      )
    ) ?? [];
  const rows = tableRows.slice(1).map((row) =>
    row.tableCells.map((cell) =>
      extractParagraphText((cell.content?.[0] as DriveElement) ?? {})
    )
  );
  return { headers, rows };
}

export function parseDriveDocument(
  document: DriveDocumentPayload
): ParserResult {
  const blocks: ParserResult["blocks"] = [];
  const toc:    ParserResult["toc"]    = [];
  let   headingIndex                   = 0;

  for (const element of document.body.content ?? []) {
    if (element.type === "paragraph" && element.paragraph) {
      const text = extractParagraphText(element as DriveElement);
      if (!text) continue;

      const styleType =
        element.paragraph.paragraphStyle?.namedStyleType ?? "";

      if (styleType.startsWith("HEADING")) {
        headingIndex += 1;
        const level = styleType === "HEADING_1" ? 1 : 2;
        const id    = `heading-${headingIndex}`;
        blocks.push({
          type:    level === 1 ? "heading" : "subheading",
          content: text,
          id,
        });
        toc.push({ id, text, level: level as 1 | 2 | 3 });
        continue;
      }

      if (element.paragraph.bullet) {
        blocks.push({
          type:    "steps",
          content: [{ title: text, description: "" }],
        });
        continue;
      }

      blocks.push({ type: "paragraph", content: text });
      continue;
    }

    if (element.type === "table" && element.table) {
      const tableData = extractTableContent(element.table.tableRows);
      blocks.push({ type: "table", content: tableData });
    }
  }

  const firstParagraph = document.body.content?.find(
    (el): el is DriveContentNode =>
      el.type === "paragraph" &&
      Boolean(extractParagraphText(el as DriveElement))
  );

  const description = firstParagraph
    ? (
        firstParagraph.paragraph?.elements
          ?.map((item) => item.textRun?.content ?? "")
          .join(" ") ?? ""
      ).slice(0, 200)
    : "Drive content is linked and pending synchronization.";

  return {
    title:       document.title,
    description,
    blocks:
      blocks.length > 0
        ? blocks
        : [
            {
              type:    "paragraph",
              content:
                "Drive document metadata is linked. Content will display once the document is synchronized.",
            },
          ],
    toc,
    content:
      document.body.content
        ?.map((el) => extractParagraphText(el as DriveElement))
        .filter(Boolean)
        .join(" ") ?? "",
  };
}