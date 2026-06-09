// ═══════════════════════════════════════════════════════════════════
// worker.js — main poll loop for the office scheduler
// ───────────────────────────────────────────────────────────────────
// Two concurrent loops:
//   1. ruleTick   — every minute, materialises schedule_rules into
//                    scheduled_jobs for the current minute window.
//   2. jobTick    — every POLL_INTERVAL_MS, claims the oldest pending
//                    job (FOR UPDATE SKIP LOCKED) and runs it.
//
// Crash-safe: pending jobs stay pending; running jobs that lost the
// process get reclaimed by RECLAIM_STALE_AFTER_MS (the next worker
// startup or the next jobTick fixes them).
// ═══════════════════════════════════════════════════════════════════

import Fastify from 'fastify';
import { pool, query, queryOne, withTx, waitForDb } from './lib/db.js';
import { getHandler, SUPPORTED_KINDS } from './handlers/index.js';
import { isAnthropicConfigured } from './lib/anthropic.js';
import { isTgConfigured } from './lib/tg.js';
import { registerWebhook, bootstrapBotMenu } from './lib/webhook.js';
import { isWhisperConfigured } from './lib/whisper.js';
import { isHeygenConfigured } from './lib/heygen.js';
import { isSubmagicConfigured, isBypass as isSubmagicBypass } from './lib/submagic.js';
import { isApifyConfigured } from './lib/apify.js';

const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '15000', 10);
const RULE_TICK_INTERVAL_MS = parseInt(process.env.RULE_TICK_INTERVAL_MS || '60000', 10);
const MAX_ATTEMPTS = parseInt(process.env.MAX_ATTEMPTS || '3', 10);
const RECLAIM_STALE_AFTER_MS = parseInt(process.env.RECLAIM_STALE_AFTER_MS || '300000', 10);
const HTTP_PORT = parseInt(process.env.HTTP_PORT || '3000', 10);

let shuttingDown = false;
let fastify;

// ═══ Boot ══════════════════════════════════════════════════════════
(async function main() {
  console.log('[worker] booting…');
  console.log('[worker] anthropic configured:', isAnthropicConfigured());
  console.log('[worker] tg configured:', isTgConfigured());
  console.log('[worker] viral_clone deps:', {
    whisper: isWhisperConfigured(),
    heygen:  isHeygenConfigured(),
    submagic: isSubmagicConfigured(),
    submagic_bypass: isSubmagicBypass(),
    apify:   isApifyConfigured(),
  });
  console.log('[worker] supported job kinds:', SUPPORTED_KINDS.join(', '));

  await waitForDb();
  console.log('[worker] db reachable');

  // Reclaim any jobs that were 'running' when previous worker died.
  await reclaimStaleJobs();

  // HTTP server for Telegram webhook (and /worker/health).
  fastify = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info' }, trustProxy: true });
  registerWebhook(fastify);
  await fastify.listen({ host: '0.0.0.0', port: HTTP_PORT });
  console.log(`[worker] http listening on :${HTTP_PORT}`);

  // Регистрируем TG-меню (setMyCommands + chat menu button). Idempotent,
  // ошибка не валит буt.
  bootstrapBotMenu().catch((e) => console.warn('[worker] bootstrapBotMenu failed:', e?.message));

  // Start loops.
  scheduleTick(jobTick, POLL_INTERVAL_MS, 'jobTick');
  scheduleTick(ruleTick, RULE_TICK_INTERVAL_MS, 'ruleTick');

  // Graceful shutdown
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, async () => {
      console.log(`[worker] ${sig} received — shutting down`);
      shuttingDown = true;
      await fastify?.close().catch(() => {});
      await pool.end().catch(() => {});
      process.exit(0);
    });
  }
})().catch((e) => {
  console.error('[worker] fatal at boot:', e);
  process.exit(1);
});

// ═══ Generic loop wrapper ══════════════════════════════════════════
function scheduleTick(fn, intervalMs, name) {
  const run = async () => {
    if (shuttingDown) return;
    try {
      await fn();
    } catch (e) {
      console.error(`[worker:${name}] tick error:`, e.message);
    } finally {
      if (!shuttingDown) setTimeout(run, intervalMs);
    }
  };
  setTimeout(run, 1000);
}

