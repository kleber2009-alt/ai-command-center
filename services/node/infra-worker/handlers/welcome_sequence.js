// ═══════════════════════════════════════════════════════════════════
// handlers/welcome_sequence.js — Day-0 "офис собран" момент
// ───────────────────────────────────────────────────────────────────
// Алиса (orchestrator) встречает клиента, представляет команду и —
// если уместно — реально планирует первые задания агентам через
// <tasks>...</tasks> блок (см. lib/orchestrator.js).
//
// Closes 4 gaps for Алиса:
//   ✓ Real orchestration  → <tasks> блок → spawnTasks()
//   ✓ Persistent memory   → UPSERT agent_memory.summary + facts
//   ✓ Cascading           → spawnTasks может породить daily_briefing
//   ✓ CRM awareness       → getPipelineSummary() инжектится в prompt
// ═══════════════════════════════════════════════════════════════════

import { query, queryOne } from '../lib/db.js';
import { chat } from '../lib/anthropic.js';
import { sendDeliverable } from '../lib/tg.js';
import { getPipelineSummary, renderPipelineForPrompt } from '../lib/crm.js';
import { extractTasks, spawnTasks } from '../lib/orchestrator.js';

const MAX_TOKENS = 900;
const DEFAULT_TEAM = ['Аня', 'Игорь', 'Лена', 'Лёша', 'Софья', 'Артём', 'Маша', 'Олег', 'Даша', 'Тимур'];

