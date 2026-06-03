export interface EmbeddingResult {
  vector: number[];
  modelVersion: string;
  createdAt: string;
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const OPENAI_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

export async function generateEmbeddings(text: string): Promise<EmbeddingResult> {
  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI API key is not configured. Set OPENAI_API_KEY.");
  }

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
    throw new Error(`OpenAI embeddings request failed: ${JSON.stringify(payload)}`);
  }

  return {
    vector: payload.data[0].embedding as number[],
    modelVersion: OPENAI_EMBEDDING_MODEL,
    createdAt: new Date().toISOString(),
  };
}

export function isEmbeddingsEnabled() {
  return Boolean(OPENAI_API_KEY);
}
