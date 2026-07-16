"use client";

import { renderBlock } from "@/renderers";
import type { DocumentSection } from "@/features/reader/types";

/** Image(s) full-bleed at the top, heading and any remaining text in a narrow column below. */
export function ImageLedSection({ section }: { section: DocumentSection }) {
  const body = section.headingBlock ? section.blocks.slice(1) : section.blocks;
  const images = body.filter((block) => block.type === "image");
  const rest = body.filter((block) => block.type !== "image");

  return (
    <section style={{ padding: "0 0 96px" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 24px" }}>
        {images.map((block, index) => renderBlock(block, index))}
      </div>
      <div style={{ maxWidth: "640px", margin: "40px auto 0", padding: "0 24px" }}>
        {section.headingBlock && renderBlock(section.headingBlock, 0)}
        {rest.map((block, index) => renderBlock(block, index))}
      </div>
    </section>
  );
}