// ═══ ruleTick — expand cron rules to concrete jobs ═════════════════
//
// Note: this MVP only fires the rule when current UTC minute matches
// the cron_expr "M H * * D" pattern. Worker reads schedule_rules,
// computes "does NOW match cron_expr?", and inserts dedup'd rows.
// Falls back gracefully if cron_expr is malformed.
//
async function ruleTick() {
  const now = new Date();
  const minute = now.getUTCMinutes();
  const hour = now.getUTCHours();
  const dayOfWeek = now.getUTCDay(); // 0=Sun..6=Sat
  const dayOfMonth = now.getUTCDate();
  const month = now.getUTCMonth() + 1;

  const rules = await query(
    `SELECT id, kind, cron_expr, user_filter, payload_template
       FROM schedule_rules
      WHERE enabled = TRUE`,
  );

  for (const rule of rules) {
    if (!cronMatches(rule.cron_expr, { minute, hour, dayOfMonth, month, dayOfWeek })) continue;

    const users = await selectUsersForRule(rule.user_filter);
    if (users.length === 0) {
      console.log(`[worker:ruleTick] rule ${rule.id} (${rule.kind}): no eligible users`);
      continue;
    }

    // Snap scheduled_at to the top of the current minute for dedup.
    const scheduledAt = new Date(now);
    scheduledAt.setUTCSeconds(0, 0);

    let created = 0;
    for (const u of users) {
      const payload = {
        ...rule.payload_template,
        tg_chat_id: u.tg_chat_id,
        user_name: u.name,
        user_context: u.context,
      };
      const inserted = await queryOne(
        `INSERT INTO scheduled_jobs
           (rule_id, kind, user_id, scheduled_at, status, payload)
         VALUES ($1, $2, $3, $4, 'pending', $5)
         ON CONFLICT (rule_id, user_id, scheduled_at)
           WHERE rule_id IS NOT NULL AND user_id IS NOT NULL
           DO NOTHING
         RETURNING id`,
        [rule.id, rule.kind, u.user_id, scheduledAt.toISOString(), JSON.stringify(payload)],
      );
      if (inserted) created++;
    }
    console.log(`[worker:ruleTick] rule ${rule.id} (${rule.kind}): ${created} jobs created (${users.length} eligible)`);
  }
}

// ═══ selectUsersForRule — apply user_filter ═══════════════════════
//
// Supported filters:
//   {} or unset                — no users (safe default)
//   {requires_tg_link: true}   — all platform_users with tg_chat_id IS NOT NULL
//   {requires_active_sub: true} — same as above AND has active subscription
//   {inline_user: {...}}       — one-off test user, no DB row needed
//   {default_context: "..."}   — fallback user_context if user has no quiz data
//
async function selectUsersForRule(filter) {
  filter = filter || {};

  // System-wide rule — one job per tick, handler does its own scanning.
  // user_id stays NULL; the handler ignores tg_chat_id (it'll resolve
  // per-row inside its own SQL).
  if (filter.system_wide) {
    return [{ user_id: null, tg_chat_id: null, name: null, context: null }];
  }

  // Inline-user path (for testing without platform_users):
  //   {"inline_user": {"tg_chat_id": 12345, "name": "Илья", "context": "..."}}
  if (filter.inline_user?.tg_chat_id) {
    return [{
      user_id: null,
      tg_chat_id: filter.inline_user.tg_chat_id,
      name: filter.inline_user.name || 'друг',
      context: filter.inline_user.context || '',
    }];
  }

  if (filter.requires_active_sub) {
    const rows = await query(
      `SELECT u.id AS user_id, u.tg_chat_id, u.name
         FROM platform_users u
         JOIN platform_subscriptions s ON s.user_id = u.id
        WHERE u.tg_chat_id IS NOT NULL
          AND s.status = 'active'`,
    );
    return rows.map((r) => ({
      user_id: r.user_id,
      tg_chat_id: Number(r.tg_chat_id),
      name: r.name || 'друг',
      context: filter.default_context || '',
    }));
  }

  if (filter.requires_tg_link) {
    const rows = await query(
      `SELECT id AS user_id, tg_chat_id, name
         FROM platform_users
        WHERE tg_chat_id IS NOT NULL`,
    );
    return rows.map((r) => ({
      user_id: r.user_id,
      tg_chat_id: Number(r.tg_chat_id),
      name: r.name || 'друг',
      context: filter.default_context || '',
    }));
  }

  return [];
}

