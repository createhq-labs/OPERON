export interface ExtractedEntity {
  type: string;
  value: string;
  confidence: number;
  references?: string[];
}

export function extractEntities(text: string) {
  return [] as ExtractedEntity[];
}
