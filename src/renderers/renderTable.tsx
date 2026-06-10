import type { DocumentBlock } from "@/renderers/types";

interface TableBlockContent {
  headers: string[];
  rows: string[][];
}

export function renderTable(block: DocumentBlock, _index: number) {
  const tableContent = block.content as TableBlockContent;
  const headers: string[] = Array.isArray(tableContent?.headers) ? tableContent.headers : [];
  const rows: string[][] = Array.isArray(tableContent?.rows) ? tableContent.rows : [];

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
                background: rowIndex % 2 === 0 ? "var(--surface)" : "var(--surface-2)",
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
                      rowIndex < rows.length - 1 ? "1px solid var(--border)" : "none",
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