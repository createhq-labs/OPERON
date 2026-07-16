"use client";

import type { ParagraphBlock } from "@/renderers/types";

export function renderParagraph(block: ParagraphBlock, index: number) {
  return (
    <p
      key={block.id ?? `paragraph-${index}`}
      style={{
        fontFamily: "var(--font-body)",
        fontSize: "var(--text-16)",
        fontWeight: 400,
        lineHeight: 1.75,
        letterSpacing: "-0.005em",
        color: "var(--op-text)",
        margin: 0,
        maxWidth: "65ch",
      }}
    >
      {block.content}
    </p>
  );
}