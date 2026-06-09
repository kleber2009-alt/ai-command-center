// ═══════════════════════════════════════════════════════════════════
// lib/cabinet.js — Fastify routes for the Парсер cabinet
// (parser.46-62-215-11.nip.io/cabinet/* → /worker/cabinet/* on :3000)
// ───────────────────────────────────────────────────────────────────
// Auth flow:
//   1. Bot generates short-lived link token (HMAC of {u, c, e}) and sends
//      https://parser.…/cabinet/?t=<token> as a button.
//   2. Browser opens cabinet, POSTs the token to /cabinet/auth/exchange.
//   3. We verify the signature/expiry, set HttpOnly cookie `cab_session`
//      (HMAC of {u, e_30d}), return user id.
//   4. All subsequent /cabinet/api/* calls read the cookie.
//
// Why two secrets:
//   CABINET_LINK_SECRET   — short-lived URL tokens (10 min)
//   CABINET_SESSION_SECRET — long-lived browser sessions (30 days)
// Rotating the link secret invalidates pending magic links but keeps
// existing sessions; rotating session secret kicks everyone out.
// ═══════════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import { query, queryOne } from './db.js';

const LINK_SECRET    = process.env.CABINET_LINK_SECRET    || '';
const SESSION_SECRET = process.env.CABINET_SESSION_SECRET || '';
const LINK_TTL_MS    = 10 * 60 * 1000;             // 10 min
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;   // 30 days
const COOKIE_NAME    = 'cab_session';

// ─── base64url ────────────────────────────────────────────────────
function b64uEncode(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function b64uDecode(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}

// ─── HMAC helpers ─────────────────────────────────────────────────
function signPayload(payloadObj, secret) {
  if (!secret) throw new Error('cabinet secret not configured');
  const payload = b64uEncode(JSON.stringify(payloadObj));
  const sig = crypto.createHmac('sha256', secret).update(payload).digest();
  return `${payload}.${b64uEncode(sig)}`;
}
function verifyToken(token, secret) {
  if (!token || !secret) return null;
  const parts = String(token).split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = b64uEncode(crypto.createHmac('sha256', secret).update(payload).digest());
  // timing-safe compare
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let data;
  try { data = JSON.parse(b64uDecode(payload).toString('utf8')); }
  catch { return null; }
  if (!data || typeof data !== 'object') return null;
  if (typeof data.e !== 'number' || data.e < Date.now()) return null;
  return data;
}

// Public: bot calls this to build a deep-link URL.
export function buildCabinetLink(baseUrl, userId, chatId) {
  if (!LINK_SECRET) return null;
  const token = signPayload({ u: userId, c: chatId, e: Date.now() + LINK_TTL_MS }, LINK_SECRET);
  return `${baseUrl.replace(/\/$/, '')}/cabinet/?t=${encodeURIComponent(token)}`;
}

// ─── Cookie helpers ───────────────────────────────────────────────
function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}
function buildSessionCookie(userId) {
  const exp = Date.now() + SESSION_TTL_MS;
  const value = signPayload({ u: userId, e: exp }, SESSION_SECRET);
  const expires = new Date(exp).toUTCString();
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; Expires=${expires}; HttpOnly; Secure; SameSite=Lax`;
}
function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`;
}

// Middleware: returns user_id or null (sets 401 reply).
async function requireSession(request, reply) {
  const cookies = parseCookies(request.headers.cookie);
  const raw = cookies[COOKIE_NAME];
  const data = raw ? verifyToken(raw, SESSION_SECRET) : null;
  if (!data?.u) {
    reply.code(401).send({ error: 'unauthorized' });
    return null;
  }
  return data.u;
}

