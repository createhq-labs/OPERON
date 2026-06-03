import type { SearchEntry } from "./types";
import { tokenizeText } from "./tokenizer";

export function semanticScore<T>(entry: SearchEntry<T>, query: string): number {
  if (!query) return 0;
  const queryTokens = tokenizeText(query);
  const chunks = entry.semanticChunks ?? [];
  if (!chunks.length) return 0;

  const score = chunks.reduce((acc, chunk) => {
    const content = chunk.text.toLowerCase();
    return acc + queryTokens.reduce((chunkScore, token) => {
      if (content.includes(token)) {
        return chunkScore + 1;
      }
      if (content.startsWith(token)) {
        return chunkScore + 1.5;
      }
      return chunkScore;
    }, 0);
  }, 0);

  return Math.min(score, 25);
}
