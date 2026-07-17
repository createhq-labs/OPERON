"use client";

import { renderBlock } from "@/renderers";
import { RevealBlocks } from "@/features/reader/RevealBlocks";
import type { DocumentSection } from "@/features/reader/types";

/** Same numbered-steps rendering as the default renderer, just given a wider column — numbered lists read better with more room. */
export function NumberedProcessSection({ section }: { section: DocumentSection }) {
  const body = section.headingBlock ? section.blocks.slice(1) : section.blocks;

  return (
    <section style={{ maxWidth: "760px", margin: "0 auto", padding: "96px 24px" }}>
      {section.headingBlock && renderBlock(section.headingBlock, 0)}
      <RevealBlocks blocks={body} />
    </section>
  );
}