// ═══ jobTick — claim + execute ═════════════════════════════════════
async function jobTick() {
  const job = await claimNextJob();
  if (!job) return;

  console.log(`[worker:jobTick] claimed job ${job.id} kind=${job.kind} (attempt ${job.attempts})`);

  const handler = getHandler(job.kind);
  if (!handler) {
    await failJob(job.id, `no handler for kind=${job.kind}`);
    return;
  }

  let result;
  try {
    result = await handler(job);
  } catch (e) {
    console.error(`[worker:jobTick] handler crash:`, e);
    result = { ok: false, error: 'handler_crash: ' + (e.message || String(e)) };
  }

  if (result?.ok) {
    await query(
      `UPDATE scheduled_jobs
          SET status = 'done', completed_at = NOW(), result = $1
        WHERE id = $2`,
      [JSON.stringify(result), job.id],
    );
    console.log(`[worker:jobTick] job ${job.id} done`);
  } else {
    const errMsg = String(result?.error || 'unknown error').slice(0, 1000);
    if (job.attempts + 1 >= MAX_ATTEMPTS) {
      await failJob(job.id, errMsg);
      console.warn(`[worker:jobTick] job ${job.id} FAILED (out of attempts):`, errMsg);
    } else {
      // Schedule retry with backoff (linear: +1min per attempt)
      await query(
        `UPDATE scheduled_jobs
            SET status = 'pending',
                scheduled_at = NOW() + (INTERVAL '1 minute' * $1),
                last_error = $2
          WHERE id = $3`,
        [job.attempts + 1, errMsg, job.id],
      );
      console.warn(`[worker:jobTick] job ${job.id} retry in ${job.attempts + 1} min:`, errMsg);
    }
  }
}

async function claimNextJob() {
  return withTx(async (client) => {
    const r = await client.query(
      `SELECT id, kind, user_id, scheduled_at, payload, attempts
         FROM scheduled_jobs
        WHERE status = 'pending'
          AND scheduled_at <= NOW()
        ORDER BY scheduled_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED`,
    );
    if (r.rows.length === 0) return null;
    const job = r.rows[0];
    await client.query(
      `UPDATE scheduled_jobs
          SET status = 'running',
              started_at = NOW(),
              attempts = attempts + 1
        WHERE id = $1`,
      [job.id],
    );
    return job;
  });
}

async function failJob(id, error) {
  await query(
    `UPDATE scheduled_jobs
        SET status = 'failed',
            completed_at = NOW(),
            last_error = $1
      WHERE id = $2`,
    [error.slice(0, 1000), id],
  );
}

async function reclaimStaleJobs() {
  const r = await query(
    `UPDATE scheduled_jobs
        SET status = 'pending',
            last_error = COALESCE(last_error, '') || ' [reclaimed]'
      WHERE status = 'running'
        AND started_at < NOW() - ($1 || ' milliseconds')::interval
      RETURNING id`,
    [String(RECLAIM_STALE_AFTER_MS)],
  );
  if (r.length > 0) {
    console.log(`[worker] reclaimed ${r.length} stale running jobs`);
  }
}

// ═══ cron matcher (minute hour dom month dow) ══════════════════════
function cronMatches(expr, t) {
  const parts = (expr || '').trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [m, h, dom, mon, dow] = parts;
  return (
    cronField(m, t.minute, 0, 59) &&
    cronField(h, t.hour, 0, 23) &&
    cronField(dom, t.dayOfMonth, 1, 31) &&
    cronField(mon, t.month, 1, 12) &&
    cronField(dow, t.dayOfWeek, 0, 6)
  );
}

function cronField(field, value, min, max) {
  if (field === '*') return true;
  // comma list
  if (field.includes(',')) {
    return field.split(',').some((p) => cronField(p, value, min, max));
  }
  // step: */5  or  10-30/5
  if (field.includes('/')) {
    const [base, stepStr] = field.split('/');
    const step = parseInt(stepStr, 10);
    if (!step) return false;
    const range = base === '*' ? [min, max] : rangeFromField(base, min, max);
    if (!range) return false;
    return value >= range[0] && value <= range[1] && (value - range[0]) % step === 0;
  }
  // range
  if (field.includes('-')) {
    const range = rangeFromField(field, min, max);
    if (!range) return false;
    return value >= range[0] && value <= range[1];
  }
  // single
  const n = parseInt(field, 10);
  return Number.isFinite(n) && n === value;
}

function rangeFromField(f, min, max) {
  const [a, b] = f.split('-').map((s) => parseInt(s, 10));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return [Math.max(a, min), Math.min(b, max)];
}
