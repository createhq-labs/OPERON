"use client";

import { motion } from "framer-motion";
import type { HeadingBlock } from "@/renderers/types";
import { maskReveal } from "@/styles/motionPresets";

export function renderHeading(block: HeadingBlock, index: number) {
  const isH1 = block.type === "heading";

  if (isH1) {
    return (
      <div
        style={{
          marginTop: index === 0 ? 0 : "48px",
          marginBottom: "4px",
          scrollMarginTop: "80px",
        }}
        id={block.anchorId ?? block.id}
      >
        <motion.h2
          variants={maskReveal}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.8 }}
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(1.5rem, 3vw, var(--text-30))",
            fontWeight: 300,
            letterSpacing: "-0.03em",
            lineHeight: 1.15,
            color: "var(--op-text)",
            margin: 0,
          }}
        >
          {block.content}
        </motion.h2>
        {/* Ember underline — single accent stroke, never colored text */}
        <div
          aria-hidden="true"
          style={{
            marginTop: "10px",
            height: "1px",
            width: "40px",
            background: "var(--op-accent)",
            opacity: 0.7,
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: "32px",
        scrollMarginTop: "80px",
      }}
      id={block.anchorId ?? block.id}
    >
      <h3
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: "var(--text-14)",
          fontWeight: 600,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "var(--op-text-2)",
          margin: 0,
        }}
      >
        {block.content}
      </h3>
    </div>
  );
}