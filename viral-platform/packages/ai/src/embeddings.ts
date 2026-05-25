import { EMBEDDING_DIM, MODELS } from '@vp/shared';
import OpenAI from 'openai';

let client: OpenAI | undefined;
function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
    client = new OpenAI({ apiKey });
  }
  return client;
}

/** Batch-embed texts with text-embedding-3-large (3072-dim, §6). */
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = await getClient().embeddings.create({
    model: MODELS.embedding,
    input: texts,
    dimensions: EMBEDDING_DIM,
  });
  // Preserve input order (API guarantees index alignment).
  return res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export async function embedOne(text: string): Promise<number[]> {
  const [v] = await embed([text]);
  if (!v) throw new Error('empty embedding response');
  return v;
}
