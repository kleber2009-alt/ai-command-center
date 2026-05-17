// ═══════════════════════════════════════════════════════════════════
// server.js — Fastify backend for ai-office-project
// ───────────────────────────────────────────────────────────────────
// Replaces all Netlify Functions:
//   POST /api/chat                — Anthropic chat proxy (SSE-able)
//   POST /api/notify-tg           — Telegram admin notification proxy
//   POST /api/leads               — Save lead to Postgres
//   POST /api/voice-clone         — multipart → ElevenLabs → DB
//   POST /api/voice-generate      — text → TTS → storage → DB
//   GET  /api/voice-list          — active + archived voices
//   POST /api/voice-binding-token — issue one-time binding code
//   POST /api/tg-voice-webhook    — Telegram bot webhook
//   GET  /api/health              — health check
// ═══════════════════════════════════════════════════════════════════

import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, query, queryOne, waitForDb } from './lib/db.js';
import { initStorage } from './lib/storage.js';
import { cloneVoice, isConfigured as elevenConfigured } from './lib/elevenlabs.js';
import { generateVoiceNote } from './lib/voice-pipeline.js';
import { handleUpdate as handleTgUpdate, isConfigured as tgVoiceConfigured } from './lib/tg-voice-bot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VOICE_NOTES_DIR = process.env.VOICE_NOTES_DIR || '/data/voice-notes';
const STATIC_DIR = path.join(__dirname, 'static');

// Ensure dirs exist BEFORE @fastify/static registration (which checks at boot).
fs.mkdirSync(VOICE_NOTES_DIR, { recursive: true });
fs.mkdirSync(STATIC_DIR, { recursive: true });

const PORT = parseInt(process.env.PORT || '3000', 10);
const TG_WEBHOOK_SECRET = process.env.TG_WEBHOOK_SECRET || null;

/**
 * Normalize an owner handle so persona-train and the TG bot store/lookup
 * the same string. Adds @ prefix for usernames, lowercases emails.
 */
function normalizeOwnerHandle(s) {
  const t = String(s || '').trim().split(/\s+/)[0];
  if (!t) return null;
  if (t.includes('@') && t.includes('.')) return t.toLowerCase();
  return t.startsWith('@') ? t : '@' + t;
}

const fastify = Fastify({
  logger: { level: process.env.LOG_LEVEL || 'info' },
  trustProxy: true,
  bodyLimit: 12 * 1024 * 1024, // 12 MB (audio uploads)
});

await fastify.register(cors, { origin: true, credentials: false });
await fastify.register(multipart, {
  limits: { fileSize: 11 * 1024 * 1024, files: 5 },
});

// ── /voice-notes/* — generated audio (mounted volume) ──
await fastify.register(fastifyStatic, {
  root: VOICE_NOTES_DIR,
  prefix: '/voice-notes/',
  decorateReply: false,
  cacheControl: true,
  maxAge: 31536000 * 1000,
  immutable: true,
});

// ── / — static HTML/JS/CSS (ai-office-project, baked into image) ──
await fastify.register(fastifyStatic, {
  root: STATIC_DIR,
  prefix: '/',
  decorateReply: true,
  cacheControl: true,
  maxAge: 0,
});

// ═══ /api/health ════════════════════════════════════════════════════
// Краткий liveness-проб для мониторинга. Возвращает 200 если БД
// доступна, 503 если нет. Не делает дорогих внешних вызовов.
fastify.get('/api/health', async (request, reply) => {
  let dbOk = false;
  try {
    await query('select 1');
    dbOk = true;
  } catch {}
  const status = dbOk ? 200 : 503;
  return reply.code(status).send({
    ok: dbOk,
    db: dbOk,
    elevenlabs_configured: elevenConfigured(),
    tg_voice_bot_configured: tgVoiceConfigured(),
    public_base_url: process.env.PUBLIC_BASE_URL || null,
  });
});

