import type { ResourceBlock } from "@/renderers/types";

export function renderResource(block: ResourceBlock, _index: number) {
  const { title, description, href, external } = block.content;

  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      style={{
        display: "block",
        borderRadius: "var(--r-lg)",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        padding: "16px 20px",
        textDecoration: "none",
        transition: "border-color 150ms ease",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--border-hover)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--border)";
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: "14px",
          fontWeight: 600,
          color: "var(--text)",
        }}
      >
        {title}
      </div>
      <p
        style={{
          marginTop: "6px",
          fontFamily: "var(--font-body)",
          fontSize: "13px",
          lineHeight: "1.5",
          color: "var(--text-2)",
        }}
      >
        {description}
      </p>
    </a>
  );
}