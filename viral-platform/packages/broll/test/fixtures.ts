import { type StockAsset, type TranscriptWord, cosineSimilarity } from '@vp/shared';
import type { BrollEngineDeps, LibraryCandidate } from '../src/deps.js';

/**
 * Build a word-level transcript from a script. Each entry is [text, gapMsAfter].
 * Words are 350ms long with the given gap before the next word, so pauses can
 * be tuned to exercise the segmenter.
 */
export function buildWords(
  script: [word: string, gapMsAfter: number][],
  wordMs = 350,
  startMs = 0,
): TranscriptWord[] {
  const words: TranscriptWord[] = [];
  let t = startMs;
  for (const [word, gap] of script) {
    words.push({ word, startMs: t, endMs: t + wordMs, speaker: 0, confidence: 0.99 });
    t += wordMs + gap;
  }
  return words;
}

/** Build words from a plain sentence with uniform spacing (no big pauses). */
export function sentence(text: string, gap = 80, startMs = 0): TranscriptWord[] {
  return buildWords(
    text.split(/\s+/).map((w) => [w, gap]),
    350,
    startMs,
  );
}

export function makeAsset(over: Partial<StockAsset> = {}): StockAsset {
  return {
    id: 'pexels:1',
    provider: 'pexels',
    providerAssetId: '1',
    url: 'https://example.com/1.mp4',
    thumbnailUrl: 'https://example.com/1.jpg',
    durationMs: 10_000,
    width: 1080,
    height: 1920,
    tags: ['stock'],
    description: 'a stock clip',
    ...over,
  };
}

/** A user-library asset with a precomputed embedding (for my_library/hybrid). */
export function makeLibraryAsset(
  id: string,
  embedding: number[],
  over: Partial<StockAsset> = {},
): StockAsset & { embedding: number[] } {
  return {
    ...makeAsset({
      id,
      provider: 'user_library',
      providerAssetId: id,
      url: `library/${id}.mp4`,
      thumbnailUrl: `library/${id}_thumb.jpg`,
      description: `library asset ${id}`,
      ...over,
    }),
    embedding,
  };
}

/**
 * A deterministic, fully-offline deps double. The LLM verdict and the embedding
 * function are driven by simple keyword tables so tests are reproducible and
 * require no network (§4.5: "моки Pexels/Pixabay/LLM").
 */
export interface MockConfig {
  /** Map a segment substring → verdict. Default: no insert. */
  verdicts?: { match: string; concept: string; keywords?: string[]; durationMs?: number }[];
  /** Assets keyed by query substring. */
  assetsByConcept?: Record<string, StockAsset[]>;
  /** Embedding space: substring → vector. Cosine drives ranking + diversity. */
  embedTable?: { match: string; vector: number[] }[];
  /** User-library assets; searchLibrary ranks them by cosine like pgvector. */
  library?: (StockAsset & { embedding: number[] })[];
}

export function makeMockDeps(cfg: MockConfig = {}): BrollEngineDeps & { calls: { llm: number } } {
  const calls = { llm: 0 };

  const embedFor = (text: string): number[] => {
    const lower = text.toLowerCase();
    const hit = cfg.embedTable?.find((e) => lower.includes(e.match.toLowerCase()));
    return hit?.vector ?? [0.01, 0.01, 0.01];
  };

  return {
    calls,
    async llmComplete(prompt: string): Promise<string> {
      calls.llm++;
      // Match against the segment's own transcript only, not the whole prompt,
      // so prevContext can't leak another segment's keywords.
      const segText = prompt.match(/Сегмент:\s*"([\s\S]*?)"\s*Тайминги:/)?.[1] ?? prompt;
      const verdict = cfg.verdicts?.find((v) => segText.includes(v.match));
      if (!verdict) {
        return JSON.stringify({
          should_insert_broll: false,
          reasoning: 'abstract speech',
          keywords: ['none'],
          visual_concept: 'none',
          style: 'literal',
          suggested_duration_ms: 2000,
          insert_at_ms: 0,
        });
      }
      // Echo the segment's start time so insert_at_ms is realistic.
      const m = prompt.match(/Тайминги: (\d+)ms/);
      const insertAt = m ? Number(m[1]) : 0;
      return `Here you go:\n\`\`\`json\n${JSON.stringify({
        should_insert_broll: true,
        reasoning: `visual reinforces "${verdict.concept}"`,
        keywords: verdict.keywords ?? verdict.concept.split(' '),
        visual_concept: verdict.concept,
        style: 'metaphorical',
        suggested_duration_ms: verdict.durationMs ?? 2500,
        insert_at_ms: insertAt,
      })}\n\`\`\``;
    },
    async embed(texts: string[]): Promise<number[][]> {
      return texts.map(embedFor);
    },
    async searchPexels(query: string): Promise<StockAsset[]> {
      return findAssets(cfg.assetsByConcept, query, 'pexels');
    },
    async searchPixabay(query: string): Promise<StockAsset[]> {
      return findAssets(cfg.assetsByConcept, query, 'pixabay');
    },
    async searchLibrary(queryEmbedding, opts): Promise<LibraryCandidate[]> {
      // Mirror pgvector: rank all library assets by cosine to the query.
      return (cfg.library ?? [])
        .filter((a) => !opts.minDurationMs || a.durationMs >= opts.minDurationMs)
        .map((a) => ({
          ...a,
          provider: 'user_library' as const,
          similarity: cosineSimilarity(queryEmbedding, a.embedding),
        }))
        .sort((x, y) => y.similarity - x.similarity)
        .slice(0, opts.limit ?? 20);
    },
  };
}

function findAssets(
  table: Record<string, StockAsset[]> | undefined,
  query: string,
  provider: 'pexels' | 'pixabay',
): StockAsset[] {
  if (!table) return [];
  const lower = query.toLowerCase();
  for (const [concept, assets] of Object.entries(table)) {
    if (lower.includes(concept.toLowerCase())) {
      return assets.filter((a) => a.provider === provider);
    }
  }
  return [];
}