// ═══ /api/health/full ═══════════════════════════════════════════════
// Детальная диагностика для отладки. Может выполняться долго (внешние
// вызовы). Не использовать для частых мониторингов.
fastify.get('/api/health/full', async (request, reply) => {
  const checks = {};
  let allOk = true;

  // DB
  try {
    const start = Date.now();
    await query('select 1');
    checks.db = { ok: true, latency_ms: Date.now() - start };
  } catch (e) {
    checks.db = { ok: false, error: String(e.message || e).slice(0, 200) };
    allOk = false;
  }

  // Voices count
  try {
    const [row] = await query('select count(*)::int as n from voices where archived_at is null');
    checks.voices_active = { ok: true, count: row.n };
  } catch (e) {
    checks.voices_active = { ok: false, error: String(e.message || e).slice(0, 200) };
  }

  // Voice generations (last hour)
  try {
    const [row] = await query(`select count(*)::int as n from voice_generations where created_at > now() - interval '1 hour'`);
    checks.generations_last_hour = { ok: true, count: row.n };
  } catch (e) {
    checks.generations_last_hour = { ok: false, error: String(e.message || e).slice(0, 200) };
  }

  // ElevenLabs reachability (cheap HEAD-ish — getMe doesn't exist, use /v1/user)
  if (elevenConfigured()) {
    try {
      const start = Date.now();
      const res = await fetch('https://api.elevenlabs.io/v1/user', {
        headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
      });
      checks.elevenlabs = {
        ok: res.ok,
        status: res.status,
        latency_ms: Date.now() - start,
      };
      if (!res.ok) allOk = false;
    } catch (e) {
      checks.elevenlabs = { ok: false, error: String(e.message || e).slice(0, 200) };
      allOk = false;
    }
  } else {
    checks.elevenlabs = { ok: null, note: 'not configured' };
  }

  // Telegram Bot
  if (tgVoiceConfigured()) {
    try {
      const start = Date.now();
      const res = await fetch(
        `https://api.telegram.org/bot${process.env.TG_VOICE_BOT_TOKEN}/getMe`,
      );
      checks.tg_voice_bot = {
        ok: res.ok,
        status: res.status,
        latency_ms: Date.now() - start,
      };
      if (!res.ok) allOk = false;
    } catch (e) {
      checks.tg_voice_bot = { ok: false, error: String(e.message || e).slice(0, 200) };
      allOk = false;
    }
  } else {
    checks.tg_voice_bot = { ok: null, note: 'not configured' };
  }

  // Voice-notes disk usage (best-effort)
  try {
    const { statSync } = await import('node:fs');
    const stat = statSync(process.env.VOICE_NOTES_DIR || '/data/voice-notes');
    checks.voice_notes_dir = { ok: true, exists: stat.isDirectory() };
  } catch (e) {
    checks.voice_notes_dir = { ok: false, error: String(e.message || e).slice(0, 100) };
  }

  return reply.code(allOk ? 200 : 503).send({
    ok: allOk,
    checks,
    timestamp: new Date().toISOString(),
  });
});

// ═══ /api/leads (replaces Supabase REST insert) ═════════════════════
fastify.post('/api/leads', async (request, reply) => {
  const b = request.body || {};
  const row = await queryOne(
    `insert into leads
       (niche, to_improve, current_revenue, goal, main_problem,
        recommended_agents, name, email, telegram, source, ref_data)
     values ($1, $2::jsonb, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11::jsonb)
     returning id, created_at`,
    [
      b.niche || null,
      JSON.stringify(b.to_improve || b.toImprove || b.focus || []),
      b.current_revenue || b.revenue || b.rev_now || null,
      b.goal || null,
      b.main_problem || b.problem || b.pain || null,
      JSON.stringify(b.recommended_agents || b.agents || []),
      b.name || null,
      b.email || null,
      b.telegram || b.tg || null,
      b.source || 'ai_office_form',
      JSON.stringify(b.ref_data || null),
    ],
  );
  return { ok: true, id: row.id, created_at: row.created_at };
});

// ═══ /api/chat ═════════════════════════════════════════════════════
fastify.post('/api/chat', async (request, reply) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return reply.code(503).send({ error: 'anthropic_not_configured' });

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(request.body),
  });

  reply.code(upstream.status);
  reply.header('Content-Type', upstream.headers.get('Content-Type') || 'application/json');
  reply.header('Cache-Control', 'no-cache');
  return reply.send(upstream.body);
});

// ═══ /api/notify-tg ═════════════════════════════════════════════════
fastify.post('/api/notify-tg', async (request, reply) => {
  const token = process.env.TG_BOT_TOKEN;
  const defaultChat = process.env.TG_CHAT_ID;
  if (!token || !defaultChat) {
    return reply.code(503).send({ error: 'tg_not_configured' });
  }

  const { text, chat_id, parse_mode } = request.body || {};
  const safeText = String(text || '').slice(0, 4000).trim();
  if (!safeText) return reply.code(400).send({ error: 'empty_text' });

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chat_id || defaultChat,
      text: safeText,
      parse_mode: parse_mode || 'Markdown',
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    return reply.code(502).send({ error: 'tg_api_error', details: (await res.text()).slice(0, 400) });
  }
  const data = await res.json();
  return { ok: true, message_id: data.result?.message_id };
});

