// ═══════════════════════════════════════════════════════════════════
// handlers/daily_briefing.js — утренняя планёрка от агента в TG
// ───────────────────────────────────────────────────────────────────
// Input (scheduled_jobs.payload):
//   {
//     tg_chat_id: number,           // required — куда слать
//     user_name?: string,           // как обращаться
//     user_context?: string,        // ниша, продукт, цели (из onboarding quiz)
//     agent_id: string,             // marketing-content-creator | ...
//     agent_name: string,           // Аня | Игорь | ...
//     agent_emoji?: string          // ✍️
//   }
//
// Output (scheduled_jobs.result):
//   { ok: true, deliverable_id, tg_message_id, usage, memory_updated }
// or { ok: false, error }
//
// Memory loop (when job.user_id is present):
//   1. SELECT agent_memory(user_id, agent_id) → inject summary+facts into system prompt
//   2. After successful send, UPSERT facts.briefing_history with the latest 7 items
// ═══════════════════════════════════════════════════════════════════

import { query, queryOne } from '../lib/db.js';
import { chat } from '../lib/anthropic.js';
import { sendDeliverable } from '../lib/tg.js';

const MAX_BRIEFING_TOKENS = 500;
const MAX_HISTORY = 7;     // rolling window of last N briefings kept in facts.briefing_history
const SNIPPET_LEN = 220;

