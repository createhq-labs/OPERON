export interface EntityExtractionRequest {
  text: string;
  context?: string;
}

export interface EntityExtractionResult {
  entities: Array<{
    id: string;
    label: string;
    type: string;
    confidence: number;
    metadata?: Record<string, unknown>;
  }>;
}

export interface EntityProvider {
  name: string;
  extractEntities(request: EntityExtractionRequest): Promise<EntityExtractionResult>;
}
