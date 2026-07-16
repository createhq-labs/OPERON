"use client";

import { useState } from "react";
import type { StepsBlock, StepItem } from "@/renderers/types";

function StepRow({
  item,
  index,
  total,
  isFaq,
}: {
  item: StepItem;
  index: number;
  total: number;
  isFaq: boolean;
}) {
  const [open, setOpen] = useState(false);
  const isLast = index === total - 1;

  if (isFaq) {
    return (
      <div
        style={{
          borderBottom: isLast ? "none" : "1px solid var(--op-border)",
        }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            width:          "100%",
            display:        "flex",
            alignItems:     "center",
            justifyContent: "space-between",
            gap:            "16px",
            padding:        "16px 20px",
            background:     "transparent",
            border:         "none",
            cursor:         "pointer",
            textAlign:      "left",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-ui)",
              fontSize:   "var(--text-14)",
              fontWeight: 500,
              color:      "var(--op-text)",
              lineHeight: 1.4,
            }}
          >
            {item.title}
          </span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
            style={{
              flexShrink: 0,
              transition: "transform 200ms",
              transform:  open ? "rotate(180deg)" : "rotate(0deg)",
              color:      "var(--op-text-3)",
            }}
          >
            <path
              d="M4 6l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {open && item.description && (
          <div
            style={{
              padding:    "0 20px 16px",
              fontFamily: "var(--font-body)",
              fontSize:   "var(--text-14)",
              lineHeight: 1.7,
              color:      "var(--op-text-2)",
            }}
          >
            {item.description}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        gap:     "16px",
        padding: "0 20px 0 16px",
      }}
    >
      {/* Number + connector line */}
      <div
        style={{
          display:       "flex",
          flexDirection: "column",
          alignItems:    "center",
          flexShrink:    0,
          paddingTop:    "16px",
        }}
      >
        <div
          style={{
            width:          "26px",
            height:         "26px",
            borderRadius:   "50%",
            border:         "1.5px solid var(--op-border-hover)",
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            fontFamily:     "var(--font-mono)",
            fontSize:       "var(--text-11)",
            fontWeight:     600,
            color:          "var(--op-text-3)",
            flexShrink:     0,
          }}
        >
          {index + 1}
        </div>
        {!isLast && (
          <div
            aria-hidden="true"
            style={{
              flex:       1,
              width:      "1px",
              minHeight:  "20px",
              background: "var(--op-border)",
              margin:     "6px 0",
            }}
          />
        )}
      </div>

      {/* Content */}
      <div
        style={{
          paddingTop:    "16px",
          paddingBottom: isLast ? "16px" : "20px",
          flex:          1,
          minWidth:      0,
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
              marginTop:  "6px",
              fontFamily: "var(--font-body)",
              fontSize:   "var(--text-14)",
              lineHeight: 1.7,
              color:      "var(--op-text-2)",
              margin:     "6px 0 0",
            }}
          >
            {item.description}
          </p>
        )}
      </div>
    </div>
  );
}

export function renderSteps(block: StepsBlock, index: number) {
  const isFaq = block.type === "faq";
  const label = isFaq ? "FAQ" : "Steps";

  return (
    <div
      style={{
        borderRadius: "var(--r-lg)",
        border:       "1px solid var(--op-border)",
        background:   "var(--op-surface)",
        overflow:     "hidden",
      }}
    >
      {/* Section label */}
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
        {label}
      </div>

      {block.content.map((item: StepItem, i: number) => (
        <StepRow
          key={`${index}-step-${i}`}
          item={item}
          index={i}
          total={block.content.length}
          isFaq={isFaq}
        />
      ))}
    </div>
  );
}