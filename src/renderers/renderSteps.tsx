import type { StepsBlock, StepItem } from "@/renderers/types";

export function renderSteps(block: StepsBlock, index: number) {
  const isFaq = block.type === "faq";
  const sectionLabel = isFaq ? "FAQ" : "Steps";

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
        {sectionLabel}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {block.content.map((item: StepItem, itemIndex: number) => (
          <div
            key={`${index}-step-${itemIndex}`}
            style={{
              display: "flex",
              gap: "14px",
              borderRadius: "var(--r-md)",
              border: "1px solid var(--border)",
              background: "var(--surface-2)",
              padding: "14px 16px",
            }}
          >
            {!isFaq && (
              <div
                aria-hidden="true"
                style={{
                  flexShrink: 0,
                  width: "22px",
                  height: "22px",
                  borderRadius: "50%",
                  border: "1px solid var(--border-hover)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--text-3)",
                  marginTop: "1px",
                }}
              >
                {itemIndex + 1}
              </div>
            )}
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
                    marginTop: "4px",
                    fontFamily: "var(--font-body)",
                    fontSize: "13px",
                    lineHeight: "1.6",
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