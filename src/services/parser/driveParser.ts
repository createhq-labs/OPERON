import type { DriveDocumentPayload, ParserResult } from "@/services/parser/types";

function extractParagraphText(element: { paragraph?: { elements?: Array<{ textRun?: { content?: string } }> } }) {
  if (!element.paragraph) return "";
  return (element.paragraph.elements ?? [])
    .map((item) => item.textRun?.content ?? "")
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTableContent(table: {
  tableRows: Array<{
    tableCells: Array<{ content: DriveDocumentPayload["body"]["content"] }>;
  }>;
}) {
  const headers =
    table.tableRows[0]?.tableCells?.map((cell) =>
      extractParagraphText((cell.content[0] as { paragraph?: { elements?: Array<{ textRun?: { content?: string } }> } }) ?? {})
    ) ?? [];
  const rows = table.tableRows.slice(1).map((row) =>
    row.tableCells.map((cell) =>
      extractParagraphText((cell.content?.[0] as { paragraph?: { elements?: Array<{ textRun?: { content?: string } }> } }) ?? {})
    )
  );
  return { headers, rows };
}

export function parseDriveDocument(document: DriveDocumentPayload): ParserResult {
  const blocks: ParserResult["blocks"] = [];
  const toc: ParserResult["toc"] = [];
  let headingIndex = 0;

  for (const element of document.body.content ?? []) {
    if (element.type === "paragraph" && element.paragraph) {
      const text = extractParagraphText(element);
      if (!text) continue;

      if (element.paragraph.paragraphStyle?.namedStyleType?.startsWith("HEADING")) {
        headingIndex += 1;
        const level = element.paragraph.paragraphStyle.namedStyleType === "HEADING_1" ? 1 : 2;
        const id = `heading-${headingIndex}`;
        blocks.push({ type: level === 1 ? "heading" : "subheading", content: text, id });
        toc.push({ id, text, level: level as 1 | 2 | 3 });
        continue;
      }

      if (element.paragraph.bullet) {
        blocks.push({ type: "steps", content: [{ title: text, description: "" }] });
        continue;
      }

      blocks.push({ type: "paragraph", content: text });
      continue;
    }

    if (element.type === "table" && element.table) {
      const tableData = extractTableContent(element.table);
      blocks.push({ type: "table", content: tableData });
    }
  }

  const firstParagraph = document.body.content
    ?.find((element) => element.type === "paragraph" && extractParagraphText(element));

  const description = firstParagraph
    ? (firstParagraph.paragraph?.elements?.map((item) => item.textRun?.content ?? "").join(" ") ?? "")
        .slice(0, 200)
    : "Drive content is linked and pending synchronization.";

  return {
    title: document.title,
    description,
    blocks:
      blocks.length > 0
        ? blocks
        : [{ type: "paragraph", content: "Drive document metadata is linked. Content will display once the document is synchronized." }],
    toc,
    content:
      document.body.content
        ?.map((element) => extractParagraphText(element))
        .filter(Boolean)
        .join(" ") ?? "",
  };
}