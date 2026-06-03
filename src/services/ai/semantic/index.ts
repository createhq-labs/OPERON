export interface SemanticRetrievalRequest {
  query: string;
  topK?: number;
  filters?: Record<string, unknown>;
}

export interface SemanticRetrievalResult<T> {
  results: Array<{
    id: string;
    score: number;
    item: T;
    metadata?: Record<string, unknown>;
  }>;
}

export interface SemanticProvider {
  name: string;
  retrieve<T>(request: SemanticRetrievalRequest): Promise<SemanticRetrievalResult<T>>;
}
