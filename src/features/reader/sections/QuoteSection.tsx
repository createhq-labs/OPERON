"use client";

import { renderBlock } from "@/renderers";
import { renderQuote } from "@/renderers/renderQuote";
import type { AlertBlock } from "@/renderers/types";
import type { DocumentSection } from "@/features/reader/types";

/** A section that's just a single callout, promoted to a full-bleed editorial pull-quote. */
export function QuoteSection({ section }: { section: DocumentSection }) {
  const body = section.headingBlock ? section.blocks.slice(1) : section.blocks;
  const quoteBlock = body[0] as unknown as AlertBlock | undefined;

  return (
    <section style={{ padding: "120px 24px" }}>
      {section.headingBlock && (
        <div style={{ marginBottom: "32px", textAlign: "center" }}>{renderBlock(section.headingBlock, 0)}</div>
      )}
      {quoteBlock && renderQuote(quoteBlock, 0)}
    </section>
  );
}
