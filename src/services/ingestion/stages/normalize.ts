import type { ParserResult } from "@/services/parser/types";

export interface NormalizedDocument {
  parsed: ParserResult;
  blocks: ParserResult["blocks"];
  toc: ParserResult["toc"];
  searchableText: string;
}

function normalizeBlock(block: ParserResult["blocks"][number], index: number) {
  return {
    ...block,
    id: block.id || `block-${index + 1}`,
    searchableText: typeof block.content === "string" ? block.content.trim() : JSON.stringify(block.content),
    normalizedText: typeof block.content === "string" ? block.content.trim().replace(/\s+/g, " ") : JSON.stringify(block.content),
  };
}

export function normalizeParsedDocument(parsed: ParserResult): NormalizedDocument {
  const blocks = (parsed.blocks || []).map(normalizeBlock);
  const toc = parsed.toc && parsed.toc.length > 0
    ? parsed.toc
    : blocks
        .filter((block) => block.type === "heading" || block.type === "subheading")
        .map((block, index) => ({ id: block.id || `heading-${index + 1}`, text: String(block.content), level: (block.type === "heading" ? 1 : 2) as 1 | 2 | 3 }));

  const searchableText = blocks.map((block) => block.searchableText || "").join(" ").trim();

  return {
    parsed,
    blocks,
    toc,
    searchableText,
  };
}
