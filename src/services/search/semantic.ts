import type { SearchEntry } from "./types";

export function semanticScore<T>(entry: SearchEntry<T>, query: string): number {
  if (!query) return 0;
  const cleanQuery = query.toLowerCase().trim();
  const chunks = (entry as any).semanticChunks as Array<{ id: string; text: string; metadata?: Record<string, unknown> }> | undefined;
  if (!chunks || chunks.length === 0) {
    return 0;
  }

  const score = chunks.reduce((acc, chunk) => {
    const text = chunk.text.toLowerCase();
    if (text.includes(cleanQuery)) {
      return acc + 6;
    }
    return acc;
  }, 0);

  return Math.min(score, 25);
}
