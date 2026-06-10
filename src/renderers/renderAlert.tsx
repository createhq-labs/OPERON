import type { DocumentBlock } from "@/renderers/types";

const ALERT_STYLES: Record<string, { border: string; bg: string; label: string; labelColor: string }> = {
  warning: {
    border: "rgba(245, 166, 35, 0.3)",
    bg: "rgba(245, 166, 35, 0.08)",
    label: "Warning",
    labelColor: "var(--accent)",
  },
  note: {
    border: "rgba(255, 255, 255, 0.12)",
    bg: "var(--surface-2)",
    label: "Note",
    labelColor: "rgba(255, 255, 255, 0.6)",
  },
  callout: {
    border: "rgba(255, 255, 255, 0.12)",
    bg: "var(--surface-2)",
    label: "Callout",
    labelColor: "rgba(255, 255, 255, 0.6)",
  },
  success: {
    border: "rgba(52, 199, 89, 0.3)",
    bg: "rgba(52, 199, 89, 0.08)",
    label: "Success",
    labelColor: "#34C759",
  },
};

export function renderAlert(block: DocumentBlock, index: number) {
  const blockType = block.type as string;
  const styles = ALERT_STYLES[blockType] ?? ALERT_STYLES.note;
  const blockContent = block as { title?: string };
  const displayTitle = blockContent.title ?? styles.label;

  return (
    <div
      style={{
        borderRadius: "var(--r-lg)",
        border: `1px solid ${styles.border}`,
        background: styles.bg,
        padding: "16px 20px",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: "12px",
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: styles.labelColor,
        }}
      >
        {displayTitle}
      </div>
      <p
        style={{
          marginTop: "8px",
          fontFamily: "var(--font-body)",
          fontSize: "14px",
          lineHeight: "1.6",
          color: "var(--text-2)",
        }}
      >
        {block.content as string}
      </p>
    </div>
  );
}