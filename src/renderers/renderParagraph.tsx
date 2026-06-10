import type { ParagraphBlock } from "@/renderers/types";

export function renderParagraph(block: ParagraphBlock, index: number) {
  return (
    <p
      key={block.id ?? `paragraph-${index}`}
      style={{
        fontFamily: "var(--font-body)",
        fontSize: "var(--text-14)",
        lineHeight: "1.7",
        color: "var(--text-2)",
        margin: 0,
      }}
    >
      {block.content}
    </p>
  );
}