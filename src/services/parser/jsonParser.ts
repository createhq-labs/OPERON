import type { ParserResult } from "@/services/parser/types";

export function parseJsonDocument(rawJson: string, fileName: string): ParserResult {
  try {
    const parsed = JSON.parse(rawJson);
    const blocks: ParserResult["blocks"] = [];
    const metadata: Record<string, unknown> = { sourceType: "json" };

    if (Array.isArray(parsed)) {
      blocks.push({ type: "table", content: { rows: [Object.keys(parsed[0] ?? {}), ...parsed.map((item) => Object.values(item ?? {}).map((value) => String(value)))] } });
      metadata.recordCount = parsed.length;
    } else if (typeof parsed === "object" && parsed !== null) {
      const entries = Object.entries(parsed).map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`);
      blocks.push({ type: "paragraph", content: entries.join(" ") });
      metadata.keys = Object.keys(parsed);
    } else {
      blocks.push({ type: "paragraph", content: String(parsed) });
    }

    const content = blocks.map((block) => (typeof block.content === "string" ? block.content : JSON.stringify(block.content))).join(" ").trim();

    return {
      title: fileName.replace(/\.[^/.]+$/, ""),
      description: content.split(" ").slice(0, 40).join(" "),
      blocks,
      toc: [],
      content,
      warnings: [],
      confidence: 0.75,
      metadata,
    };
  } catch (error) {
    return {
      title: fileName.replace(/\.[^/.]+$/, ""),
      description: "Unable to parse JSON payload.",
      blocks: [{ type: "paragraph", content: "The JSON file could not be parsed. Verify that it is valid JSON and try again." }],
      toc: [],
      content: "",
      warnings: [String(error)],
      confidence: 0.4,
    };
  }
}
