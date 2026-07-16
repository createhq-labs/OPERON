"use client";

import type { ParagraphBlock } from "@/renderers/types";

export function renderParagraph(block: ParagraphBlock, index: number) {
  return (
    <p
      key={block.id ?? `paragraph-${index}`}
      style={{
        fontFamily: "var(--font-body)",
        fontSize: "var(--text-14)",
        fontWeight: 400,
        lineHeight: 1.8,
        color: "var(--op-text-2)",
        margin: 0,
        maxWidth: "68ch",
      }}
    >
      {block.content}
    </p>
  );
}