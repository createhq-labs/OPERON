"use client";

import { motion } from "framer-motion";
import { spring } from "@/styles/motionPresets";

export function ReadingProgressBar({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));

  return (
    <div
      aria-hidden="true"
      style={{ position: "sticky", top: 0, zIndex: 20, height: "3px", background: "var(--op-border)" }}
    >
      <motion.div
        animate={{ width: `${clamped}%` }}
        transition={spring.soft}
        style={{
          height: "100%",
          background: "var(--op-accent)",
          boxShadow: clamped > 0 ? "0 0 8px rgba(245,166,35,0.6)" : "none",
        }}
      />
    </div>
  );
}
