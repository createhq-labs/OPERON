import type { TimelineBlock, TimelineItem } from "@/renderers/types";

export function renderTimeline(block: TimelineBlock, index: number) {
  return (
    <div
      style={{
        borderRadius: "var(--r-lg)",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        padding: "20px",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: "11px",
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--text-3)",
          marginBottom: "16px",
        }}
      >
        Timeline
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        {block.content.items.map((item: TimelineItem, itemIndex: number) => (
          <div
            key={`${index}-timeline-${itemIndex}`}
            style={{
              display: "flex",
              gap: "16px",
              padding: "12px 0",
              borderBottom:
                itemIndex < block.content.items.length - 1
                  ? "1px solid var(--border)"
                  : "none",
            }}
          >
            <div
              style={{
                flexShrink: 0,
                width: "80px",
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                fontWeight: 500,
                color: "var(--accent)",
                paddingTop: "2px",
              }}
            >
              {item.period}
            </div>
            <div>
              <div
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "var(--text)",
                }}
              >
                {item.title}
              </div>
              {item.description && (
                <p
                  style={{
                    marginTop: "3px",
                    fontFamily: "var(--font-body)",
                    fontSize: "13px",
                    lineHeight: "1.5",
                    color: "var(--text-2)",
                    margin: "4px 0 0",
                  }}
                >
                  {item.description}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}