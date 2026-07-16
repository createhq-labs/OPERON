"use client";

import { renderBlock } from "@/renderers";
import type { DocumentSection } from "@/features/reader/types";

/** A single short paragraph rendered as a large centered editorial statement. */
export function FullWidthStatementSection({ section }: { section: DocumentSection }) {
  const body = section.headingBlock ? section.blocks.slice(1) : section.blocks;
  const statement = body.find((block) => block.type === "paragraph") as { content?: string } | undefined;

  return (
    <section style={{ padding: "120px 24px", textAlign: "center" }}>
      {section.headingBlock && (
        <div style={{ marginBottom: "32px" }}>{renderBlock(section.headingBlock, 0)}</div>
      )}
      {statement?.content && (
        <p
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 300,
            fontSize: "clamp(1.75rem, 4vw, 3rem)",
            lineHeight: 1.25,
            letterSpacing: "-0.02em",
            color: "var(--op-text)",
            maxWidth: "900px",
            margin: "0 auto",
          }}
        >
          {statement.content}
        </p>
      )}
    </section>
  );
}
