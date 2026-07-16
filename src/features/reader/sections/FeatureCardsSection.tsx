"use client";

import { motion } from "framer-motion";
import { renderBlock } from "@/renderers";
import type { DocumentSection } from "@/features/reader/types";
import { S } from "@/styles/sharedUi";
import { listStagger, listItem } from "@/styles/motionPresets";

/** A short heading-introduced bullet list ("N things") rendered as a card grid instead of a flat list. */
export function FeatureCardsSection({ section }: { section: DocumentSection }) {
  const body = section.headingBlock ? section.blocks.slice(1) : section.blocks;
  const items = body.filter((block) => block.type === "list_item") as Array<{ content: string }>;

  return (
    <section style={{ maxWidth: "1100px", margin: "0 auto", padding: "96px 24px" }}>
      {section.headingBlock && (
        <div style={{ marginBottom: "40px" }}>{renderBlock(section.headingBlock, 0)}</div>
      )}
      <motion.div
        className="reader-feature-grid"
        variants={listStagger}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}
      >
        {items.map((item, index) => (
          <motion.div
            key={index}
            variants={listItem}
            whileHover={{ y: -2 }}
            style={{ ...S.cardInner, border: "1px solid var(--op-border)", padding: "20px" }}
          >
            <span
              style={{
                fontFamily: "var(--font-body)",
                fontSize:   "var(--text-14)",
                lineHeight: 1.6,
                color:      "var(--op-text)",
              }}
            >
              {item.content}
            </span>
          </motion.div>
        ))}
      </motion.div>
      <style>{`
        @media (max-width: 900px) { .reader-feature-grid { grid-template-columns: repeat(2, 1fr) !important; } }
        @media (max-width: 560px) { .reader-feature-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </section>
  );
}
