import type { EmbeddingProvider, EmbeddingResult, EmbeddingItem } from "./types";

export abstract class BaseEmbeddingProvider implements EmbeddingProvider {
  abstract name: string;

  abstract embedText(text: string, metadata?: Record<string, unknown>): Promise<EmbeddingResult>;

  async embedDocuments(items: EmbeddingItem[]): Promise<EmbeddingResult[]> {
    return Promise.all(items.map((item) => this.embedText(item.text, item.metadata)));
  }
}
