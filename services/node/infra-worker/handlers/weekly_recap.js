// ═══════════════════════════════════════════════════════════════════
// handlers/weekly_recap.js — пятничный разбор недели от Алисы
// ───────────────────────────────────────────────────────────────────
// Closes 4 gaps for Алиса:
//   ✓ Real orchestration → <tasks> блок → spawn next-week priorities
//   ✓ Persistent memory  → UPSERT summary (rolling) + facts.history
//   ✓ Cascading          → spawnTasks порождает следующую неделю
//   ✓ CRM awareness      → pipeline summary в prompt
// ═══════════════════════════════════════════════════════════════════

import { query, queryOne } from '../lib/db.js';
import { chat } from '../lib/anthropic.js';
import { sendDeliverable, sendDocument } from '../lib/tg.js';
import { getPipelineSummary, renderPipelineForPrompt } from '../lib/crm.js';
import { extractTasks, spawnTasks } from '../lib/orchestrator.js';
import { renderWeeklyRecapPdf } from '../lib/pdf.js';

const MAX_TOKENS = 900;
const DEFAULT_WINDOW_DAYS = 7;
const MAX_RECAP_HISTORY = 4;     // memory.facts.recap_history kept rolling
const SNIPPET_LEN = 200;

export async function handle(job) {
  const p = job.payload || {};
  const tgChatId = p.tg_chat_id;
  if (!tgChatId) {
    return { ok: false, error: 'payload.tg_chat_id is required' };
  }

  const agentId = p.agent_id || 'specialized-chief-of-staff';
  const agentName = p.agent_name || 'Алиса';
  const agentEmoji = p.agent_emoji || '🎯';
  const userName = p.user_name || 'друг';
  const userContext = p.user_context || '';
  const userId = job.user_id || null;
  const windowDays = Number(p.week_window_days || DEFAULT_WINDOW_DAYS);

  // ── Read prior memory (so Алиса references last weeks) ───────────
  let priorSummary = '';
  let priorFacts = {};
  if (userId) {
    const mem = await queryOne(
      'SELECT summary, facts FROM agent_memory WHERE user_id = $1 AND agent_id = $2',
      [userId, agentId],
    );
    if (mem) {
      priorSummary = mem.summary || '';
      priorFacts = mem.facts || {};
    }
  }

  // ── Aggregate week's deliverables ────────────────────────────────
  const stats = await aggregateWeek(userId, windowDays);

  // ── CRM grounding (Gap #4) ───────────────────────────────────────
  const pipeline = await getPipelineSummary({ ownerUserId: userId, staleDays: 5 });
  const pipelineLine = renderPipelineForPrompt(pipeline);

  // ── Memory section for prompt ────────────────────────────────────
  const memorySection = buildMemorySection(priorSummary, priorFacts);

  const statsSection = stats
    ? `\nЧто команда сделала за неделю (${windowDays} дней):
- Артефактов выпущено: ${stats.total}
- Помечено как использованное (WFDS): ${stats.used}
- По типам: ${stats.byKindLine}
${stats.snippets.length > 0 ? '\nПримеры из использованных артефактов:\n' + stats.snippets.map((s, i) => `  ${i + 1}. ${s}`).join('\n') : ''}
`
    : '\nЭто первая неделя клиента — реальной статистики ещё нет.\n';

  const system = `Ты — ${agentName} ${agentEmoji}, начальник AI-офиса.

Контекст клиента:
${userContext || 'эксперт, фаундер'}
${memorySection}
${statsSection}

ВОРОНКА КЛИЕНТА (CRM):
${pipelineLine}

Твоя задача — пятничный разбор недели в Telegram + распределение задач команде на следующую неделю.

ТЕЛО СООБЩЕНИЯ:
- Обращайся по имени (${userName}).
- Тон: спокойный, как старший коллега в конце недели.
- Структура (5-9 строк):
  1. Краткий итог недели с цифрами из stats и/или воронки.
  2. Один конкретный win (если есть данные) — сошлись на реальную сделку/артефакт по имени.
  3. Что планируем на следующую неделю (1 направление).
  4. Закрытие: один вопрос.
- НЕ повторяй формулировки из прошлых recap'ов (см. КОНТЕКСТ ИЗ ПАМЯТИ).
- Без markdown, макс 2 эмодзи.
- На русском.

ОРКЕСТРАЦИЯ (важно):
Если ты обещаешь что команда сделает X на следующей неделе — назначь это реальной задачей. После тела сообщения добавь блок:

<tasks>
[
  {
    "agent_id": "marketing-content-creator",
    "agent_name": "Аня",
    "agent_emoji": "✍️",
    "kind": "daily_briefing",
    "task_brief": "В понедельник: подготовь карусель про возражение «нет времени», ссылайся на запрос Светланы из вторника.",
    "delay_hours": 60
  }
]
</tasks>

Правила <tasks>:
- 0–3 задачи на следующую неделю.
- delay_hours: 24-168 (от 1 дня до 7 дней).
- Допустимые kind: только "daily_briefing".
- task_brief должен ссылаться на КОНКРЕТНУЮ вещь из этой недели (имя клиента, тема), не "сделай что-нибудь".
- Если не обещаешь конкретики — не добавляй блок.`;

  // ── Call Claude ──────────────────────────────────────────────────
  const result = await chat({
    system,
    messages: [{ role: 'user', content: `Сегодня пятница (${new Date().toISOString().slice(0, 10)}), 18:00. Напиши разбор недели для ${userName} и распланируй следующую.` }],
    maxTokens: MAX_TOKENS,
  });

  if (!result.ok) {
    return { ok: false, error: `claude: ${result.status} ${result.details?.slice(0, 200)}` };
  }

  // ── Orchestration ────────────────────────────────────────────────
  const { cleanText, tasks } = extractTasks(result.text);
  const spawn = await spawnTasks(job, tasks);

  const recapText = cleanText.slice(0, 2500);

  // ── Insert deliverable ───────────────────────────────────────────
  const deliverable = await queryOne(
    `INSERT INTO deliverables
       (user_id, job_id, agent_id, agent_name, kind, title, body, metadata)
     VALUES ($1, $2, $3, $4, 'weekly_recap', $5, $6, $7)
     RETURNING id`,
    [
      userId,
      job.id,
      agentId,
      agentName,
      `Разбор недели от ${agentName}`,
      recapText,
      JSON.stringify({
        tg_chat_id: tgChatId,
        claude_usage: result.usage || null,
        recap_payload: stats || null,
        pipeline_snapshot: pipeline ? { total: pipeline.total, weighted: pipeline.weighted } : null,
        window_days: windowDays,
        spawned_tasks: spawn.ids,
      }),
    ],
  );

  // ── Persistent memory (Gap #2) ───────────────────────────────────
  if (userId) {
    const newEntry = {
      date: new Date().toISOString().slice(0, 10),
      snippet: recapText.slice(0, SNIPPET_LEN),
      stats_total: stats?.total || 0,
      stats_used: stats?.used || 0,
      pipeline_weighted: pipeline?.weighted || 0,
      spawned: spawn.spawned,
    };
    const history = Array.isArray(priorFacts.recap_history)
      ? [newEntry, ...priorFacts.recap_history].slice(0, MAX_RECAP_HISTORY)
      : [newEntry];
    const newFacts = { ...priorFacts, recap_history: history };
    const newSummary = `Последний recap: ${newEntry.date}. WFDS неделя=${newEntry.stats_used}/${newEntry.stats_total}. Воронка взвешенная=${Math.round(newEntry.pipeline_weighted / 1000)}k₽. Запланировала ${spawn.spawned} задач команде.`;

    await query(
      `INSERT INTO agent_memory (user_id, agent_id, summary, facts, last_seen)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id, agent_id) DO UPDATE
         SET summary = EXCLUDED.summary,
             facts = EXCLUDED.facts,
             last_seen = NOW(),
             updated_at = NOW()`,
      [userId, agentId, newSummary, JSON.stringify(newFacts)],
    );
  }

  // ── Send TG ──────────────────────────────────────────────────────
  const tgPrefix = `<b>${escapeHtml(agentName)} ${escapeHtml(agentEmoji)}</b>\n<i>Разбор недели</i>\n\n`;
  const tgRes = await sendDeliverable(tgChatId, deliverable.id, tgPrefix + escapeHtml(recapText));

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

  // ── PDF artifact (Gap #6 — артефакт = не текст в чате) ───────────
  let pdfMsgId = null;
  try {
    const now = new Date();
    const fromDate = new Date(now.getTime() - windowDays * 86400000);
    const weekRange = `${fromDate.toISOString().slice(0, 10)} — ${now.toISOString().slice(0, 10)}`;
    const pdfBuffer = await renderWeeklyRecapPdf({
      userName,
      recap: recapText,
      deliveredCount: stats?.total || 0,
      usedCount: stats?.used || 0,
      weekRange,
    });
    const pdfRes = await sendDocument(tgChatId, pdfBuffer, {
      filename: `weekly-recap-${now.toISOString().slice(0, 10)}.pdf`,
      mimeType: 'application/pdf',
      caption: `<b>${escapeHtml(agentName)} ${escapeHtml(agentEmoji)}</b>\nРазбор недели в PDF — можно переслать партнёру или сохранить.`,
      replyMarkup: {
        inline_keyboard: [[
          { text: '✅ Использовал', callback_data: `d:used:${deliverable.id}` },
          { text: '❌ Не пригодилось', callback_data: `d:nope:${deliverable.id}` },
        ]],
      },
    });
    pdfMsgId = pdfRes?.result?.message_id || null;
    if (pdfMsgId) {
      await query(
        `UPDATE deliverables
            SET metadata = metadata || jsonb_build_object('pdf_tg_message_id', $1::int)
          WHERE id = $2`,
        [pdfMsgId, deliverable.id],
      );
    }
  } catch (e) {
    // PDF — bonus, не валим всю доставку recap'a
    await query(
      `UPDATE deliverables
          SET metadata = metadata || jsonb_build_object('pdf_error', $1::text)
        WHERE id = $2`,
      [String(e.message || e).slice(0, 200), deliverable.id],
    );
  }

  return {
    ok: true,
    deliverable_id: deliverable.id,
    tg_message_id: tgMsgId,
    pdf_tg_message_id: pdfMsgId,
    usage: result.usage,
    stats: stats ? { total: stats.total, used: stats.used } : null,
    spawned_tasks: spawn.spawned,
  };
}

