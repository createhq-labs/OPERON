"use client";

import { motion } from "framer-motion";
import { renderBlock } from "@/renderers";
import type { DocumentSection } from "@/features/reader/types";
import { spring } from "@/styles/motionPresets";

const wordContainer = {
  hidden: { opacity: 1 },
  show: { opacity: 1, transition: { staggerChildren: 0.025 } },
};

const wordItem = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: spring.soft },
};

/** A single short paragraph rendered as a large centered editorial statement. */
export function FullWidthStatementSection({ section }: { section: DocumentSection }) {
  const body = section.headingBlock ? section.blocks.slice(1) : section.blocks;
  const statement = body.find((block) => block.type === "paragraph") as { content?: string } | undefined;
  const words = statement?.content?.split(" ") ?? [];

  return (
    <section style={{ padding: "120px 24px", textAlign: "center" }}>
      {section.headingBlock && (
        <div style={{ marginBottom: "32px" }}>{renderBlock(section.headingBlock, 0)}</div>
      )}
      {words.length > 0 && (
        <motion.p
          variants={wordContainer}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.5 }}
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 400,
            fontSize: "clamp(1.85rem, 4.2vw, 3.25rem)",
            lineHeight: 1.25,
            letterSpacing: "-0.02em",
            color: "var(--op-text)",
            maxWidth: "900px",
            margin: "0 auto",
          }}
        >
          {words.map((word, index) => (
            <motion.span key={index} variants={wordItem} style={{ display: "inline-block", marginRight: "0.28em" }}>
              {word}
            </motion.span>
          ))}
        </motion.p>
      )}
    </section>
  );
}
