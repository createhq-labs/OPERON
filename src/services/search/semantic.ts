import type { SearchEntry } from "./types";

export function semanticScore<T>(entry: SearchEntry<T>, query: string): number {
  if (!query) return 0;
  const cleanQuery = query.toLowerCase().trim();
  const chunks     = entry.semanticChunks;

  if (!chunks || chunks.length === 0) return 0;

  const score = chunks.reduce((acc, chunk) => {
    return chunk.text.toLowerCase().includes(cleanQuery) ? acc + 6 : acc;
  }, 0);

  return Math.min(score, 25);
}