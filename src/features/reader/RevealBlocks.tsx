"use client";

import { motion } from "framer-motion";
import { renderBlock } from "@/renderers";
import type { Block } from "@/core/types";
import { spring } from "@/styles/motionPresets";

const STAGGER_STEP = 0.06;
const MAX_STAGGER = 4;

/** A lighter, larger opening paragraph — the editorial "lede" that makes even plain prose read as an intentional composition, not a wall of body text. */
function LedeParagraph({ content }: { content: string }) {
  return (
    <p
      style={{
        fontFamily: "var(--font-display)",
        fontWeight: 300,
        fontSize: "clamp(1.25rem, 2.4vw, 1.75rem)",
        lineHeight: 1.5,
        letterSpacing: "-0.01em",
        color: "var(--op-text)",
        margin: 0,
        maxWidth: "65ch",
      }}
    >
      {content}
    </p>
  );
}

/**
 * Renders a section's body blocks with a per-block scroll-triggered stagger
 * (each block arrives individually as you scroll past it, not the whole
 * section as one flat unit) and, optionally, promotes a lone opening
 * paragraph to a larger "lede" treatment — the same editorial lift every
 * simple section gets, regardless of what block types it happens to contain.
 */
export function RevealBlocks({ blocks, lede = false }: { blocks: Block[]; lede?: boolean }) {
  return (
    <>
      {blocks.map((block, index) => {
        const isLede = lede && index === 0 && block.type === "paragraph";
        const key = (block as { id?: string }).id ?? `block-${index}`;
        return (
          <motion.div
            key={key}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ ...spring.soft, delay: Math.min(index, MAX_STAGGER) * STAGGER_STEP }}
          >
            {isLede ? <LedeParagraph content={(block as { content?: string }).content ?? ""} /> : renderBlock(block, index)}
          </motion.div>
        );
      })}
    </>
  );
}
