"use client";

import type { TableBlock } from "@/renderers/types";

export function renderTable(block: TableBlock, _index: number) {
  const headers: string[] = Array.isArray(block.content.headers)
    ? block.content.headers
    : [];
  const rows: string[][] = Array.isArray(block.content.rows)
    ? block.content.rows
    : [];

  if (rows.length === 0 && headers.length === 0) return null;

  return (
    <div
      style={{
        borderRadius: "var(--r-lg)",
        border:       "1px solid var(--op-border)",
        overflow:     "hidden",
      }}
    >
      <div style={{ overflowX: "auto" }}>
        <table
          style={{ width: "100%", borderCollapse: "collapse", minWidth: "400px" }}
          role="table"
        >
          {headers.length > 0 && (
            <thead>
              <tr
                style={{
                  background:   "var(--op-surface-2)",
                  borderBottom: "1px solid var(--op-border)",
                }}
              >
                {headers.map((header, colIndex) => (
                  <th
                    key={`header-${colIndex}`}
                    scope="col"
                    style={{
                      padding:       "11px 16px",
                      textAlign:     "left",
                      fontFamily:    "var(--font-ui)",
                      fontSize:      "var(--text-11)",
                      fontWeight:    700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color:         "var(--op-text-3)",
                      whiteSpace:    "nowrap",
                    }}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
          )}

          <tbody>
            {rows.map((row, rowIndex) => (
              <tr
                key={`row-${rowIndex}`}
                style={{
                  background:  "var(--op-surface)",
                  borderBottom:
                    rowIndex < rows.length - 1
                      ? "1px solid var(--op-border)"
                      : "none",
                  transition:  "background 100ms",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLTableRowElement).style.background =
                    "var(--op-surface-2)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLTableRowElement).style.background =
                    "var(--op-surface)";
                }}
              >
                {row.map((cell, cellIndex) => (
                  <td
                    key={`cell-${rowIndex}-${cellIndex}`}
                    style={{
                      padding:    "11px 16px",
                      fontFamily: "var(--font-body)",
                      fontSize:   "var(--text-13)",
                      lineHeight: 1.5,
                      color:
                        cellIndex === 0
                          ? "var(--op-text)"
                          : "var(--op-text-2)",
                      fontWeight: cellIndex === 0 ? 500 : 400,
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
    </div>
  );
}