// ─── Route registration ───────────────────────────────────────────
export function registerCabinet(fastify) {
  // ── exchange link token → session cookie ─────────────────────
  fastify.post('/worker/cabinet/auth/exchange', async (request, reply) => {
    const body = request.body || {};
    const t = body.t;
    const data = verifyToken(t, LINK_SECRET);
    if (!data?.u) return reply.code(400).send({ error: 'invalid_or_expired_token' });

    // Validate the user actually exists.
    const user = await queryOne(
      `SELECT id, name, tg_chat_id FROM platform_users WHERE id = $1`,
      [data.u],
    );
    if (!user) return reply.code(404).send({ error: 'user_not_found' });

    // Bind tg_chat_id from token (in case it was missing).
    if (data.c && !user.tg_chat_id) {
      await query(
        `UPDATE platform_users SET tg_chat_id = $1 WHERE id = $2 AND tg_chat_id IS NULL`,
        [data.c, user.id],
      );
    }

    reply.header('Set-Cookie', buildSessionCookie(user.id));
    return { ok: true, user_id: user.id, name: user.name };
  });

  fastify.post('/worker/cabinet/auth/logout', async (request, reply) => {
    reply.header('Set-Cookie', clearSessionCookie());
    return { ok: true };
  });

  // ── /me — header info + onboarding stage ─────────────────────
  fastify.get('/worker/cabinet/api/me', async (request, reply) => {
    const userId = await requireSession(request, reply);
    if (!userId) return;
    const row = await queryOne(
      `SELECT u.id, u.name, u.email, u.tg_chat_id,
              c.onboarding_stage, c.enabled, c.niche_description,
              cardinality(c.competitors) AS competitors_count,
              cardinality(c.hashtags)    AS hashtags_count
         FROM platform_users u
         LEFT JOIN viral_discover_configs c ON c.user_id = u.id
        WHERE u.id = $1`,
      [userId],
    );
    if (!row) return reply.code(404).send({ error: 'user_not_found' });
    return {
      id: row.id,
      name: row.name,
      tg_chat_id: row.tg_chat_id,
      onboarding_stage: row.onboarding_stage,
      enabled: row.enabled === null ? true : Boolean(row.enabled),
      niche_short: (row.niche_description || '').slice(0, 120),
      competitors_count: row.competitors_count || 0,
      hashtags_count: row.hashtags_count || 0,
    };
  });

  // ── /config — full config (GET/PUT) ──────────────────────────
  fastify.get('/worker/cabinet/api/config', async (request, reply) => {
    const userId = await requireSession(request, reply);
    if (!userId) return;
    const cfg = await queryOne(
      `SELECT user_id, tg_chat_id, niche_description, language,
              competitors, hashtags, enabled, posted_within_days,
              reels_count, carousels_count, per_target_limit,
              min_plays, min_likes, min_comments,
              onboarding_stage, bot
         FROM viral_discover_configs WHERE user_id = $1`,
      [userId],
    );
    return cfg || { user_id: userId, competitors: [], hashtags: [], enabled: true };
  });

  fastify.put('/worker/cabinet/api/config', async (request, reply) => {
    const userId = await requireSession(request, reply);
    if (!userId) return;
    const b = request.body || {};
    const updates = [];
    const params = [];
    let i = 1;
    const push = (col, val) => { updates.push(`${col} = $${i++}`); params.push(val); };

    if (typeof b.niche_description === 'string') {
      push('niche_description', b.niche_description.slice(0, 1000));
    }
    if (Array.isArray(b.competitors)) {
      const arr = b.competitors
        .map((s) => String(s || '').trim())
        .filter((s) => /^@?[A-Za-z0-9._]{2,30}$/.test(s))
        .map((s) => '@' + s.replace(/^@/, ''))
        .slice(0, 25);
      push('competitors', arr);
    }
    if (Array.isArray(b.hashtags)) {
      const arr = b.hashtags
        .map((s) => String(s || '').replace(/^#/, '').toLowerCase()
          .replace(/[^A-Za-zА-Яа-я0-9_]/g, ''))
        .filter((s) => s.length >= 2 && s.length <= 40)
        .slice(0, 10);
      push('hashtags', arr);
    }
    if (typeof b.enabled === 'boolean')             push('enabled', b.enabled);
    if (Number.isFinite(b.posted_within_days))      push('posted_within_days', Math.min(30, Math.max(1, b.posted_within_days|0)));
    if (Number.isFinite(b.reels_count))             push('reels_count', Math.min(10, Math.max(0, b.reels_count|0)));
    if (Number.isFinite(b.carousels_count))         push('carousels_count', Math.min(10, Math.max(0, b.carousels_count|0)));
    if (Number.isFinite(b.min_plays))               push('min_plays', Math.max(0, b.min_plays|0));
    if (Number.isFinite(b.min_likes))               push('min_likes', Math.max(0, b.min_likes|0));
    if (Number.isFinite(b.min_comments))            push('min_comments', Math.max(0, b.min_comments|0));

    if (updates.length === 0) return reply.code(400).send({ error: 'no_fields' });
    params.push(userId);
    await query(
      `UPDATE viral_discover_configs SET ${updates.join(', ')} WHERE user_id = $${i}`,
      params,
    );
    return { ok: true };
  });

  // ── /runs — list with limit ──────────────────────────────────
  fastify.get('/worker/cabinet/api/runs', async (request, reply) => {
    const userId = await requireSession(request, reply);
    if (!userId) return;
    const limit = Math.min(60, Math.max(1, parseInt(request.query?.limit || '14', 10) || 14));
    const rows = await query(
      `SELECT r.id, r.ran_at, r.posts_scanned, r.last_error, r.deliverable_id,
              jsonb_array_length(r.reels)     AS reels_count,
              jsonb_array_length(r.carousels) AS carousels_count,
              (SELECT MAX((e->>'claude_score')::float) FROM jsonb_array_elements(r.reels) e)     AS reels_top,
              (SELECT MAX((e->>'claude_score')::float) FROM jsonb_array_elements(r.carousels) e) AS carousels_top,
              d.used_at, d.used_kind
         FROM viral_discover_runs r
         LEFT JOIN deliverables d ON d.id = r.deliverable_id
        WHERE r.user_id = $1
        ORDER BY r.ran_at DESC
        LIMIT $2`,
      [userId, limit],
    );
    return { runs: rows };
  });

  // ── /runs/latest — full payload for today tab ────────────────
  fastify.get('/worker/cabinet/api/runs/latest', async (request, reply) => {
    const userId = await requireSession(request, reply);
    if (!userId) return;
    const run = await queryOne(
      `SELECT r.id, r.ran_at, r.posts_scanned, r.reels, r.carousels,
              r.claude_summary, r.deliverable_id, r.last_error,
              d.used_at, d.used_kind
         FROM viral_discover_runs r
         LEFT JOIN deliverables d ON d.id = r.deliverable_id
        WHERE r.user_id = $1
        ORDER BY r.ran_at DESC LIMIT 1`,
      [userId],
    );
    if (!run) return { run: null };
    return { run };
  });

  // ── /runs/:id — single run details ───────────────────────────
  fastify.get('/worker/cabinet/api/runs/:id', async (request, reply) => {
    const userId = await requireSession(request, reply);
    if (!userId) return;
    const run = await queryOne(
      `SELECT r.id, r.ran_at, r.posts_scanned, r.reels, r.carousels,
              r.claude_summary, r.deliverable_id, r.last_error,
              d.used_at, d.used_kind
         FROM viral_discover_runs r
         LEFT JOIN deliverables d ON d.id = r.deliverable_id
        WHERE r.id = $1 AND r.user_id = $2`,
      [request.params.id, userId],
    );
    if (!run) return reply.code(404).send({ error: 'not_found' });
    return { run };
  });

  // ── force run now ────────────────────────────────────────────
  fastify.post('/worker/cabinet/api/run-now', async (request, reply) => {
    const userId = await requireSession(request, reply);
    if (!userId) return;
    const cfg = await queryOne(
      `SELECT tg_chat_id, onboarding_stage, niche_description,
              cardinality(competitors) AS cn, cardinality(hashtags) AS hn
         FROM viral_discover_configs WHERE user_id = $1`,
      [userId],
    );
    if (!cfg) return reply.code(400).send({ error: 'no_config' });
    if (cfg.onboarding_stage !== 'ready') return reply.code(400).send({ error: 'onboarding_unfinished' });
    if (!cfg.niche_description)           return reply.code(400).send({ error: 'no_niche' });
    if ((cfg.cn || 0) + (cfg.hn || 0) === 0) return reply.code(400).send({ error: 'no_sources' });

    const job = await queryOne(
      `INSERT INTO scheduled_jobs (kind, user_id, scheduled_at, status, payload)
       VALUES ('viral_discover', $1, NOW(), 'pending', $2::jsonb)
       RETURNING id`,
      [userId, JSON.stringify({ user_id: userId, tg_chat_id: cfg.tg_chat_id, force: true, source: 'cabinet' })],
    );
    return { ok: true, job_id: job.id };
  });

  // ── pause / resume ───────────────────────────────────────────
  fastify.post('/worker/cabinet/api/pause', async (request, reply) => {
    const userId = await requireSession(request, reply);
    if (!userId) return;
    await query(`UPDATE viral_discover_configs SET enabled = FALSE WHERE user_id = $1`, [userId]);
    return { ok: true, enabled: false };
  });
  fastify.post('/worker/cabinet/api/resume', async (request, reply) => {
    const userId = await requireSession(request, reply);
    if (!userId) return;
    await query(`UPDATE viral_discover_configs SET enabled = TRUE WHERE user_id = $1`, [userId]);
    return { ok: true, enabled: true };
  });

  // ── deliverable feedback (used / not_useful) ─────────────────
  fastify.post('/worker/cabinet/api/feedback', async (request, reply) => {
    const userId = await requireSession(request, reply);
    if (!userId) return;
    const { deliverable_id, kind } = request.body || {};
    if (!deliverable_id) return reply.code(400).send({ error: 'no_deliverable' });
    const usedKind = kind === 'used' ? 'used' : kind === 'not_useful' ? 'not_useful' : null;
    if (!usedKind) return reply.code(400).send({ error: 'bad_kind' });
    const updated = await query(
      `UPDATE deliverables SET used_at = NOW(), used_kind = $1
        WHERE id = $2 AND user_id = $3 AND used_at IS NULL
        RETURNING id`,
      [usedKind, deliverable_id, userId],
    );
    return { ok: true, updated: updated.length };
  });

  // ── candidates (new suggested competitors) ───────────────────
  fastify.get('/worker/cabinet/api/candidates', async (request, reply) => {
    const userId = await requireSession(request, reply);
    if (!userId) return;
    const rows = await query(
      `SELECT id, handle, found_via, best_score, posts_seen, created_at
         FROM viral_discover_candidates
        WHERE user_id = $1 AND status = 'pending'
        ORDER BY best_score DESC NULLS LAST, created_at DESC
        LIMIT 20`,
      [userId],
    );
    return { candidates: rows };
  });

  fastify.post('/worker/cabinet/api/candidates/:id/:action', async (request, reply) => {
    const userId = await requireSession(request, reply);
    if (!userId) return;
    const { id, action } = request.params;
    if (action !== 'accept' && action !== 'reject') {
      return reply.code(400).send({ error: 'bad_action' });
    }
    const cand = await queryOne(
      `SELECT handle, status FROM viral_discover_candidates WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    if (!cand) return reply.code(404).send({ error: 'not_found' });
    if (cand.status !== 'pending') return { ok: true, already: cand.status };

    if (action === 'accept') {
      await query(
        `UPDATE viral_discover_candidates SET status = 'accepted', decided_at = NOW() WHERE id = $1`,
        [id],
      );
      await query(
        `UPDATE viral_discover_configs
            SET competitors = (SELECT ARRAY(SELECT DISTINCT unnest(competitors || ARRAY[$1::text])))
          WHERE user_id = $2`,
        [cand.handle, userId],
      );
    } else {
      await query(
        `UPDATE viral_discover_candidates SET status = 'rejected', decided_at = NOW() WHERE id = $1`,
        [id],
      );
    }
    return { ok: true };
  });
}
