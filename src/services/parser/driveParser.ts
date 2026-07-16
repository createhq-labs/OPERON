import type { DriveDocumentContent, DriveDocumentPayload, DriveDocumentTab, ParserResult } from "@/services/parser/types";

type DriveContentNode = DriveDocumentContent["content"][number];

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
  tableCells: Array<{ content: DriveDocumentContent["content"] }>;
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

/**
 * Depth-first flatten of a document's tabs (Google Docs tabs can nest child
 * tabs) into an ordered list of { title, content } — one entry per tab, in
 * the order they appear in the tab bar.
 */
function flattenTabs(tabs: DriveDocumentTab[]): Array<{ title?: string; content: DriveDocumentContent["content"] }> {
  const flattened: Array<{ title?: string; content: DriveDocumentContent["content"] }> = [];
  for (const tab of tabs) {
    flattened.push({
      title: tab.tabProperties?.title,
      content: tab.documentTab?.body?.content ?? [],
    });
    if (tab.childTabs?.length) {
      flattened.push(...flattenTabs(tab.childTabs));
    }
  }
  return flattened;
}

/**
 * Multi-tab Google Docs (a document split into tabs in the Docs UI, e.g. one
 * per handbook chapter) put each tab's content under Document.tabs rather
 * than the top-level Document.body — without this, only the first tab's
 * content would ever reach the reader. Requires the caller to have fetched
 * the document with includeTabsContent=true.
 */
function resolveContentSources(document: DriveDocumentPayload): Array<{ title?: string; content: DriveDocumentContent["content"] }> {
  if (document.tabs?.length) return flattenTabs(document.tabs);
  return [{ content: document.body?.content ?? [] }];
}

export function parseDriveDocument(
  document: DriveDocumentPayload
): ParserResult {
  const blocks: ParserResult["blocks"] = [];
  const toc:    ParserResult["toc"]    = [];
  let   headingIndex                   = 0;

  const sources = resolveContentSources(document);
  const isMultiTab = sources.length > 1;

  for (const source of sources) {
    // Each tab becomes its own top-level heading so the reader groups it as
    // a distinct section (matching groupBlocksIntoSections' one-section-per-
    // heading behavior) instead of silently merging tabs together.
    if (isMultiTab && source.title) {
      headingIndex += 1;
      const id = `heading-${headingIndex}`;
      blocks.push({ type: "heading", content: source.title, id });
      toc.push({ id, text: source.title, level: 1 });
    }

    for (const element of source.content ?? []) {
      if (element.paragraph) {
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

      if (element.table) {
        const tableData = extractTableContent(element.table.tableRows);
        blocks.push({ type: "table", content: tableData });
      }
    }
  }

  const firstParagraph = sources
    .flatMap((source) => source.content ?? [])
    .find(
      (el): el is DriveContentNode =>
        Boolean(el.paragraph) && Boolean(extractParagraphText(el as DriveElement))
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
      sources
        .flatMap((source) => source.content ?? [])
        .map((el) => extractParagraphText(el as DriveElement))
        .filter(Boolean)
        .join(" ") ?? "",
  };
}
