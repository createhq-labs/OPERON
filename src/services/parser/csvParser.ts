import type { ParserResult } from "@/services/parser/types";

function parseCsvLine(line: string) {
  return line
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((value) => value.trim().replace(/^"|"$/g, ""));
}

export function parseCsvDocument(rawCsv: string, fileName: string): ParserResult {
  const lines = rawCsv.replace(/\r\n/g, "\n").split(/\n/g).filter((line) => line.trim().length > 0);
  const rows = lines.map(parseCsvLine);
  const headers = rows.length > 0 ? rows[0] : [];
  const tableRows = rows.length > 1 ? rows.slice(1) : [];

  const blocks: ParserResult["blocks"] = [
    {
      type: "table",
      content: {
        headers,
        rows: tableRows,
      },
    },
  ];

  const content = rows.map((row) => row.join(" ")).join(" ").trim();

  return {
    title: fileName.replace(/\.[^/.]+$/, ""),
    description: headers.join(" "),
    blocks,
    toc: [],
    content,
    warnings: [],
    confidence: rows.length > 1 ? 0.7 : 0.45,
  };
}
