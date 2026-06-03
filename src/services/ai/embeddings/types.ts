export interface EmbeddingVector {
  values: number[];
  dimension: number;
}

export interface EmbeddingItem {
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface EmbeddingResult {
  id: string;
  vector: EmbeddingVector;
  metadata?: Record<string, unknown>;
}

export interface EmbeddingProvider {
  name: string;
  embedText(text: string, metadata?: Record<string, unknown>): Promise<EmbeddingResult>;
  embedDocuments(items: EmbeddingItem[]): Promise<EmbeddingResult[]>;
}
