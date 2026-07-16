"use client";

import { renderBlock } from "@/renderers";
import type { DocumentSection } from "@/features/reader/types";

/** Default composition: heading + body in a single readable column. */
export function NarrowColumnSection({ section }: { section: DocumentSection }) {
  return (
    <section style={{ maxWidth: "640px", margin: "0 auto", padding: "96px 24px" }}>
      {section.blocks.map((block, index) => renderBlock(block, index))}
    </section>
  );
}
