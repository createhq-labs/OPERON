"use client";

import type { TimelineBlock, TimelineItem } from "@/renderers/types";

export function renderTimeline(block: TimelineBlock, index: number) {
  const items = block.content.items;

  return (
    <div
      style={{
        borderRadius: "var(--r-lg)",
        border:       "1px solid var(--op-border)",
        background:   "var(--op-surface)",
        overflow:     "hidden",
      }}
    >
      <div
        style={{
          padding:      "12px 20px",
          borderBottom: "1px solid var(--op-border)",
          fontFamily:   "var(--font-ui)",
          fontSize:     "var(--text-11)",
          fontWeight:   700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color:        "var(--op-text-3)",
        }}
      >
        Timeline
      </div>

      <div style={{ padding: "8px 20px" }}>
        {items.map((item: TimelineItem, i: number) => {
          const isLast = i === items.length - 1;
          return (
            <div
              key={`${index}-tl-${i}`}
              style={{
                display:       "grid",
                gridTemplateColumns: "72px 1px 1fr",
                gap:           "0 16px",
                paddingBottom: isLast ? "8px" : "0",
              }}
            >
              {/* Period label */}
              <div
                style={{
                  paddingTop:  "16px",
                  fontFamily:  "var(--font-mono)",
                  fontSize:    "var(--text-11)",
                  fontWeight:  500,
                  color:       "var(--op-accent)",
                  opacity:     0.8,
                  lineHeight:  1.3,
                  textAlign:   "right",
                  paddingRight: "0",
                }}
              >
                {item.period}
              </div>

              {/* Connector line + dot */}
              <div
                style={{
                  display:       "flex",
                  flexDirection: "column",
                  alignItems:    "center",
                }}
              >
                <div
                  aria-hidden="true"
                  style={{
                    marginTop:    "20px",
                    width:        "6px",
                    height:       "6px",
                    borderRadius: "50%",
                    background:   "var(--op-border-hover)",
                    flexShrink:   0,
                    marginLeft:   "-2.5px",
                  }}
                />
                {!isLast && (
                  <div
                    aria-hidden="true"
                    style={{
                      flex:       1,
                      width:      "1px",
                      background: "var(--op-border)",
                      marginTop:  "4px",
                    }}
                  />
                )}
              </div>

              {/* Content */}
              <div
                style={{
                  paddingTop:    "14px",
                  paddingBottom: isLast ? "8px" : "20px",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontSize:   "var(--text-14)",
                    fontWeight: 600,
                    color:      "var(--op-text)",
                    lineHeight: 1.4,
                  }}
                >
                  {item.title}
                </div>
                {item.description && (
                  <p
                    style={{
                      marginTop:  "5px",
                      fontFamily: "var(--font-body)",
                      fontSize:   "var(--text-13)",
                      lineHeight: 1.6,
                      color:      "var(--op-text-2)",
                      margin:     "5px 0 0",
                    }}
                  >
                    {item.description}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}