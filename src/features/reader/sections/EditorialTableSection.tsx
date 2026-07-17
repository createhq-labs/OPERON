"use client";

import { renderBlock } from "@/renderers";
import { RevealBlocks } from "@/features/reader/RevealBlocks";
import type { DocumentSection } from "@/features/reader/types";

/** Extra horizontal room for the table itself — the table rendering (sticky header on tall tables, scroll, dividers) is unchanged, only the section width grows. */
export function EditorialTableSection({ section }: { section: DocumentSection }) {
  const body = section.headingBlock ? section.blocks.slice(1) : section.blocks;

  return (
    <section style={{ maxWidth: "960px", margin: "0 auto", padding: "96px 24px" }}>
      {section.headingBlock && renderBlock(section.headingBlock, 0)}
      <RevealBlocks blocks={body} />
    </section>
  );
}
