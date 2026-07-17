"use client";

import { renderBlock } from "@/renderers";
import { RevealBlocks } from "@/features/reader/RevealBlocks";
import type { DocumentSection } from "@/features/reader/types";

/** Default composition: heading + body in a single readable column. */
export function NarrowColumnSection({ section }: { section: DocumentSection }) {
  const body = section.headingBlock ? section.blocks.slice(1) : section.blocks;

  return (
    <section style={{ maxWidth: "640px", margin: "0 auto", padding: "96px 24px" }}>
      {section.headingBlock && renderBlock(section.headingBlock, 0)}
      <RevealBlocks blocks={body} lede />
    </section>
  );
}
