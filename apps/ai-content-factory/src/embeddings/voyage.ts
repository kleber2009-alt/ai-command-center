// Voyage AI embeddings (Anthropic's recommended pairing with Claude). Anthropic
// has no embeddings API of its own, so vector search relies on this provider.
// Reads VOYAGE_API_KEY; model/dimension overridable via env.

import { EMBEDDING_DIM } from '../db/index.js';

const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';

export const EMBEDDING_MODEL = process.env.VOYAGE_MODEL ?? 'voyage-3.5';

export type InputType = 'query' | 'document';

interface VoyageResponse {
  data: { index: number; embedding: number[] }[];
}

export async function embedTexts(texts: string[], inputType?: InputType): Promise<number[][]> {
  if (texts.length === 0) return [];
  const key = process.env.VOYAGE_API_KEY;
  if (!key) {
    throw new Error('VOYAGE_API_KEY is required for embeddings (knowledge base / RAG)');
  }

  const res = await fetch(VOYAGE_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      input: texts,
      model: EMBEDDING_MODEL,
      output_dimension: EMBEDDING_DIM,
      ...(inputType ? { input_type: inputType } : {}),
    }),
  });

  if (!res.ok) {
    throw new Error(`Voyage embeddings failed (${res.status}): ${await res.text()}`);
  }

  const json = (await res.json()) as VoyageResponse;
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}
