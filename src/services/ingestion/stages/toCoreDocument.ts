import type { Block, TocItem } from "@/core/types";
import type { DocumentBlock, ParserResult } from "@/services/parser/types";

/**
 * Parser-layer blocks (services/parser/types.ts) and TOC entries are
 * structurally different from the domain Block/TocItem shapes in
 * core/types.ts — most visibly, tables nest `{rows, headers}` under
 * `content` at the parser layer but declare `headers`/`rows` as top-level
 * fields on core's TableBlock, and TOC entries use `text` at the parser
 * layer vs. `label` on core's TocItem. Every parser (PDF, DOCX, HTML,
 * plain text, Google Drive) produces the parser-layer shape; this is the
 * single place that reconciles it into what the reader/renderers actually
 * consume, replacing the silent unchecked cast persist.ts used to do.
 */
export function toCoreBlocks(blocks: DocumentBlock[]): Block[] {
  return blocks.map((block, index) => toCoreBlock(block, index));
}

function toCoreBlock(block: DocumentBlock, index: number): Block {
  const id = block.id || `block-${index + 1}`;

  switch (block.type) {
    case "heading":
      return { type: "heading", id, content: String(block.content), anchorId: id };
    case "subheading":
      return { type: "subheading", id, content: String(block.content) };
    case "paragraph":
      return { type: "paragraph", id, content: String(block.content) };
    case "code":
      return { type: "code", id, content: String(block.content) };
    case "list_item":
      return { type: "list_item", id, content: String(block.content) };
    case "image": {
      const content = block.content;
      return { type: "image", id, content: { src: content.src, alt: content.alt } };
    }
    case "table": {
      const content = block.content;
      return { type: "table", id, headers: content.headers ?? [], rows: content.rows };
    }
    case "steps": {
      const items = block.content;
      return { type: "steps", id, items };
    }
    case "warning":
    case "note":
    case "callout":
    case "success": {
      const content = typeof block.content === "string" ? block.content : JSON.stringify(block.content);
      return { type: block.type, id, content };
    }
    case "checklist": {
      const items = Array.isArray(block.content) ? block.content : [];
      return {
        type: "checklist",
        id,
        title: "Checklist",
        items: items.map((item, itemIndex) => ({
          id: (item as { id?: string }).id ?? `item-${itemIndex + 1}`,
          label: (item as { label?: string }).label ?? "",
        })),
      };
    }
    case "faq": {
      const items = Array.isArray(block.content) ? block.content : [];
      return {
        type: "faq",
        id,
        items: items.map((item) => ({
          question: (item as { question?: string }).question ?? "",
          answer: (item as { answer?: string }).answer ?? "",
        })),
      };
    }
    default: {
      // timeline/resource/video/embed/SOP_step/policy/financial_entry/
      // announcement/onboarding_step — not produced by any current parser
      // (PDF, DOCX, HTML, plain text, Google Drive). Fall back to a plain
      // paragraph rather than silently dropping the content if one ever is.
      const content = typeof block.content === "string" ? block.content : JSON.stringify(block.content);
      return { type: "paragraph", id, content };
    }
  }
}

export function toCoreToc(toc: ParserResult["toc"]): TocItem[] {
  return toc.map((item) => ({ id: item.id, label: item.text, level: item.level }));
}