function buildMemorySection(summary, facts) {
  const lines = [];
  if (summary) lines.push(`Контекст из памяти Алисы: ${summary}`);
  if (facts && Array.isArray(facts.recap_history) && facts.recap_history.length > 0) {
    lines.push('Прошлые твои пятничные recap-сообщения (свежие сверху, НЕ повторяйся):');
    for (const h of facts.recap_history.slice(0, MAX_RECAP_HISTORY)) {
      lines.push(`  • ${h.date} (WFDS ${h.stats_used}/${h.stats_total}): ${h.snippet}`);
    }
  }
  if (lines.length === 0) return '';
  return '\n\nКОНТЕКСТ ИЗ ПАМЯТИ:\n' + lines.join('\n') + '\n';
}

async function aggregateWeek(userId, windowDays) {
  if (!userId) return null;
  const rows = await query(
    `SELECT kind, count(*) AS n, count(*) FILTER (WHERE used_at IS NOT NULL) AS used
       FROM deliverables
      WHERE user_id = $1
        AND delivered_at >= NOW() - ($2 || ' days')::interval
      GROUP BY kind`,
    [userId, String(windowDays)],
  );
  const total = rows.reduce((s, r) => s + Number(r.n), 0);
  const used = rows.reduce((s, r) => s + Number(r.used), 0);
  if (total === 0) return null;

  const byKindLine = rows.map((r) => `${r.kind} ×${r.n}`).join(', ');

  const samples = await query(
    `SELECT left(body, 160) AS snippet
       FROM deliverables
      WHERE user_id = $1
        AND delivered_at >= NOW() - ($2 || ' days')::interval
        AND used_at IS NOT NULL
      ORDER BY used_at DESC
      LIMIT 3`,
    [userId, String(windowDays)],
  );

  return { total, used, byKindLine, snippets: samples.map((s) => s.snippet) };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
