"use client";

import { motion } from "framer-motion";
import type { Document } from "@/core/types";
import { S } from "@/styles/sharedUi";
import { spring } from "@/styles/motionPresets";

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const wordContainer = {
  hidden: { opacity: 1 },
  show: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};

const wordItem = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: spring.soft },
};

/** Title + only-existing metadata — never generates a summary/description beyond what the document already carries. */
export function ReaderHero({ doc }: { doc: Document }) {
  const words = doc.title.split(" ");
  const ghostWord = (doc.dept || "DOCS").toUpperCase();
  const metaItems = [doc.author, doc.updatedAt ? formatDate(doc.updatedAt) : null, doc.readTime].filter(Boolean);

  return (
    <header
      style={{
        position: "relative",
        overflow: "hidden",
        minHeight: "min(76vh, 640px)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      {/* Ghost background word — faint, oversized, purely textural */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          userSelect: "none",
          zIndex: 0,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: "clamp(6rem, 24vw, 17rem)",
            lineHeight: 1,
            letterSpacing: "-0.04em",
            color: "var(--op-text)",
            opacity: 0.04,
            whiteSpace: "nowrap",
          }}
        >
          {ghostWord}
        </span>
      </div>

      {/* Faint editorial grid overlay */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          backgroundImage:
            "linear-gradient(to right, var(--op-border) 1px, transparent 1px), linear-gradient(to bottom, var(--op-border) 1px, transparent 1px)",
          backgroundSize: "16.66% 100%, 100% 50%",
          opacity: 0.6,
        }}
      />

      <div style={{ position: "relative", zIndex: 1, padding: "0 24px", maxWidth: "980px", margin: "0 auto", textAlign: "center", width: "100%" }}>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.soft}
          style={{ display: "flex", justifyContent: "center", gap: "8px", flexWrap: "wrap", marginBottom: "24px" }}
        >
          {doc.dept && <span style={S.badge}>{doc.dept}</span>}
          {doc.version && <span style={S.badge}>v{doc.version}</span>}
        </motion.div>

        <motion.h1
          variants={wordContainer}
          initial="hidden"
          animate="show"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: "clamp(2.5rem, 7vw, 5.5rem)",
            letterSpacing: "-0.03em",
            lineHeight: 1.02,
            color: "var(--op-text)",
            margin: 0,
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: "0 0.28em",
          }}
        >
          {words.map((word, index) => (
            <motion.span key={`${word}-${index}`} variants={wordItem} style={{ display: "inline-block" }}>
              {word}
            </motion.span>
          ))}
        </motion.h1>
      </div>

      {metaItems.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...spring.soft, delay: 0.35 }}
          style={{
            position: "relative",
            zIndex: 1,
            marginTop: "56px",
            borderTop: "1px solid var(--op-border)",
          }}
        >
          <div
            style={{
              maxWidth: "1400px",
              margin: "0 auto",
              padding: "16px 24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "16px",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: "16px",
                flexWrap: "wrap",
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-12)",
                color: "var(--op-text-3)",
              }}
            >
              {metaItems.map((item, index) => (
                <span key={index}>{item}</span>
              ))}
            </div>
            <motion.div
              aria-hidden="true"
              animate={{ y: [0, 6, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
              style={{ color: "var(--op-text-3)", display: "flex" }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </motion.div>
          </div>
        </motion.div>
      )}
    </header>
  );
}
