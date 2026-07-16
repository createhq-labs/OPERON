import type { Block } from "@/core/types";
import type { DocumentSection, SectionLayoutId } from "@/features/reader/types";

// Matches "1. ", "2) " etc — a manually-typed ordinal, not real list
// formatting (parsers only get real bullet/number metadata from sources
// that expose it; plenty of source docs just type the numeral instead).
const NUMBERED_PARAGRAPH = /^\d{1,3}[.)]\s+(.*)$/s;

/**
 * Consecutive paragraphs that are each hand-numbered ("1. …", "2. …") read as
 * a list but render as indistinguishable stacked paragraphs — this regroups
 * runs of 2+ into a single steps block so they get the numbered-circle
 * treatment instead. A lone numbered paragraph (no run) is left untouched;
 * one item isn't a list.
 */
function mergeNumberedParagraphsIntoSteps(blocks: Block[]): Block[] {
  const result: Block[] = [];
  let run: Array<{ title: string; original: Block }> = [];

  const flushRun = () => {
    if (run.length >= 2) {
      result.push({
        type: "steps",
        items: run.map((item) => ({ title: item.title, description: "" })),
      } as Block);
    } else if (run.length === 1) {
      result.push(run[0].original);
    }
    run = [];
  };

  for (const block of blocks) {
    const content = block.type === "paragraph" ? (block as { content?: string }).content : undefined;
    const match = typeof content === "string" ? NUMBERED_PARAGRAPH.exec(content) : null;
    if (match) {
      run.push({ title: match[1].trim(), original: block });
      continue;
    }
    flushRun();
    result.push(block);
  }
  flushRun();

  return result;
}

/**
 * Splits a flat block stream into visual sections at every level-1 heading
 * (subheadings stay inside the current section — "each original major
 * heading becomes a full visual section", not every heading level). Content
 * before the first heading becomes a heading-less leading section so nothing
 * is dropped.
 */
export function groupBlocksIntoSections(blocks: Block[]): DocumentSection[] {
  const sections: DocumentSection[] = [];
  let current: DocumentSection | null = null;
  let sectionIndex = 0;

  const startSection = (headingBlock: Block | null) => {
    sectionIndex += 1;
    current = {
      id: `section-${sectionIndex}`,
      headingBlock,
      blocks: headingBlock ? [headingBlock] : [],
      layout: "narrow-column",
    };
    sections.push(current);
  };

  for (const block of mergeNumberedParagraphsIntoSteps(blocks)) {
    if (block.type === "heading") {
      startSection(block);
      continue;
    }
    if (!current) startSection(null);
    current!.blocks.push(block);
  }

  for (const section of sections) {
    section.layout = chooseDefaultLayout(section);
  }

  return sections;
}

/**
 * Best-effort default composition per section, driven only by what block
 * types are actually present — never by content meaning. This is a starting
 * point the review screen lets a human correct, not a guarantee.
 */
function chooseDefaultLayout(section: DocumentSection): SectionLayoutId {
  const bodyBlocks = section.headingBlock ? section.blocks.slice(1) : section.blocks;
  const types = bodyBlocks.map((block) => block.type);

  if (types.includes("timeline")) return "timeline";
  if (types.includes("table")) return "editorial-table";
  if (types.includes("checklist")) return "checklist";
  if (types.includes("steps")) return "numbered-process";

  // A lone callout promotes to a full-bleed pull-quote — only "callout", never
  // warning/note/success (a warning rendered as an oversized quote would be
  // misleading), and only when the callout IS the whole section. A callout
  // alongside other content still renders inline via the regular alert card.
  if (bodyBlocks.length === 1 && bodyBlocks[0].type === "callout") return "quote";

  // Heading-gated and capped — a short, heading-introduced list of short items
  // reads as "N things" (feature bullets); a heading-less or long bullet list
  // (appendix/footnote/glossary shape) is more likely to want to stay plain.
  if (
    section.headingBlock &&
    types.length >= 3 &&
    types.length <= 8 &&
    types.every((type) => type === "list_item") &&
    bodyBlocks.every((block) => ((block as { content?: string }).content ?? "").length <= 60)
  ) {
    return "feature-cards";
  }

  const imageCount = types.filter((type) => type === "image").length;
  const textCount = bodyBlocks.filter((block) => block.type === "paragraph" || block.type === "list_item").length;

  if (imageCount > 0 && bodyBlocks.length === imageCount) {
    return imageCount >= 3 ? "gallery" : "image-led";
  }
  if (imageCount > 0 && textCount > 0) return "split";

  if (bodyBlocks.length === 1 && bodyBlocks[0].type === "paragraph") {
    const content = (bodyBlocks[0] as { content?: string }).content ?? "";
    if (content.length > 0 && content.length <= 180) return "full-width-statement";
  }

  return "narrow-column";
}
