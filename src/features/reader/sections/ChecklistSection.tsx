"use client";

import { renderBlock } from "@/renderers";
import type { DocumentSection } from "@/features/reader/types";

/** Minimal, narrow treatment matching the checklist card's own compact styling. */
export function ChecklistSection({ section }: { section: DocumentSection }) {
  return (
    <section style={{ maxWidth: "600px", margin: "0 auto", padding: "80px 24px" }}>
      {section.blocks.map((block, index) => renderBlock(block, index))}
    </section>
  );
}
