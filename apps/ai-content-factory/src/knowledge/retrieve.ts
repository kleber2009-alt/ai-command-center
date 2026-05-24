// RAG retrieval: given the topic/format being generated, find the most relevant
// past content and split it into top performers (to emulate) and low performers
// (to avoid), plus the agent's stored learnings.

import type { DB } from '../db/index.js';
import { embedTexts } from '../embeddings/voyage.js';
import {
  contentCount,
  searchSimilar,
  getLearnings,
  type SimilarContent,
  type Learning,
} from './store.js';

export interface RagExample {
  id: number;
  type: string;
  topic: string | null;
  hook: string | null;
  content: string;
  format: string | null;
  performance_score: number;
  similarity: number;
}

export interface RagContext {
  good: RagExample[];
  bad: RagExample[];
  learnings: Learning[];
}

export interface RetrieveQuery {
  topic: string;
  type?: string;
  format?: string;
  topK?: number;
  lowK?: number;
  candidates?: number;
}

function toExample(c: SimilarContent): RagExample {
  return {
    id: c.id,
    type: c.type,
    topic: c.topic,
    hook: c.hook,
    content: c.content,
    format: c.format,
    performance_score: c.performance_score,
    similarity: c.similarity,
  };
}

export async function retrieveContext(db: DB, q: RetrieveQuery): Promise<RagContext | null> {
  if (contentCount(db) === 0) return null;

  const queryText = [q.topic, q.format, q.type].filter(Boolean).join(' — ');
  const [embedding] = await embedTexts([queryText], 'query');
  if (!embedding) return null;

  const candidates = searchSimilar(db, embedding, { limit: q.candidates ?? 30 });
  const scored = candidates.filter((c) => c.performance_score > 0);

  const good = scored
    .slice()
    .sort((a, b) => b.performance_score - a.performance_score)
    .slice(0, q.topK ?? 5);
  const goodIds = new Set(good.map((g) => g.id));
  const bad = scored
    .slice()
    .sort((a, b) => a.performance_score - b.performance_score)
    .filter((c) => !goodIds.has(c.id))
    .slice(0, q.lowK ?? 3);

  const learnings = getLearnings(db, 10);

  if (good.length === 0 && bad.length === 0 && learnings.length === 0) return null;
  return { good: good.map(toExample), bad: bad.map(toExample), learnings };
}
