"use client";

import { renderBlock } from "@/renderers";
import type { DocumentSection } from "@/features/reader/types";

/** Extra horizontal room for a timeline block — renderTimeline's own card/connector treatment is unchanged, only the section width grows. */
export function TimelineSection({ section }: { section: DocumentSection }) {
  return (
    <section style={{ maxWidth: "900px", margin: "0 auto", padding: "96px 24px" }}>
      {section.blocks.map((block, index) => renderBlock(block, index))}
    </section>
  );
}
