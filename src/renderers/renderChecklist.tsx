import type { ChecklistBlock } from "@/renderers/types";

export function renderChecklist(block: ChecklistBlock, _index: number) {
  const { title, items } = block.content;

  return (
    <div
      style={{
        borderRadius: "var(--r-lg)",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        padding: "20px",
      }}
    >
      {title && (
        <div
          style={{
            fontSize: "var(--text-13)",
            fontWeight: 600,
            color: "var(--text)",
            marginBottom: "12px",
          }}
        >
          {title}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {items.map((item) => (
          <div
            key={item.id}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "12px",
              borderRadius: "var(--r-md)",
              border: "1px solid var(--border)",
              background: "var(--surface-2)",
              padding: "10px 14px",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                marginTop: "3px",
                flexShrink: 0,
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "var(--accent)",
              }}
            />
            <p
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "14px",
                lineHeight: "1.5",
                color: "var(--text-2)",
                margin: 0,
              }}
            >
              {item.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}