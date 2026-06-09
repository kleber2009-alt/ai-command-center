// ═══════════════════════════════════════════════════════════════════
// lib/orchestrator.js — spawn downstream agent tasks from an upstream
// agent's structured output.
// ───────────────────────────────────────────────────────────────────
// Convention: the upstream agent (Алиса) is asked to emit, after the
// user-facing message, a block:
//
//   <tasks>
//   [
//     {
//       "agent_id": "marketing-content-creator",
//       "agent_name": "Аня",
//       "agent_emoji": "✍️",
//       "kind": "daily_briefing",
//       "task_brief": "Подготовь Reels-сценарий про X (Илья поднял в пятничном recap).",
//       "delay_hours": 18
//     }
//   ]
//   </tasks>
//
// The handler calls extractTasks() → spawnTasks(). Bad JSON is logged
// and silently dropped — never crash a delivery for orchestration noise.
// ═══════════════════════════════════════════════════════════════════

import { query } from './db.js';

const MAX_TASKS_PER_SPAWN = 5;
const MAX_DELAY_HOURS = 24 * 7;
const ALLOWED_KINDS = new Set(['daily_briefing', 'weekly_recap', 'welcome_sequence']);

/**
 * Returns { cleanText, tasks }.
 * cleanText — the original text with the <tasks>…</tasks> block removed,
 *             ready to send to the user.
 * tasks     — parsed array (possibly empty).
 */
export function extractTasks(rawText) {
  const m = rawText.match(/<tasks>\s*([\s\S]*?)\s*<\/tasks>/i);
  if (!m) return { cleanText: rawText.trim(), tasks: [] };

  const cleanText = (rawText.slice(0, m.index) + rawText.slice(m.index + m[0].length))
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(m[1]);
  } catch {
    return { cleanText, tasks: [] };
  }

  if (!Array.isArray(parsed)) return { cleanText, tasks: [] };
  const sane = parsed.slice(0, MAX_TASKS_PER_SPAWN).filter(isSaneTask);
  return { cleanText, tasks: sane };
}

function isSaneTask(t) {
  if (!t || typeof t !== 'object') return false;
  if (typeof t.kind !== 'string' || !ALLOWED_KINDS.has(t.kind)) return false;
  if (typeof t.task_brief !== 'string' || t.task_brief.length < 5) return false;
  return true;
}

/**
 * Materialise parsed tasks into scheduled_jobs rows.
 *
 * @param {object} parent  — the upstream job (its user_id, payload.tg_chat_id, etc. propagate)
 * @param {Array}  tasks   — output of extractTasks()
 * @returns {Promise<{spawned: number, ids: string[]}>}
 */
export async function spawnTasks(parent, tasks) {
  if (!tasks || tasks.length === 0) return { spawned: 0, ids: [] };

  const parentPayload = parent.payload || {};
  const ids = [];

  for (const t of tasks) {
    const delayH = clamp(Number(t.delay_hours ?? 18), 0, MAX_DELAY_HOURS);
    const scheduledAt = new Date(Date.now() + delayH * 3600 * 1000);

    const childPayload = {
      tg_chat_id: parentPayload.tg_chat_id,
      user_name: parentPayload.user_name,
      user_context: parentPayload.user_context,
      agent_id: t.agent_id || 'marketing-content-creator',
      agent_name: t.agent_name || 'Аня',
      agent_emoji: t.agent_emoji || '✍️',
      task_brief: String(t.task_brief).slice(0, 600),
      spawned_by: {
        job_id: parent.id,
        agent_name: parentPayload.agent_name || parentPayload.office_lead?.name || null,
      },
    };

    const row = await query(
      `INSERT INTO scheduled_jobs (kind, user_id, scheduled_at, status, payload)
       VALUES ($1, $2, $3, 'pending', $4)
       RETURNING id`,
      [t.kind, parent.user_id || null, scheduledAt.toISOString(), JSON.stringify(childPayload)],
    );
    ids.push(row[0].id);
  }

  return { spawned: ids.length, ids };
}

function clamp(n, lo, hi) {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}
