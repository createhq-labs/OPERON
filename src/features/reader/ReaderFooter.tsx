"use client";

import { motion } from "framer-motion";
import { S } from "@/styles/sharedUi";

/** Bottom nav bar — mirrors ReaderHero's bottom meta bar (border-top, flex justify-between, mono text) so the page bookends. */
export function ReaderFooter({
  prevId,
  nextId,
  onNavigate,
}: {
  prevId: string | null;
  nextId: string | null;
  onNavigate: (id: string) => void;
}) {
  return (
    <div style={{ borderTop: "1px solid var(--op-border)", marginTop: "40px" }}>
      <div
        style={{
          padding: "24px 0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-12)",
        }}
      >
        {prevId ? (
          <motion.button
            type="button"
            onClick={() => onNavigate(prevId)}
            whileHover={{ x: -2 }}
            whileTap={{ scale: 0.985 }}
            style={S.btnGhost}
          >
            ← Previous section
          </motion.button>
        ) : (
          <span />
        )}
        {nextId && (
          <motion.button
            type="button"
            onClick={() => onNavigate(nextId)}
            whileHover={{ x: 2 }}
            whileTap={{ scale: 0.985 }}
            style={S.btnGhost}
          >
            Next section →
          </motion.button>
        )}
      </div>
    </div>
  );
}
