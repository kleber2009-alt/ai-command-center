// OpenAI embeddings wrapper. text-embedding-3-small is the default;
// the model decides the vector dimension (1536 for -small, 3072 for
// -large). MemoryService passes the dimension to Qdrant.ensureCollection
// so a model change → collection-shape mismatch → loud error, not
// silent corruption.

import OpenAI from 'openai';

export interface EmbeddingClient {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  readonly model: string;
}

export interface EmbeddingClientOptions {
  apiKey: string;
  model: string;
}

// OpenAI accepts up to 8192 input tokens per item; bot messages are
// way shorter, but we still hard-cap to avoid pathological cases.
const MAX_INPUT_CHARS = 8000;

export function createEmbeddingClient(opts: EmbeddingClientOptions): EmbeddingClient {
  const client = new OpenAI({ apiKey: opts.apiKey });

  return {
    model: opts.model,

    async embed(text: string): Promise<number[]> {
      const res = await client.embeddings.create({
        model: opts.model,
        input: text.slice(0, MAX_INPUT_CHARS),
      });
      const v = res.data[0]?.embedding;
      if (!v) throw new Error('openai embed: empty response');
      return v;
    },

    async embedBatch(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];
      const trimmed = texts.map((t) => t.slice(0, MAX_INPUT_CHARS));
      const res = await client.embeddings.create({
        model: opts.model,
        input: trimmed,
      });
      if (res.data.length !== texts.length) {
        throw new Error(
          `openai embed: expected ${texts.length} vectors, got ${res.data.length}`,
        );
      }
      return res.data.map((d) => d.embedding);
    },
  };
}
