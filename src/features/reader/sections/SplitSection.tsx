"use client";

import { renderBlock } from "@/renderers";
import type { DocumentSection } from "@/features/reader/types";

/** Text and image side by side; stacks to a single column on narrow screens. */
export function SplitSection({ section }: { section: DocumentSection }) {
  const body = section.headingBlock ? section.blocks.slice(1) : section.blocks;
  const imageBlocks = body.filter((block) => block.type === "image");
  const textBlocks = body.filter((block) => block.type !== "image");

  return (
    <section style={{ maxWidth: "1100px", margin: "0 auto", padding: "96px 24px" }}>
      {section.headingBlock && (
        <div style={{ marginBottom: "40px" }}>{renderBlock(section.headingBlock, 0)}</div>
      )}
      <div
        className="reader-split-grid"
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "48px", alignItems: "center" }}
      >
        <div>{textBlocks.map((block, index) => renderBlock(block, index))}</div>
        <div>{imageBlocks.map((block, index) => renderBlock(block, index))}</div>
      </div>
      <style>{`@media (max-width: 767px) { .reader-split-grid { grid-template-columns: 1fr !important; } }`}</style>
    </section>
  );
}
