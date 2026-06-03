import type { EmbeddingResult, EmbeddingProvider, EmbeddingItem } from "./types";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const OPENAI_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

function createVectorResult(id: string, values: number[], metadata?: Record<string, unknown>): EmbeddingResult {
  return {
    id,
    vector: { values, dimension: values.length },
    metadata,
  };
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  name = "openai";

  private ensureConfigured() {
    if (!OPENAI_API_KEY) {
      throw new Error("OpenAI API key is not configured. Set OPENAI_API_KEY.");
    }
  }

  async embedText(text: string, metadata?: Record<string, unknown>): Promise<EmbeddingResult> {
    this.ensureConfigured();

    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_EMBEDDING_MODEL,
        input: text,
      }),
    });

    const payload = await response.json();
    if (!response.ok || !payload.data || !Array.isArray(payload.data) || !payload.data[0]?.embedding) {
      throw new Error(`OpenAI embedding request failed: ${JSON.stringify(payload)}`);
    }

    return createVectorResult(`embed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, payload.data[0].embedding as number[], {
      textLength: text.length,
      ...metadata,
    });
  }

  async embedDocuments(items: EmbeddingItem[]): Promise<EmbeddingResult[]> {
    this.ensureConfigured();

    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_EMBEDDING_MODEL,
        input: items.map((item) => item.text),
      }),
    });

    const payload = await response.json();
    if (!response.ok || !payload.data || !Array.isArray(payload.data) || payload.data.length !== items.length) {
      throw new Error(`OpenAI batch embedding request failed: ${JSON.stringify(payload)}`);
    }

    return payload.data.map((item: any, index: number) =>
      createVectorResult(items[index].id, item.embedding as number[], items[index].metadata)
    );
  }
}
