"use client";

import type { ChecklistBlock } from "@/renderers/types";

export function renderChecklist(block: ChecklistBlock, _index: number) {
  const { title, items } = block.content;

  return (
    <div
      style={{
        borderRadius: "var(--r-lg)",
        border:       "1px solid var(--op-border)",
        background:   "var(--op-surface)",
        overflow:     "hidden",
      }}
    >
      {title && (
        <div
          style={{
            padding:      "14px 20px",
            borderBottom: "1px solid var(--op-border)",
            fontFamily:   "var(--font-ui)",
            fontSize:     "var(--text-11)",
            fontWeight:   700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color:        "var(--op-text-3)",
          }}
        >
          {title}
        </div>
      )}

      <div style={{ padding: "8px" }}>
        {items.map((item, i) => (
          <div
            key={item.id}
            style={{
              display:      "flex",
              alignItems:   "center",
              gap:          "12px",
              padding:      "10px 12px",
              borderRadius: "var(--r-md)",
              transition:   "background 120ms",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = "var(--op-surface-2)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = "transparent";
            }}
          >
            {/* Checkbox square */}
            <div
              aria-hidden="true"
              style={{
                flexShrink:   0,
                width:        "16px",
                height:       "16px",
                borderRadius: "var(--r-sm)",
                border:       "1.5px solid var(--op-border-hover)",
                display:      "flex",
                alignItems:   "center",
                justifyContent: "center",
              }}
            >
              {/* Dot inside — unfilled state */}
              <div
                style={{
                  width:        "6px",
                  height:       "6px",
                  borderRadius: "50%",
                  background:   "var(--op-border-hover)",
                  opacity:      0.4,
                }}
              />
            </div>

            <span
              style={{
                fontFamily: "var(--font-body)",
                fontSize:   "var(--text-14)",
                lineHeight: 1.5,
                color:      "var(--op-text-2)",
              }}
            >
              {item.label}
            </span>

            {item.required && (
              <span
                style={{
                  marginLeft:    "auto",
                  fontFamily:    "var(--font-ui)",
                  fontSize:      "var(--text-11)",
                  fontWeight:    600,
                  letterSpacing: "0.04em",
                  color:         "var(--op-accent)",
                  opacity:       0.8,
                }}
              >
                Required
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}