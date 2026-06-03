export function renderTable(block: { content: { headers: string[]; rows: string[][] }; id?: string }, index: number) {
  return (
    <div key={block.id ?? `table-${index}`} className="overflow-hidden rounded-3xl border border-border bg-bg-secondary/90 shadow-soft">
      <table className="min-w-full border-collapse text-sm">
        <thead className="bg-bg-primary/90">
          <tr>
            {block.content.headers.map((header: string) => (
              <th key={header} className="border-b border-border px-4 py-3 text-left text-xs uppercase tracking-[0.18em] text-content-tertiary">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.content.rows.map((row: string[], rowIndex: number) => (
            <tr key={rowIndex} className={rowIndex % 2 === 0 ? "bg-bg-secondary/90" : "bg-bg-primary/90"}>
              {row.map((cell: string, cellIndex: number) => (
                <td key={cellIndex} className="border-b border-border px-4 py-3 text-sm text-content-secondary">
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
