"use client";

import type { ResourceBlock } from "@/renderers/types";

export function renderResource(block: ResourceBlock, _index: number) {
  const { title, description, href, external } = block.content;

  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        gap:            "16px",
        borderRadius:   "var(--r-lg)",
        border:         "1px solid var(--op-border)",
        background:     "var(--op-surface)",
        padding:        "16px 20px",
        textDecoration: "none",
        transition:     "border-color 150ms, background 150ms",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLAnchorElement;
        el.style.borderColor = "var(--op-border-hover)";
        el.style.background  = "var(--op-surface-2)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLAnchorElement;
        el.style.borderColor = "var(--op-border)";
        el.style.background  = "var(--op-surface)";
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily:  "var(--font-ui)",
            fontSize:    "var(--text-14)",
            fontWeight:  600,
            color:       "var(--op-text)",
            overflow:    "hidden",
            textOverflow: "ellipsis",
            whiteSpace:  "nowrap",
          }}
        >
          {title}
        </div>
        {description && (
          <p
            style={{
              marginTop:   "4px",
              fontFamily:  "var(--font-body)",
              fontSize:    "var(--text-13)",
              lineHeight:  1.5,
              color:       "var(--op-text-2)",
              margin:      "4px 0 0",
              overflow:    "hidden",
              textOverflow: "ellipsis",
              whiteSpace:  "nowrap",
            }}
          >
            {description}
          </p>
        )}
      </div>

      {/* Arrow icon */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
        style={{ flexShrink: 0, color: "var(--op-text-3)" }}
      >
        <path
          d="M3 8h10M9 4l4 4-4 4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </a>
  );
}