export interface SummaryResult {
  summary: string;
  quality: "low" | "medium" | "high";
}

export function summarizeText(text: string): SummaryResult {
  return {
    summary: text.split(" ").slice(0, 40).join(" "),
    quality: "low",
  };
}
