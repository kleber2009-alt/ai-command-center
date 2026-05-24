// Knowledge-base persistence: write content + its vector, run KNN similarity
// search, read agent learnings, append generation logs. All functions take an
// explicit DB handle so they are trivial to test against an in-memory database.

import { floatsToBuffer, type DB } from '../db/index.js';
import { performanceScore, type ContentMetrics } from '../lib/performance.js';
import type { RawContentItem } from '../schemas/content.js';

interface ContentRow {
  id: number;
  type: string;
  source: string | null;
  topic: string | null;
  hook: string | null;
  content: string;
  cta: string | null;
  format: string | null;
  visual_style: string | null;
  metrics: string | null;
  performance_score: number;
}

export interface SimilarContent {
  id: number;
  type: string;
  source: string | null;
  topic: string | null;
  hook: string | null;
  content: string;
  cta: string | null;
  format: string | null;
  visual_style: string | null;
  metrics: ContentMetrics | null;
  performance_score: number;
  similarity: number;
}

export function addContent(db: DB, item: RawContentItem, embedding: number[]): number {
  const score = performanceScore(item.metrics);
  const info = db
    .prepare(
      `insert into content_library
       (type, source, topic, hook, content, cta, format, visual_style, metrics, performance_score)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      item.type,
      item.source ?? null,
      item.topic ?? null,
      item.hook ?? null,
      item.content,
      item.cta ?? null,
      item.format ?? null,
      item.visual_style ?? null,
      item.metrics ? JSON.stringify(item.metrics) : null,
      score,
    );
  const id = Number(info.lastInsertRowid);
  // vec0 requires the rowid as a BigInt; the embedding as a float32 BLOB.
  db.prepare('insert into vec_content(rowid, embedding) values (?, ?)').run(
    BigInt(id),
    floatsToBuffer(embedding),
  );
  return id;
}

export function contentCount(db: DB): number {
  return (db.prepare('select count(*) as n from content_library').get() as { n: number }).n;
}

export function searchSimilar(
  db: DB,
  embedding: number[],
  opts?: { limit?: number; type?: string },
): SimilarContent[] {
  const k = Math.max(1, Math.floor(opts?.limit ?? 30));
  const hits = db
    .prepare(
      `select rowid as id, distance from vec_content
       where embedding match ? order by distance limit ${k}`,
    )
    .all(floatsToBuffer(embedding)) as { id: number; distance: number }[];
  if (hits.length === 0) return [];

  const distanceById = new Map(hits.map((h) => [h.id, h.distance]));
  const ids = hits.map((h) => h.id);
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(`select * from content_library where id in (${placeholders})`)
    .all(...ids) as ContentRow[];

  let items: SimilarContent[] = rows.map((r) => ({
    id: r.id,
    type: r.type,
    source: r.source,
    topic: r.topic,
    hook: r.hook,
    content: r.content,
    cta: r.cta,
    format: r.format,
    visual_style: r.visual_style,
    metrics: r.metrics ? (JSON.parse(r.metrics) as ContentMetrics) : null,
    performance_score: r.performance_score,
    similarity: 1 - (distanceById.get(r.id) ?? 1),
  }));

  if (opts?.type) items = items.filter((i) => i.type === opts.type);
  items.sort((a, b) => b.similarity - a.similarity);
  return items;
}

export interface Learning {
  insight: string;
  learning_type: string | null;
  confidence: number | null;
}

export function getLearnings(db: DB, limit = 10): Learning[] {
  return db
    .prepare(
      `select insight, learning_type, confidence from agent_learnings
       order by coalesce(confidence, 0) desc, created_at desc limit ?`,
    )
    .all(Math.max(1, Math.floor(limit))) as Learning[];
}

export interface GenerationLogInput {
  campaignId?: string;
  contentDayId?: string;
  inputContext: unknown;
  retrievedExamples: unknown;
  generatedOutput: unknown;
  finalStatus: string;
  userRating?: number;
}

export function logGeneration(db: DB, entry: GenerationLogInput): number {
  const info = db
    .prepare(
      `insert into generation_logs
       (campaign_id, content_day_id, input_context, retrieved_examples, generated_output, user_rating, final_status)
       values (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      entry.campaignId ?? null,
      entry.contentDayId ?? null,
      JSON.stringify(entry.inputContext ?? null),
      JSON.stringify(entry.retrievedExamples ?? null),
      JSON.stringify(entry.generatedOutput ?? null),
      entry.userRating ?? null,
      entry.finalStatus,
    );
  return Number(info.lastInsertRowid);
}
