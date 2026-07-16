"use client";

import { renderBlock } from "@/renderers";
import type { DocumentSection } from "@/features/reader/types";

/** Same numbered-steps rendering as the default renderer, just given a wider column — numbered lists read better with more room. */
export function NumberedProcessSection({ section }: { section: DocumentSection }) {
  return (
    <section style={{ maxWidth: "760px", margin: "0 auto", padding: "96px 24px" }}>
      {section.blocks.map((block, index) => renderBlock(block, index))}
    </section>
  );
}