export async function handle(job) {
  const p = job.payload || {};
  const tgChatId = p.tg_chat_id;
  if (!tgChatId) {
    return { ok: false, error: 'payload.tg_chat_id is required' };
  }

  const userName = p.user_name || 'друг';
  const userContext = p.user_context || '';
  const userId = job.user_id || null;
  const lead = p.office_lead || { id: 'specialized-chief-of-staff', name: 'Алиса', emoji: '🎯' };
  const teammates = Array.isArray(p.teammates) && p.teammates.length > 0 ? p.teammates : DEFAULT_TEAM;
  const teamList = teammates.slice(0, 10).join(', ');

  // ── Consume pending voice clone if any (онбординг → платёж bridge) ─
  if (userId) {
    const pending = await queryOne(
      `SELECT id, voice_id FROM pending_voice_clones
        WHERE consumed_at IS NULL
          AND tg_chat_id = $1
        ORDER BY created_at DESC LIMIT 1`,
      [tgChatId],
    );
    if (pending?.voice_id) {
      await query(
        `UPDATE platform_users SET voice_id = COALESCE(voice_id, $1) WHERE id = $2`,
        [pending.voice_id, userId],
      );
      await query(
        `UPDATE pending_voice_clones SET consumed_at = NOW() WHERE id = $1`,
        [pending.id],
      );
    }
  }

  // ── CRM grounding (Gap #4) ───────────────────────────────────────
  const pipeline = await getPipelineSummary({ ownerUserId: userId, staleDays: 5 });
  const pipelineLine = renderPipelineForPrompt(pipeline);

  // ── System prompt ────────────────────────────────────────────────
  const system = `Ты — ${lead.name} ${lead.emoji}, начальник AI-офиса (orchestrator).

Клиент только что подключился (несколько минут назад). Команда из 10 человек:
${teamList}.

Контекст клиента из его анкеты:
${userContext || 'эксперт, продаёт через IG/TG'}

ВОРОНКА КЛИЕНТА (CRM):
${pipelineLine}

Твоя задача — написать ПЕРВОЕ приветственное сообщение клиенту в Telegram + (опционально) распределить первые задачи команде.

ТЕЛО СООБЩЕНИЯ:
- Обращайся по имени (${userName}).
- Скажи "офис собран", представь команду одной строкой.
- Сошлись на 2-3 КОНКРЕТНЫХ факта из анкеты ИЛИ из воронки CRM (имя горячего лида, узкое место). Это критично — клиент должен почувствовать что вы видите его реальную ситуацию, не template.
- Опиши что команда уже сделала или делает прямо сейчас (1-2 артефакта).
- Закрой одним вопросом или CTA (нравится — поставь ✅).
- Тон: спокойный, тёплый, уверенный. Не маркетинговый, без "уникальный/революционный".
- 6-9 строк, без markdown, макс 2 эмодзи на всё сообщение.
- На русском.
- Не упоминай что ты ИИ.

ОРКЕСТРАЦИЯ (опционально, но важно):
Если в твоём приветствии ты обещаешь конкретное действие от агента (например «Аня готовит Reels к завтрашнему утру про X» или «Игорь свяжется с лидом Y сегодня»), то ОБЯЗАТЕЛЬНО после тела сообщения добавь строго такой блок:

<tasks>
[
  {
    "agent_id": "marketing-content-creator",
    "agent_name": "Аня",
    "agent_emoji": "✍️",
    "kind": "daily_briefing",
    "task_brief": "Конкретная инструкция Ане одним предложением, что именно она делает и почему.",
    "delay_hours": 18
  }
]
</tasks>

Правила <tasks>:
- 0–3 задачи (максимум). Не спам.
- delay_hours: 1-24. По умолчанию 18 (значит «к следующему утру»).
- Допустимые kind: только "daily_briefing". Для других каденций не назначай.
- Если ничего конкретного не обещаешь — не добавляй <tasks> блок вообще.
- task_brief должен быть конкретным, не "сделай что-нибудь".`;

  // ── Call Claude ──────────────────────────────────────────────────
  const result = await chat({
    system,
    messages: [{ role: 'user', content: `Только что подключился клиент. Напиши первое приветственное сообщение и распланируй первые задачи если уместно.` }],
    maxTokens: MAX_TOKENS,
  });

  if (!result.ok) {
    return { ok: false, error: `claude: ${result.status} ${result.details?.slice(0, 200)}` };
  }

  // ── Orchestration: extract & spawn tasks ─────────────────────────
  const { cleanText, tasks } = extractTasks(result.text);
  const spawn = await spawnTasks(job, tasks);

  const welcomeText = cleanText.slice(0, 2000);

  // ── Insert deliverable ───────────────────────────────────────────
  const deliverable = await queryOne(
    `INSERT INTO deliverables
       (user_id, job_id, agent_id, agent_name, kind, title, body, metadata)
     VALUES ($1, $2, $3, $4, 'welcome', $5, $6, $7)
     RETURNING id`,
    [
      userId,
      job.id,
      lead.id || 'specialized-chief-of-staff',
      lead.name,
      `Офис собран — ${lead.name}`,
      welcomeText,
      JSON.stringify({
        tg_chat_id: tgChatId,
        claude_usage: result.usage || null,
        teammates,
        spawned_tasks: spawn.ids,
      }),
    ],
  );

  // ── Persistent memory for Алиса (Gap #2) ─────────────────────────
  if (userId) {
    const newSummary = `Клиент подключился ${new Date().toISOString().slice(0, 10)}. Представила команду из ${teammates.length} человек. ${tasks.length > 0 ? `Поставила ${tasks.length} стартовых задач команде.` : 'Стартовых задач не назначила.'}`;
    await query(
      `INSERT INTO agent_memory (user_id, agent_id, summary, facts, last_seen)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id, agent_id) DO UPDATE
         SET summary = EXCLUDED.summary,
             facts = agent_memory.facts || EXCLUDED.facts,
             last_seen = NOW(),
             updated_at = NOW()`,
      [
        userId,
        lead.id || 'specialized-chief-of-staff',
        newSummary,
        JSON.stringify({
          welcome_sent: new Date().toISOString(),
          teammates,
          initial_tasks: tasks.length,
          pipeline_snapshot: pipeline ? { total: pipeline.total, open: pipeline.open, weighted: pipeline.weighted } : null,
        }),
      ],
    );
  }

  // ── Send to TG ───────────────────────────────────────────────────
  const tgPrefix = `<b>${escapeHtml(lead.name)} ${escapeHtml(lead.emoji)}</b>\n<i>Начальник твоего офиса</i>\n\n`;
  const tgRes = await sendDeliverable(tgChatId, deliverable.id, tgPrefix + escapeHtml(welcomeText));

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

  // ── Day-0 +23 мин "момент истины" — voice от Ани ─────────────────
  const voiceDelayMin = Number(process.env.WELCOME_VOICE_DELAY_MINUTES ?? 23);
  const voiceJob = await queryOne(
    `INSERT INTO scheduled_jobs (kind, user_id, scheduled_at, status, payload)
     VALUES ('welcome_voice', $1, NOW() + ($2 || ' minutes')::interval, 'pending', $3)
     RETURNING id`,
    [
      userId,
      String(voiceDelayMin),
      JSON.stringify({
        tg_chat_id: tgChatId,
        user_name: userName,
        user_context: userContext,
        agent_id: 'marketing-content-creator',
        agent_name: 'Аня',
        agent_emoji: '✍️',
        spawned_by: { job_id: job.id, agent_name: lead.name },
      }),
    ],
  );

  return {
    ok: true,
    deliverable_id: deliverable.id,
    tg_message_id: tgMsgId,
    usage: result.usage,
    spawned_tasks: spawn.spawned,
    welcome_voice_job_id: voiceJob.id,
    welcome_voice_in_min: voiceDelayMin,
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