// ═══ /api/voice-clone (multipart) ═══════════════════════════════════
fastify.post('/api/voice-clone', async (request, reply) => {
  if (!elevenConfigured()) return reply.code(503).send({ error: 'eleven_not_configured' });

  // Collect multipart fields
  let ownerHandle = '';
  let displayName = '';
  let sampleSeconds = null;
  const files = [];

  for await (const part of request.parts()) {
    if (part.type === 'file') {
      const chunks = [];
      for await (const chunk of part.file) chunks.push(chunk);
      const buf = Buffer.concat(chunks);
      files.push({ buffer: buf, filename: part.filename });
    } else if (part.fieldname === 'owner_handle') {
      ownerHandle = String(part.value).trim();
    } else if (part.fieldname === 'display_name') {
      displayName = String(part.value).trim().slice(0, 80);
    } else if (part.fieldname === 'sample_seconds') {
      sampleSeconds = parseInt(part.value, 10) || null;
    }
  }

  if (!ownerHandle) return reply.code(400).send({ error: 'owner_handle_required' });
  ownerHandle = normalizeOwnerHandle(ownerHandle);
  if (!files.length) return reply.code(400).send({ error: 'no_audio_files' });

  const name = displayName || ownerHandle;
  const clone = await cloneVoice({
    name,
    description: `AI Growth Office voice clone for ${ownerHandle}`,
    files,
  });
  if (!clone.ok) {
    return reply.code(clone.status).send({ error: 'eleven_clone_failed', details: clone.details });
  }

  // Archive previous active voice for this owner.
  await query(
    'update voices set archived_at = now() where owner_handle = $1 and archived_at is null',
    [ownerHandle],
  );

  // Insert new.
  const row = await queryOne(
    `insert into voices (owner_handle, display_name, provider, provider_voice_id, sample_seconds)
     values ($1, $2, 'elevenlabs', $3, $4)
     returning *`,
    [ownerHandle, name, clone.providerVoiceId, sampleSeconds],
  );

  return {
    ok: true,
    voice_id: row.id,
    provider_voice_id: row.provider_voice_id,
    display_name: row.display_name,
    owner_handle: row.owner_handle,
    created_at: row.created_at,
  };
});

// ═══ /api/voice-generate ═══════════════════════════════════════════
fastify.post('/api/voice-generate', async (request, reply) => {
  if (!elevenConfigured()) return reply.code(503).send({ error: 'eleven_not_configured' });
  const b = request.body || {};
  const result = await generateVoiceNote({
    text: String(b.text || '').trim(),
    voice_id: b.voice_id,
    owner_handle: b.owner_handle,
    provider_voice_id: b.provider_voice_id,
    model: b.model_id,
    stability: b.stability,
    similarity: b.similarity_boost,
    style: b.style,
    source: b.source || 'api',
  });
  if (!result.ok) {
    return reply.code(result.status || 500).send({ error: result.code, details: result.details });
  }
  return {
    ok: true,
    generation_id: result.generationId,
    audio_url: result.audioUrl,
    audio_path: result.audioPath,
    char_count: result.charCount,
    bytes: result.bytes,
    provider_voice_id: result.providerVoiceId,
  };
});

// ═══ /api/voice-list ════════════════════════════════════════════════
fastify.get('/api/voice-list', async (request, reply) => {
  const raw = String(request.query?.owner || '').trim();
  if (!raw) return reply.code(400).send({ error: 'owner_required' });
  const owner = normalizeOwnerHandle(raw);

  const [current] = await query(
    `select id, display_name, provider, provider_voice_id, sample_seconds, created_at
       from voices
      where owner_handle = $1 and archived_at is null
      order by created_at desc limit 1`,
    [owner],
  );
  const archived = await query(
    `select id, display_name, created_at, archived_at
       from voices
      where owner_handle = $1 and archived_at is not null
      order by archived_at desc limit 10`,
    [owner],
  );
  return { ok: true, current: current || null, archived };
});

// ═══ /api/voice-binding-token ══════════════════════════════════════
const ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXY23456789';
function genCode(len = 6) {
  const buf = crypto.getRandomValues(new Uint8Array(len));
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[buf[i] % ALPHABET.length];
  return `${out.slice(0, 3)}-${out.slice(3)}`;
}

