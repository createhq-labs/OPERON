export interface SummaryRequest {
  text: string;
  prompt?: string;
  maxLength?: number;
}

export interface SummaryResult {
  summary: string;
  metadata?: Record<string, unknown>;
}

export interface SummaryProvider {
  name: string;
  summarize(request: SummaryRequest): Promise<SummaryResult>;
}