export async function handle(job) {
  const p = job.payload || {};
  const tgChatId = p.tg_chat_id;
  if (!tgChatId) {
    return { ok: false, error: 'payload.tg_chat_id is required' };
  }

  const agentId = p.agent_id || 'marketing-content-creator';
  const agentName = p.agent_name || 'Аня';
  const agentEmoji = p.agent_emoji || '✍️';
  const userName = p.user_name || 'друг';
  const userContext = p.user_context || 'эксперт онлайн-школы, продаёт через IG/TG';
  const userId = job.user_id || null;

  // ── Orchestrator-spawned task (from Алиса via lib/orchestrator.js)
  const taskBrief = typeof p.task_brief === 'string' ? p.task_brief.trim() : '';
  const spawnedBy = p.spawned_by?.agent_name || null;

  // ── 1. Load agent memory (if linked to a real user) ────────────
  let memorySummary = '';
  let memoryFacts = {};
  if (userId) {
    const mem = await queryOne(
      'SELECT summary, facts FROM agent_memory WHERE user_id = $1 AND agent_id = $2',
      [userId, agentId],
    );
    if (mem) {
      memorySummary = mem.summary || '';
      memoryFacts = mem.facts || {};
    }
  }

  // ── 2. Build system prompt with memory injection ───────────────
  const memorySection = buildMemorySection(memorySummary, memoryFacts);

  const taskSection = taskBrief
    ? `\nТЕБЯ ПОПРОСИЛА${spawnedBy ? ' ' + spawnedBy.toUpperCase() : ''} ВЫПОЛНИТЬ КОНКРЕТНУЮ ЗАДАЧУ:
"${taskBrief}"

Делай ИМЕННО это, не выдумывай новую тему. В сообщении упомяни, что задача от ${spawnedBy || 'оркестратора'}, и покажи результат.
`
    : '';

  const system = `Ты — ${agentName} ${agentEmoji}, контент-стратег AI-офиса.

Контекст клиента:
${userContext}
${memorySection}${taskSection}
Твоя задача — написать короткое утреннее сообщение в Telegram:
- Обращайся к клиенту по имени (${userName}).
- 4-6 строк, тёплый разговорный тон, как из чата команды.
- ${taskBrief ? 'Покажи результат конкретной задачи из ТЕБЯ ПОПРОСИЛА выше.' : 'Опиши что "сделала за ночь": 1-2 конкретных артефакта (тема Reels, ответ на DM, идея поста).'}
- НЕ повторяй вчерашнюю тему. Если из контекста видно вчерашний пост — сегодня предлагай другое направление или развитие темы.
- Закончи одним вопросом или одной кнопкой действия.
- Без markdown-форматирования, без emoji-спама (макс 2 эмодзи на всё сообщение).
- На русском.
- Не объясняй что ты ИИ. Ты — ${agentName}, член её команды.

Пример тона (НЕ копируй дословно):
"Доброе утро, Мария. Подготовила Reels на сегодня — про возражение «нет времени», 47 секунд твоим стилем. Послушаешь?"`;

  // ── 3. Call Claude ─────────────────────────────────────────────
  const result = await chat({
    system,
    messages: [
      {
        role: 'user',
        content: 'Напиши утреннее сообщение для клиента на сегодня. Дата: ' + new Date().toISOString().slice(0, 10),
      },
    ],
    maxTokens: MAX_BRIEFING_TOKENS,
  });

  if (!result.ok) {
    return { ok: false, error: `claude: ${result.status} ${result.details?.slice(0, 200)}` };
  }

  const briefingText = result.text.slice(0, 1500);

  // ── 4. Insert deliverable BEFORE sending (so we have the id for buttons) ──
  const deliverable = await queryOne(
    `INSERT INTO deliverables
       (user_id, job_id, agent_id, agent_name, kind, title, body, metadata)
     VALUES ($1, $2, $3, $4, 'briefing', $5, $6, $7)
     RETURNING id`,
    [
      userId,
      job.id,
      agentId,
      agentName,
      `Утренняя планёрка от ${agentName}`,
      briefingText,
      JSON.stringify({ tg_chat_id: tgChatId, claude_usage: result.usage || null }),
    ],
  );

  // ── 5. Send to Telegram ────────────────────────────────────────
  const tgPrefix = `<b>${escapeHtml(agentName)} ${escapeHtml(agentEmoji)}</b>\n`;
  const tgRes = await sendDeliverable(tgChatId, deliverable.id, tgPrefix + escapeHtml(briefingText));

  if (!tgRes.ok) {
    return { ok: false, error: `tg: ${tgRes.status || ''} ${tgRes.error?.slice(0, 200)}` };
  }

  const tgMsgId = tgRes.result?.message_id;
  if (tgMsgId) {
    await query(
      `UPDATE deliverables
          SET metadata = metadata || jsonb_build_object('tg_message_id', $1::int)
        WHERE id = $2`,
      [tgMsgId, deliverable.id],
    );
  }

  // ── 6. UPSERT agent_memory.facts (only if real user) ───────────
  let memoryUpdated = false;
  if (userId) {
    const newEntry = {
      date: new Date().toISOString().slice(0, 10),
      snippet: briefingText.slice(0, SNIPPET_LEN),
    };
    const history = Array.isArray(memoryFacts.briefing_history)
      ? [newEntry, ...memoryFacts.briefing_history].slice(0, MAX_HISTORY)
      : [newEntry];
    const newFacts = { ...memoryFacts, briefing_history: history };

    await query(
      `INSERT INTO agent_memory (user_id, agent_id, summary, facts, last_seen)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id, agent_id) DO UPDATE
         SET facts = EXCLUDED.facts,
             last_seen = NOW(),
             updated_at = NOW()`,
      [userId, agentId, memorySummary, JSON.stringify(newFacts)],
    );
    memoryUpdated = true;
  }

  return {
    ok: true,
    deliverable_id: deliverable.id,
    tg_message_id: tgMsgId,
    usage: result.usage,
    memory_updated: memoryUpdated,
  };
}

function buildMemorySection(summary, facts) {
  const lines = [];
  if (summary) {
    lines.push(`Что ты уже знаешь о клиенте: ${summary}`);
  }
  if (facts && Array.isArray(facts.briefing_history) && facts.briefing_history.length > 0) {
    lines.push('Прошлые твои утренние сообщения (от свежих к старым):');
    for (const h of facts.briefing_history.slice(0, MAX_HISTORY)) {
      lines.push(`  • ${h.date}: ${h.snippet}`);
    }
  }
  if (lines.length === 0) return '';
  return '\n\nКОНТЕКСТ ИЗ ПАМЯТИ:\n' + lines.join('\n') + '\n';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