const tokenRate = new Map();
function checkTokenRate(handle) {
  const now = Date.now();
  const hour = Math.floor(now / (60 * 60 * 1000));
  const key = `${handle}:${hour}`;
  const count = (tokenRate.get(key) || 0) + 1;
  tokenRate.set(key, count);
  for (const k of tokenRate.keys()) {
    const t = parseInt(k.split(':').pop(), 10);
    if (t < hour - 1) tokenRate.delete(k);
  }
  return count <= 5;
}

fastify.post('/api/voice-binding-token', async (request, reply) => {
  const rawHandle = String(request.body?.owner_handle || '').trim();
  if (!rawHandle) return reply.code(400).send({ error: 'owner_handle_required' });
  const ownerHandle = normalizeOwnerHandle(rawHandle);
  if (!checkTokenRate(ownerHandle)) {
    return reply.code(429).send({ error: 'rate_limited', max_per_hour: 5 });
  }

  const voice = await queryOne(
    'select * from voices where owner_handle = $1 and archived_at is null order by created_at desc limit 1',
    [ownerHandle],
  );
  if (!voice) {
    return reply.code(404).send({
      error: 'no_active_voice',
      hint: 'Создай голос на /persona-train',
    });
  }

  // Invalidate previous unused tokens.
  await query(
    `update voice_binding_tokens
        set used_at = now()
      where owner_handle = $1 and used_at is null`,
    [ownerHandle],
  );

  // Insert new (retry on rare collision).
  let row = null;
  for (let i = 0; i < 5; i++) {
    try {
      row = await queryOne(
        `insert into voice_binding_tokens (token, owner_handle, voice_id)
         values ($1, $2, $3)
         returning *`,
        [genCode(6), ownerHandle, voice.id],
      );
      break;
    } catch {
      // Likely PK collision — retry.
    }
  }
  if (!row) return reply.code(500).send({ error: 'token_insert_failed' });

  return {
    ok: true,
    token: row.token,
    owner_handle: row.owner_handle,
    voice_id: row.voice_id,
    expires_at: row.expires_at,
  };
});

// ═══ /api/tg-voice-webhook ═════════════════════════════════════════
fastify.get('/api/tg-voice-webhook', async () => ({
  ok: true,
  service: 'tg-voice-webhook',
  hint: 'POST a Telegram Update here.',
}));

fastify.post('/api/tg-voice-webhook', async (request, reply) => {
  if (!tgVoiceConfigured()) {
    return reply.code(503).send({ error: 'TG_VOICE_BOT_TOKEN_missing' });
  }
  if (TG_WEBHOOK_SECRET) {
    const got = request.headers['x-telegram-bot-api-secret-token'];
    if (got !== TG_WEBHOOK_SECRET) {
      return reply.code(401).send({ error: 'bad_secret' });
    }
  }
  try {
    await handleTgUpdate(request.body);
  } catch (e) {
    request.log.error({ err: e }, 'tg-voice-webhook handler error');
    // Always return 200 to Telegram — it retries indefinitely on non-2xx.
  }
  return { ok: true };
});

// ═══ Clean URLs (try .html / index.html / 404.html) ═══════════════
fastify.setNotFoundHandler(async (request, reply) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return reply.code(404).send({ error: 'not_found' });
  }
  const urlPath = request.url.split('?')[0].replace(/^\//, '');
  if (urlPath.startsWith('api/')) {
    return reply.code(404).send({ error: 'not_found', path: '/' + urlPath });
  }
  const candidates = [
    urlPath ? `${urlPath}.html` : 'index.html',
    urlPath ? `${urlPath}/index.html` : null,
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      return await reply.sendFile(candidate, STATIC_DIR);
    } catch {}
  }
  try {
    reply.code(404);
    return await reply.sendFile('404.html', STATIC_DIR);
  } catch {
    return reply.code(404).send({ error: 'not_found' });
  }
});

// ═══ Boot ══════════════════════════════════════════════════════════
async function start() {
  fastify.log.info('Waiting for database…');
  await waitForDb();
  fastify.log.info('Database ready');
  await initStorage();
  fastify.log.info('Storage initialized');
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
}

start().catch((err) => {
  console.error('Boot failed:', err);
  process.exit(1);
});

// ═══ Shutdown ══════════════════════════════════════════════════════
async function shutdown(sig) {
  fastify.log.info(`${sig} — shutting down`);
  await fastify.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
