import type { DriveDocumentPayload, ParserResult } from "@/services/parser/types";

function extractParagraphText(element: any) {
  if (!element.paragraph) return "";
  return (element.paragraph.elements ?? [])
    .map((item: any) => item.textRun?.content ?? "")
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTableContent(table: any) {
  const headers = table.tableRows[0]?.tableCells?.map((cell: any) => extractParagraphText(cell.content[0] ?? {})) || [];
  const rows = table.tableRows.slice(1).map((row: any) =>
    row.tableCells.map((cell: any) => extractParagraphText(cell.content?.[0] ?? {}))
  );
  return { headers, rows };
}

export function parseDriveDocument(document: DriveDocumentPayload): ParserResult {
  const blocks: any[] = [];
  const toc: { id: string; label: string; level: 1 | 2 }[] = [];
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
        toc.push({ id, label: text, level });
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

  return {
    title: document.title,
    description:
      document.body.content?.find((element: any) => element.type === "paragraph" && extractParagraphText(element))?.paragraph?.elements
        ?.map((item: any) => item.textRun?.content ?? "")
        .join(" ")
        ?.slice(0, 200) ?? "Drive content is linked and pending synchronization.",
    blocks: blocks.length > 0 ? blocks : [{ type: "paragraph", content: "Drive document metadata is linked. Content will display once the document is synchronized." }],
    toc,
    content: document.body.content?.map((element: any) => extractParagraphText(element)).filter(Boolean).join(" ") ?? "",
  };
}
