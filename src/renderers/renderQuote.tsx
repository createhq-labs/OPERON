"use client";

import type { AlertBlock } from "@/renderers/types";

/** A lone callout promoted to a full-bleed editorial pull-quote — distinct from the compact inline alert card renderAlert uses everywhere else. */
export function renderQuote(block: AlertBlock, _index: number) {
  return (
    <div style={{ textAlign: "center" }}>
      <div
        aria-hidden="true"
        style={{
          fontFamily: "var(--font-display)",
          fontSize:   "clamp(3rem, 8vw, 6rem)",
          lineHeight: 0.6,
          color:      "var(--op-text-3)",
          opacity:    0.5,
          marginBottom: "8px",
        }}
      >
        &ldquo;
      </div>

      <p
        style={{
          fontFamily:    "var(--font-display)",
          fontWeight:    300,
          fontSize:      "clamp(1.75rem, 3.5vw, 2.75rem)",
          lineHeight:    1.3,
          letterSpacing: "-0.02em",
          color:         "var(--op-text)",
          margin:        "0 auto",
          maxWidth:      "820px",
        }}
      >
        {block.content}
      </p>

      <div
        aria-hidden="true"
        style={{
          margin:       "24px auto 0",
          height:       "1px",
          width:        "40px",
          background:   "var(--op-accent)",
          opacity:      0.7,
        }}
      />

      {block.title && (
        <div
          style={{
            marginTop:  "16px",
            fontFamily: "var(--font-mono)",
            fontSize:   "var(--text-12)",
            color:      "var(--op-text-3)",
          }}
        >
          {block.title}
        </div>
      )}
    </div>
  );
}
