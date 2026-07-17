"use client";

import { renderBlock } from "@/renderers";
import { RevealBlocks } from "@/features/reader/RevealBlocks";
import type { DocumentSection } from "@/features/reader/types";

/** Minimal, narrow treatment matching the checklist card's own compact styling. */
export function ChecklistSection({ section }: { section: DocumentSection }) {
  const body = section.headingBlock ? section.blocks.slice(1) : section.blocks;

  return (
    <section style={{ maxWidth: "600px", margin: "0 auto", padding: "80px 24px" }}>
      {section.headingBlock && renderBlock(section.headingBlock, 0)}
      <RevealBlocks blocks={body} />
    </section>
  );
}
