"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { TocItem } from "@/core/types";
import { S } from "@/styles/sharedUi";
import { spring, listStagger, listItem } from "@/styles/motionPresets";

export function TableOfContents({
  toc,
  activeId,
  collapsed,
  onToggleCollapsed,
  onSelect,
}: {
  toc: TocItem[];
  activeId: string | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSelect: (id: string) => void;
}) {
  if (toc.length === 0) return null;

  return (
    <nav aria-label="Table of contents" style={{ ...S.floatingPanel, padding: "16px" }}>
      <motion.button
        type="button"
        onClick={onToggleCollapsed}
        whileHover={{ x: 1 }}
        whileTap={{ scale: 0.985 }}
        style={{
          ...S.btnGhost,
          width: "100%",
          justifyContent: "space-between",
          marginBottom: collapsed ? 0 : "8px",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: "var(--text-11)",
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--op-text-3)",
          }}
        >
          Contents
        </span>
        <motion.span
          aria-hidden="true"
          animate={{ rotate: collapsed ? -90 : 0 }}
          transition={spring.snappy}
          style={{ display: "inline-flex" }}
        >
          ▾
        </motion.span>
      </motion.button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="toc-list"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring.soft}
            style={{ overflow: "hidden" }}
          >
            <motion.div
              variants={listStagger}
              initial="hidden"
              animate="show"
              className="scrollbar-thin"
              style={{ display: "flex", flexDirection: "column", gap: "2px", maxHeight: "60vh", overflowY: "auto" }}
            >
              {toc.map((item, index) => {
                const active = item.id === activeId;
                return (
                  <motion.button
                    key={item.id}
                    variants={listItem}
                    type="button"
                    onClick={() => onSelect(item.id)}
                    aria-current={active ? "location" : undefined}
                    whileHover={{ x: 2 }}
                    whileTap={{ scale: 0.985 }}
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: "8px",
                      textAlign: "left",
                      padding: `6px 10px 6px ${8 + (item.level - 1) * 14}px`,
                      borderRadius: "var(--r-md)",
                      border: "none",
                      background: active ? "var(--op-surface-2)" : "transparent",
                      color: active ? "var(--op-text)" : "var(--op-text-3)",
                      fontFamily: "var(--font-ui)",
                      fontSize: "var(--text-12)",
                      fontWeight: active ? 600 : 400,
                      cursor: "pointer",
                      transition: "background 150ms, color 150ms",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "var(--text-11)",
                        color: active ? "var(--op-accent)" : "var(--op-text-3)",
                        opacity: active ? 1 : 0.7,
                        flexShrink: 0,
                      }}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span>{item.label}</span>
                  </motion.button>
                );
              })}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
