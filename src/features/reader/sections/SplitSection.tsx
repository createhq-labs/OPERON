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
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "48px", alignItems: "start" }}
      >
        <div>{textBlocks.map((block, index) => renderBlock(block, index))}</div>
        <div className="reader-split-image" style={{ display: "flex", flexDirection: "column" }}>
          {imageBlocks.map((block, index) => renderBlock(block, index))}
        </div>
      </div>
      <style>{`
        @media (max-width: 767px) { .reader-split-grid { grid-template-columns: 1fr !important; } }
        /* Caps small/wide assets (logos, wordmarks) so they don't stretch into an
           oddly squat bar just because the paired text column is much taller. */
        .reader-split-image img { max-width: 360px; width: 100%; margin: 0 auto; }
      `}</style>
    </section>
  );
}
