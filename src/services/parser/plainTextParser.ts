import type { DocumentBlock, ParserResult } from "@/services/parser/types";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[\s]+/g, "-")
    .replace(/[^a-z0-9\-]/g, "")
    .replace(/\-+/g, "-")
    .replace(/^\-+|\-+$/g, "");

export function parsePlainTextDocument(rawText: string, fileName: string): ParserResult {
  const content = rawText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/\t/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();

  const lines = content.split(/\n/);
  const blocks: DocumentBlock[] = [];
  let paragraphLines: string[] = [];
  let listLines: string[] = [];
  let checklistItems: Array<{ id: string; label: string }> = [];
  let pendingQuestion: string | null = null;
  const faqItems: Array<{ question: string; answer: string }> = [];

  const flushParagraph = () => {
    if (paragraphLines.length > 0) {
      blocks.push({ type: "paragraph", content: paragraphLines.join(" ") });
      paragraphLines = [];
    }
  };

  const flushChecklist = () => {
    if (checklistItems.length > 0) {
      blocks.push({ type: "checklist", content: { title: "Checklist", items: checklistItems } });
      checklistItems = [];
    }
  };

  const flushList = () => {
    if (listLines.length === 1) {
      paragraphLines.push(listLines[0]);
      listLines = [];
      return;
    }
    if (listLines.length > 1) {
      blocks.push({ type: "steps", content: listLines.map((item) => ({ title: item, description: "" })) });
      listLines = [];
    }
  };

  const flushFaq = () => {
    if (faqItems.length > 0) {
      blocks.push({ type: "faq", content: faqItems });
    }
  };

  const flushAll = () => {
    flushChecklist();
    flushList();
    flushParagraph();
    flushFaq();
    pendingQuestion = null;
  };

  const parseMarkdownHeading = (line: string) => {
    const match = line.match(/^(#{1,3})\s+(.*)$/);
    if (!match) return null;
    return { level: match[1].length, text: match[2].trim() };
  };

  const isLikelyHeading = (line: string) => {
    if (/^[A-Z][A-Za-z\s\-\/:]{3,}\s*$/.test(line) && line === line.toUpperCase()) {
      return true;
    }
    if (/^([A-Z][a-z]+\s?){2,}$/.test(line) && line.endsWith(":")) {
      return true;
    }
    return /^[A-Z][A-Za-z\s]{3,}\:?$/.test(line);
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushAll();
      continue;
    }

    const heading = parseMarkdownHeading(line);
    if (heading) {
      flushAll();
      const id = slugify(heading.text);
      blocks.push({ type: heading.level === 1 ? "heading" : "subheading", content: heading.text, id, metadata: { importance: "high" } });
      continue;
    }

    const checkboxMatch = line.match(/^[-*+]\s*\[( |x|X)\]\s+(.*)$/);
    if (checkboxMatch) {
      flushParagraph();
      flushList();
      checklistItems.push({ id: slugify(checkboxMatch[2].trim()), label: checkboxMatch[2].trim() });
      continue;
    }

    const bulletMatch = line.match(/^[-*+]\s+(.*)$/);
    if (bulletMatch) {
      flushParagraph();
      listLines.push(bulletMatch[1].trim());
      continue;
    }

    const noteMatch = line.match(/^(NOTE|IMPORTANT|TIP|WARNING|CAUTION)[:\-]\s*(.*)$/i);
    if (noteMatch) {
      flushAll();
      blocks.push({ type: "note", content: noteMatch[2].trim(), id: slugify(noteMatch[2].trim()) });
      continue;
    }

    if (pendingQuestion && !isLikelyHeading(line)) {
      faqItems.push({ question: pendingQuestion, answer: line });
      pendingQuestion = null;
      continue;
    }

    if (line.endsWith("?")) {
      flushParagraph();
      pendingQuestion = line;
      continue;
    }

    if (isLikelyHeading(line)) {
      flushAll();
      blocks.push({ type: "heading", content: line.replace(/[:\-]+$/, "").trim(), id: slugify(line) });
      continue;
    }

    paragraphLines.push(line);
  }

  flushAll();

  if (blocks.length === 0) {
    blocks.push({ type: "paragraph", content: "No content could be extracted from this file." });
  }

  const toc = blocks
    .filter((block) => block.type === "heading" || block.type === "subheading")
    .map((block) => ({
      id: block.id ?? slugify(String(block.content)),
      label: String(block.content),
      level: (block.type === "heading" ? 1 : 2) as 1 | 2,
    }));

  const title = toc.length > 0 ? toc[0].label : fileName.replace(/\.[^/.]+$/, "");
  const description = blocks.find((block) => block.type === "paragraph")?.content ?? "";

  return { title, description, blocks, toc, content };
}
