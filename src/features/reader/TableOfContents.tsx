"use client";

import type { TocItem } from "@/core/types";
import { S } from "@/styles/sharedUi";

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
      <button
        type="button"
        onClick={onToggleCollapsed}
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
        <span aria-hidden="true">{collapsed ? "▸" : "▾"}</span>
      </button>

      {!collapsed && (
        <div
          className="scrollbar-thin"
          style={{ display: "flex", flexDirection: "column", gap: "2px", maxHeight: "60vh", overflowY: "auto" }}
        >
          {toc.map((item) => {
            const active = item.id === activeId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={active ? "location" : undefined}
                style={{
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
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </nav>
  );
}
