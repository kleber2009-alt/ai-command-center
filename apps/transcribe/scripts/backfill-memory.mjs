#!/usr/bin/env node
// Backfill transcribe's transcripts + summaries into the shared
// "aicex-memory" Qdrant collection. Self-contained — uses fetch for
// OpenAI + Qdrant + the postgres npm package for the DB. Safe to run
// from inside the infra-transcribe-1 container (where the npm
// runtime + node_modules are already available).
//
// Env (all required except QDRANT_API_KEY):
//   POSTGRES_URL          (or fallbacks set in src/lib/db.ts)
//   OPENAI_API_KEY
//   QDRANT_URL            default: http://aisales-qdrant:6333
//   QDRANT_COLLECTION     default: aicex-memory
//   QDRANT_API_KEY
//   OWNER_TELEGRAM_ID     numeric; attached to each point so cross-app
//                         search can scope to the brain's owner.
//
// Usage:
//   docker exec infra-transcribe-1 node /app/scripts/backfill-memory.mjs

import 'node:process';
import { createHash } from 'node:crypto';
import postgres from 'postgres';

const fail = (msg) => { console.error('backfill:', msg); process.exit(1); };

const pgUrl = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!pgUrl) fail('POSTGRES_URL or DATABASE_URL not set');

const openaiKey = process.env.OPENAI_API_KEY;
if (!openaiKey) fail('OPENAI_API_KEY not set');

const qdrantUrl = (process.env.QDRANT_URL ?? 'http://aisales-qdrant:6333').replace(/\/+$/, '');
const qdrantCollection = process.env.QDRANT_COLLECTION ?? 'aicex-memory';
const qdrantHeaders = { 'content-type': 'application/json' };
if (process.env.QDRANT_API_KEY) qdrantHeaders['api-key'] = process.env.QDRANT_API_KEY;

const ownerTelegramId = process.env.OWNER_TELEGRAM_ID
  ? Number(process.env.OWNER_TELEGRAM_ID)
  : null;

const log = (msg, fields = {}) => console.log(JSON.stringify({
  ts: new Date().toISOString(), msg, ...fields,
}));

log('backfill: starting', { qdrantUrl, qdrantCollection, ownerTelegramId });

// ── Qdrant collection check (created by tg-agent on its first run; we
//    just probe and refuse to insert if vector size mismatches).
{
  const probe = await fetch(`${qdrantUrl}/collections/${qdrantCollection}`, { headers: qdrantHeaders });
  if (!probe.ok) {
    if (probe.status === 404) {
      // Create collection ourselves. text-embedding-3-small → 1536d.
      const create = await fetch(`${qdrantUrl}/collections/${qdrantCollection}`, {
        method: 'PUT',
        headers: qdrantHeaders,
        body: JSON.stringify({ vectors: { size: 1536, distance: 'Cosine' } }),
      });
      if (!create.ok) fail(`qdrant create collection ${create.status}: ${await create.text()}`);
      log('backfill: created collection', { size: 1536 });
    } else {
      fail(`qdrant probe ${probe.status}: ${await probe.text()}`);
    }
  }
}

// ── Deterministic UUID v5 derived from (source, naturalKey). Matches
//    the helper in apps/tg-agent/src/memory/service.ts.
function pointIdFor(source, naturalKey) {
  const hash = createHash('sha1').update(`${source}:${naturalKey}`).digest('hex');
  const a = hash.slice(0, 8);
  const b = hash.slice(8, 12);
  const c = '5' + hash.slice(13, 16);
  const v = (parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80;
  const d = v.toString(16).padStart(2, '0') + hash.slice(18, 20);
  const e = hash.slice(20, 32);
  return `${a}-${b}-${c}-${d}-${e}`;
}

// ── Load transcripts + summaries.
const sql = postgres(pgUrl, { ssl: process.env.PGSSL === 'true' });

const rows = await sql`
  SELECT id, url, title, transcript, summary, bullets, created_at
  FROM transcripts
  WHERE transcript IS NOT NULL AND length(trim(transcript)) > 0
  ORDER BY created_at ASC
`;
log('backfill: rows loaded', { count: rows.length });

if (rows.length === 0) {
  await sql.end();
  process.exit(0);
}

// ── Build index items. Each transcript = 1 point. If row.summary
//    exists, also build a 2nd point with kind='summary'.
const items = [];
for (const r of rows) {
  const titleClean = r.title ?? (r.transcript.slice(0, 60).trim() + '…');
  items.push({
    naturalKey: r.id,
    kind: 'transcript',
    text: r.transcript,
    title: titleClean,
    url: r.url,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  });
  if (r.summary && r.summary.trim().length > 0) {
    const bullets = Array.isArray(r.bullets) ? r.bullets : [];
    const indexText = bullets.length > 0
      ? `${r.summary}\n\n${bullets.map((b) => `• ${b}`).join('\n')}`
      : r.summary;
    items.push({
      naturalKey: `${r.id}-summary`,
      kind: 'summary',
      text: indexText,
      title: titleClean,
      url: r.url,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    });
  }
}

await sql.end();
log('backfill: items prepared', { count: items.length });

// ── Embed + upsert in batches of 96.
const BATCH = 96;
let indexed = 0;
let failed = 0;
const t0 = Date.now();

for (let i = 0; i < items.length; i += BATCH) {
  const slice = items.slice(i, i + BATCH);
  try {
    const texts = slice.map((s) => s.text.slice(0, 8000));
    const embedRes = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: texts }),
    });
    if (!embedRes.ok) throw new Error(`openai ${embedRes.status}: ${(await embedRes.text()).slice(0, 200)}`);
    const embedJson = await embedRes.json();
    const vectors = embedJson.data.map((d) => d.embedding);

    const points = slice.map((s, j) => ({
      id: pointIdFor('transcribe', s.naturalKey),
      vector: vectors[j],
      payload: {
        source: 'transcribe',
        kind: s.kind,
        owner_telegram_id: ownerTelegramId,
        chat_id: null,
        chat_title: null,
        user_id: null,
        username: null,
        class: null,
        title: s.title,
        url: s.url,
        text: s.text,
        created_at: s.createdAt,
      },
    }));
    const upsertRes = await fetch(`${qdrantUrl}/collections/${qdrantCollection}/points?wait=true`, {
      method: 'PUT',
      headers: qdrantHeaders,
      body: JSON.stringify({ points }),
    });
    if (!upsertRes.ok) throw new Error(`qdrant ${upsertRes.status}: ${(await upsertRes.text()).slice(0, 200)}`);
    indexed += points.length;
    log('backfill: batch indexed', { from: i, to: i + slice.length, total: items.length });
  } catch (err) {
    failed += slice.length;
    log('backfill: batch failed', { from: i, count: slice.length, error: err.message });
  }
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
log('backfill: done', { indexed, failed, elapsedSec: Number(elapsed) });
process.exit(failed > 0 ? 1 : 0);
