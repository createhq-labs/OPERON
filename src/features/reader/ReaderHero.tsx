"use client";

import type { Document } from "@/core/types";
import { S } from "@/styles/sharedUi";

/** Title + only-existing metadata — never generates a summary/description beyond what the document already carries. */
export function ReaderHero({ doc }: { doc: Document }) {
  return (
    <header style={{ padding: "80px 24px 56px", textAlign: "center", maxWidth: "820px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "center", gap: "8px", flexWrap: "wrap", marginBottom: "20px" }}>
        {doc.dept && <span style={S.badge}>{doc.dept}</span>}
        {doc.version && <span style={S.badge}>v{doc.version}</span>}
      </div>
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 300,
          fontSize: "clamp(2.25rem, 6vw, 4.5rem)",
          letterSpacing: "-0.03em",
          lineHeight: 1.05,
          color: "var(--op-text)",
          margin: 0,
        }}
      >
        {doc.title}
      </h1>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "16px",
          flexWrap: "wrap",
          marginTop: "24px",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-12)",
          color: "var(--op-text-3)",
        }}
      >
        {doc.author && <span>{doc.author}</span>}
        {doc.updatedAt && <span>{doc.updatedAt}</span>}
        {doc.readTime && <span>{doc.readTime}</span>}
      </div>
    </header>
  );
}
