#!/usr/bin/env node
// One-shot backfill: embed every existing tg_messages row into the
// Qdrant memory collection. Idempotent — Qdrant upserts by point ID,
// so re-running just re-embeds.
//
// Usage (on prod, inside the container):
//   docker exec -i tg-agent node scripts/backfill-memory.mjs
//
// Usage (locally):
//   cd apps/tg-agent
//   node --env-file=.env scripts/backfill-memory.mjs
//
// Env vars expected (same as the main app):
//   OPENAI_API_KEY, QDRANT_URL, QDRANT_COLLECTION, EMBEDDING_MODEL,
//   DATABASE_PATH.

import 'dotenv/config';
import { dirname, resolve } from 'node:path';

import Database from 'better-sqlite3';

import { createEmbeddingClient } from '../dist/memory/embeddings.js';
import { createQdrantClient } from '../dist/memory/qdrant.js';
import { createMemoryService } from '../dist/memory/service.js';

function fail(msg) {
  console.error(`backfill: ${msg}`);
  process.exit(1);
}

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) fail('OPENAI_API_KEY is not set');

const dbPath = resolve(process.env.DATABASE_PATH ?? './data/tg-agent.db');
const qdrantUrl = process.env.QDRANT_URL ?? 'http://aisales-qdrant:6333';
const collection = process.env.QDRANT_COLLECTION ?? 'tg-memory';
const model = process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small';

console.log(JSON.stringify({
  ts: new Date().toISOString(),
  msg: 'backfill: starting',
  dbPath,
  qdrantUrl,
  collection,
  model,
}));

// Minimal logger interface matching what MemoryService expects.
const logger = {
  info:  (msg, fields) => console.log(JSON.stringify({ ts: new Date().toISOString(), level: 'info',  msg, ...fields })),
  warn:  (msg, fields) => console.warn(JSON.stringify({ ts: new Date().toISOString(), level: 'warn',  msg, ...fields })),
  error: (msg, fields) => console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'error', msg, ...fields })),
  debug: () => {},
};

const db = new Database(dbPath, { readonly: true, fileMustExist: true });

// JOIN chat title + username so the Qdrant payload is self-contained
// and the admin UI doesn't need a second round-trip to render.
const rows = db.prepare(`
  SELECT m.id, m.chat_id, c.title AS chat_title,
         m.user_id, u.username, m.class, m.text, m.created_at
  FROM tg_messages m
  LEFT JOIN tg_chats c ON c.chat_id = m.chat_id
  LEFT JOIN tg_users u ON u.chat_id = m.chat_id AND u.user_id = m.user_id
  WHERE m.text IS NOT NULL AND length(trim(m.text)) > 0
  ORDER BY m.id ASC
`).all();

console.log(JSON.stringify({
  ts: new Date().toISOString(),
  msg: 'backfill: rows loaded',
  count: rows.length,
}));

if (rows.length === 0) {
  console.log('nothing to do');
  process.exit(0);
}

const memory = createMemoryService({
  embeddings: createEmbeddingClient({ apiKey, model }),
  qdrant: createQdrantClient({
    url: qdrantUrl,
    collection,
    apiKey: process.env.QDRANT_API_KEY,
  }),
  logger,
  batchSize: 96,
});

const items = rows.map((r) => ({
  id: Number(r.id),
  text: r.text,
  payload: {
    chat_id: r.chat_id,
    chat_title: r.chat_title ?? null,
    user_id: r.user_id ?? null,
    username: r.username ?? null,
    class: r.class ?? null,
    text: r.text,
    created_at: r.created_at,
  },
}));

const t0 = Date.now();
const result = await memory.indexBatch(items);
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

const info = await memory.info();
console.log(JSON.stringify({
  ts: new Date().toISOString(),
  msg: 'backfill: done',
  indexed: result.indexed,
  failed: result.failed,
  elapsedSec: Number(elapsed),
  collectionPoints: info.pointsCount,
  vectorSize: info.vectorSize,
}));

db.close();
process.exit(result.failed > 0 ? 1 : 0);
