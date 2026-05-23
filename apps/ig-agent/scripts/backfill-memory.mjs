#!/usr/bin/env node
// Backfill all existing ig_agent messages into the shared
// "aicex-memory" Qdrant collection. Self-contained — uses fetch +
// `pg` (already a runtime dep). Idempotent: Qdrant upserts by the
// same deterministic UUID derived from messages.id, so re-running
// just re-embeds.
//
// Usage:
//   docker exec ig-agent node /app/scripts/backfill-memory.mjs

import 'node:process';
import { createHash } from 'node:crypto';
import pg from 'pg';
const { Client } = pg;

const fail = (msg) => { console.error('backfill:', msg); process.exit(1); };

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) fail('DATABASE_URL not set');

const openaiKey = process.env.OPENAI_API_KEY;
if (!openaiKey) fail('OPENAI_API_KEY not set');

const qdrantUrl = (process.env.QDRANT_URL ?? 'http://aisales-qdrant:6333').replace(/\/+$/, '');
const qdrantCollection = process.env.QDRANT_COLLECTION ?? 'aicex-memory';
const qdrantHeaders = { 'content-type': 'application/json' };
if (process.env.QDRANT_API_KEY) qdrantHeaders['api-key'] = process.env.QDRANT_API_KEY;

const ownerTelegramId = process.env.OWNER_TELEGRAM_ID
  ? Number(process.env.OWNER_TELEGRAM_ID)
  : null;

const log = (msg, fields = {}) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), msg, ...fields }));

log('backfill: starting', { qdrantUrl, qdrantCollection, ownerTelegramId });

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

// Ensure the collection exists (tg-agent creates it; we just probe).
{
  const probe = await fetch(`${qdrantUrl}/collections/${qdrantCollection}`, {
    headers: qdrantHeaders,
  });
  if (!probe.ok) {
    if (probe.status === 404) {
      const create = await fetch(`${qdrantUrl}/collections/${qdrantCollection}`, {
        method: 'PUT',
        headers: qdrantHeaders,
        body: JSON.stringify({ vectors: { size: 1536, distance: 'Cosine' } }),
      });
      if (!create.ok) fail(`create collection ${create.status}: ${await create.text()}`);
      log('backfill: created collection', { size: 1536 });
    } else {
      fail(`probe ${probe.status}: ${await probe.text()}`);
    }
  }
}

const pgClient = new Client({ connectionString: databaseUrl });
await pgClient.connect();

// Join contacts for the payload — IG username, display name, intent
// (latest non-null per message via direct column). Filter empty text.
const { rows } = await pgClient.query(`
  SELECT
    m.id, m.contact_id, m.direction, m.text, m.intent, m.created_at,
    c.ig_username, c.first_name, c.last_name
  FROM messages m
  JOIN contacts c ON c.id = m.contact_id
  WHERE m.text IS NOT NULL AND length(trim(m.text)) > 1
  ORDER BY m.created_at ASC
`);
log('backfill: rows loaded', { count: rows.length });

if (rows.length === 0) {
  await pgClient.end();
  process.exit(0);
}

const items = rows.map((r) => ({
  naturalKey: r.id,
  direction: r.direction,
  text: r.text,
  igUsername: r.ig_username,
  contactName: [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || null,
  intent: r.intent,
  createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
}));

await pgClient.end();

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
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: texts }),
    });
    if (!embedRes.ok) {
      throw new Error(`openai ${embedRes.status}: ${(await embedRes.text()).slice(0, 200)}`);
    }
    const embedJson = await embedRes.json();
    const vectors = embedJson.data.map((d) => d.embedding);

    const points = slice.map((s, j) => ({
      id: pointIdFor('ig-agent', s.naturalKey),
      vector: vectors[j],
      payload: {
        source: 'ig-agent',
        kind: `instagram_${s.direction}`,
        owner_telegram_id: ownerTelegramId,
        chat_id: null,
        chat_title: null,
        user_id: null,
        username: s.igUsername,
        class: s.intent,
        title: s.contactName,
        url: s.igUsername ? `https://instagram.com/${s.igUsername}` : null,
        text: s.text,
        created_at: s.createdAt,
      },
    }));
    const upsertRes = await fetch(
      `${qdrantUrl}/collections/${qdrantCollection}/points?wait=true`,
      { method: 'PUT', headers: qdrantHeaders, body: JSON.stringify({ points }) },
    );
    if (!upsertRes.ok) {
      throw new Error(`qdrant ${upsertRes.status}: ${(await upsertRes.text()).slice(0, 200)}`);
    }
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
