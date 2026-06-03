import { parsePlainTextDocument } from "@/services/parser/plainTextParser";
import type { ParserResult } from "@/services/parser/types";

export function parseMarkdownDocument(rawMarkdown: string, fileName: string): ParserResult {
  const source = rawMarkdown.replace(/\r\n/g, "\n");
  const blocks: ParserResult["blocks"] = [];
  const lines = source.split(/\n/g);
  let currentParagraph: string[] = [];

  const flushParagraph = () => {
    if (currentParagraph.length > 0) {
      blocks.push({ type: "paragraph", content: currentParagraph.join(" ") });
      currentParagraph = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      const level = headingMatch[1].length;
      blocks.push({
        type: level === 1 ? "heading" : level <= 3 ? "subheading" : "paragraph",
        content: headingMatch[2].trim(),
      });
      continue;
    }

    const checklistMatch = line.match(/^[-*+]\s*\[( |x|X)\]\s+(.*)$/);
    if (checklistMatch) {
      flushParagraph();
      blocks.push({ type: "checklist", content: { title: "Checklist", items: [{ id: checklistMatch[2].trim().toLowerCase().replace(/[^a-z0-9]+/gi, "-"), label: checklistMatch[2].trim(), checked: checklistMatch[1].toLowerCase() === "x" }] } });
      continue;
    }

    const listMatch = line.match(/^[-*+]\s+(.*)$/);
    if (listMatch) {
      flushParagraph();
      blocks.push({ type: "steps", content: [{ title: listMatch[1].trim(), description: "" }] });
      continue;
    }

    const blockquoteMatch = line.match(/^>\s+(.*)$/);
    if (blockquoteMatch) {
      flushParagraph();
      blocks.push({ type: "paragraph", content: blockquoteMatch[1].trim() });
      continue;
    }

    const tableSeparator = line.match(/^\|?\s*-{3,}\s*(\|\s*-{3,}\s*)+$/);
    if (tableSeparator && blocks.length > 0 && blocks[blocks.length - 1].type === "table") {
      continue;
    }

    const isTableRow = line.includes("|");
    if (isTableRow) {
      flushParagraph();
      const columns = line.split("|").map((value) => value.trim()).filter(Boolean);
      blocks.push({ type: "table", content: { rows: [columns] } });
      continue;
    }

    currentParagraph.push(line);
  }

  flushParagraph();

  if (blocks.length === 0) {
    return parsePlainTextDocument(source, fileName);
  }

  const content = blocks
    .map((block) => (typeof block.content === "string" ? block.content : JSON.stringify(block.content)))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    title: fileName.replace(/\.[^/.]+$/, ""),
    description: content.split(" ").slice(0, 40).join(" "),
    blocks,
    toc: blocks
      .filter((block) => block.type === "heading" || block.type === "subheading")
      .map((block, index) => ({ id: block.id ?? `heading-${index + 1}`, label: String(block.content), level: block.type === "heading" ? 1 : 2 })),
    content,
    warnings: [],
    confidence: 0.8,
  };
}
