"use client";

import type { AlertBlock } from "@/renderers/types";

const VARIANTS: Record<
  string,
  { bar: string; label: string; labelColor: string; bg: string }
> = {
  warning: {
    bar:        "var(--op-accent)",
    label:      "Warning",
    labelColor: "var(--op-accent)",
    bg:         "rgba(245, 166, 35, 0.06)",
  },
  note: {
    bar:        "rgba(255, 255, 255, 0.20)",
    label:      "Note",
    labelColor: "var(--op-text-2)",
    bg:         "transparent",
  },
  callout: {
    bar:        "rgba(255, 255, 255, 0.20)",
    label:      "Callout",
    labelColor: "var(--op-text-2)",
    bg:         "transparent",
  },
  success: {
    bar:        "rgba(74, 222, 128, 0.70)",
    label:      "Success",
    labelColor: "var(--color-success)",
    bg:         "rgba(74, 222, 128, 0.05)",
  },
};

export function renderAlert(block: AlertBlock, _index: number) {
  const v = VARIANTS[block.type] ?? VARIANTS.note;
  const displayTitle = block.title ?? v.label;

  return (
    <div
      style={{
        display:      "grid",
        gridTemplateColumns: "3px 1fr",
        gap:          "20px",
        borderRadius: "var(--r-lg)",
        background:   v.bg,
        border:       "1px solid var(--op-border)",
        overflow:     "hidden",
        padding:      "0",
      }}
    >
      {/* Left accent bar */}
      <div
        aria-hidden="true"
        style={{
          background:   v.bar,
          borderRadius: "0",
          width:        "3px",
          alignSelf:    "stretch",
        }}
      />

      {/* Content */}
      <div style={{ padding: "16px 20px 16px 0" }}>
        <div
          style={{
            fontFamily:    "var(--font-ui)",
            fontSize:      "var(--text-11)",
            fontWeight:    700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color:         v.labelColor,
            marginBottom:  "6px",
          }}
        >
          {displayTitle}
        </div>
        <p
          style={{
            fontFamily: "var(--font-body)",
            fontSize:   "var(--text-14)",
            lineHeight: 1.7,
            color:      "var(--op-text-2)",
            margin:     0,
          }}
        >
          {block.content}
        </p>
      </div>
    </div>
  );
}