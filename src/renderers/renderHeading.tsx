import type { HeadingBlock } from "@/renderers/types";

export function renderHeading(block: HeadingBlock, _index: number) {
  const isH2 = block.type === "heading";

  return (
    <div style={{ marginTop: "32px", scrollMarginTop: "80px" }}>
      {isH2 ? (
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--text-20)",
            fontWeight: 600,
            color: "var(--text)",
            margin: 0,
            letterSpacing: "-0.01em",
          }}
        >
          {block.content}
        </h2>
      ) : (
        <h3
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--text-16)",
            fontWeight: 600,
            color: "var(--text)",
            margin: 0,
          }}
        >
          {block.content}
        </h3>
      )}
    </div>
  );
}