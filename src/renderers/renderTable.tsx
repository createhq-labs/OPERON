import type { TableBlock } from "@/renderers/types";

export function renderTable(block: TableBlock, _index: number) {
  const headers: string[] = Array.isArray(block.content.headers)
    ? block.content.headers
    : [];
  const rows: string[][] = Array.isArray(block.content.rows)
    ? block.content.rows
    : [];

  return (
    <div
      style={{
        borderRadius: "var(--r-lg)",
        border: "1px solid var(--border)",
        overflow: "hidden",
      }}
    >
      <table
        style={{ width: "100%", borderCollapse: "collapse" }}
        role="table"
      >
        <thead>
          <tr style={{ background: "var(--surface-2)" }}>
            {headers.map((header, colIndex) => (
              <th
                key={`header-${colIndex}`}
                scope="col"
                style={{
                  padding: "10px 16px",
                  textAlign: "left",
                  fontFamily: "var(--font-ui)",
                  fontSize: "11px",
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--text-3)",
                  borderBottom: "1px solid var(--border)",
                  whiteSpace: "nowrap",
                }}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={`row-${rowIndex}`}
              style={{
                background:
                  rowIndex % 2 === 0 ? "var(--surface)" : "var(--surface-2)",
              }}
            >
              {row.map((cell, cellIndex) => (
                <td
                  key={`cell-${rowIndex}-${cellIndex}`}
                  style={{
                    padding: "10px 16px",
                    fontFamily: "var(--font-body)",
                    fontSize: "13px",
                    color: "var(--text-2)",
                    borderBottom:
                      rowIndex < rows.length - 1
                        ? "1px solid var(--border)"
                        : "none",
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}