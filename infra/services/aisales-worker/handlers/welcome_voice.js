// ═══════════════════════════════════════════════════════════════════
// handlers/welcome_voice.js — Day-0 +23min "момент истины"
// ───────────────────────────────────────────────────────────────────
// Шлёт voice-message от Ани: короткий Reels-сценарий на тему из
// анкеты клиента, озвученный (MVP: дефолтный ru-голос; будущее:
// клон голоса клиента из онбординг-сэмпла).
//
// Spawned by welcome_sequence.js immediately after the text greeting,
// scheduled +WELCOME_VOICE_DELAY_MINUTES (default 23).
// ═══════════════════════════════════════════════════════════════════

import { query, queryOne } from '../lib/db.js';
import { chat } from '../lib/anthropic.js';
import { renderVoice, sendVoice, isVoiceConfigured } from '../lib/voice.js';
import { sendText } from '../lib/tg.js';

const MAX_TOKENS = 350;

export async function handle(job) {
  const p = job.payload || {};
  const tgChatId = p.tg_chat_id;
  if (!tgChatId) return { ok: false, error: 'payload.tg_chat_id is required' };

  const userName = p.user_name || 'друг';
  const userContext = p.user_context || '';
  const userId = job.user_id || null;
  const agentName = p.agent_name || 'Аня';
  const agentEmoji = p.agent_emoji || '✍️';
  const agentId = p.agent_id || 'marketing-content-creator';

  // ── 1. Сгенерировать сценарий (Claude) ───────────────────────────
  const system = `Ты — ${agentName}, контент-агент офиса. Тон тёплый, разговорный, без маркетинговых клише.

Клиент: ${userName}. Контекст из анкеты: ${userContext || 'эксперт, продаёт через IG/TG'}.

Напиши ОДИН короткий Reels-сценарий (45-60 секунд чтения вслух). Условия:
- На русском, от первого лица (как будто это говорит сам ${userName}).
- 4-6 коротких предложений, разговорно, без markdown.
- Тема — из контекста анкеты (если ничего конкретного — возьми боль "контент-марафон выгорает" и поверни в инсайт).
- Не упоминай ИИ, агентов, офис.
- Только сам сценарий, без преамбулы и без подписи. Чисто текст, который будет озвучен.`;

  const result = await chat({
    system,
    messages: [{ role: 'user', content: `Дай сценарий, пожалуйста.` }],
    maxTokens: MAX_TOKENS,
  });
  if (!result.ok) {
    return { ok: false, error: `claude: ${result.status} ${result.details?.slice(0, 200)}` };
  }
  const script = result.text.trim().slice(0, 1500);

  // ── 2a. Проверить персональный voice_id (онбординг-клон) ─────────
  let userVoiceId = null;
  let isCustomVoice = false;
  if (userId) {
    const u = await queryOne('SELECT voice_id FROM platform_users WHERE id = $1', [userId]);
    if (u?.voice_id) {
      userVoiceId = u.voice_id;
      isCustomVoice = true;
    }
  }

  // ── 2b. Записать deliverable до отправки (для WFDS-tick) ──────────
  const deliverable = await queryOne(
    `INSERT INTO deliverables
       (user_id, job_id, agent_id, agent_name, kind, title, body, metadata)
     VALUES ($1, $2, $3, $4, 'voice_reel', $5, $6, $7)
     RETURNING id`,
    [
      userId,
      job.id,
      agentId,
      agentName,
      `Первый Reels-сценарий — ${agentName}`,
      script,
      JSON.stringify({
        tg_chat_id: tgChatId,
        claude_usage: result.usage || null,
        voice_configured: isVoiceConfigured(),
        custom_voice: isCustomVoice,
        voice_id_used: userVoiceId,
      }),
    ],
  );

  // ── 3. Рендер голоса (или текстовый fallback) ────────────────────
  if (!isVoiceConfigured()) {
    // Graceful fallback: шлём как обычный текст с примечанием.
    await sendText(
      tgChatId,
      `<b>${escapeHtml(agentName)} ${escapeHtml(agentEmoji)}</b>\n` +
        `<i>Подготовила Reels-сценарий (~45 сек). Голос подключим в следующем релизе.</i>\n\n` +
        escapeHtml(script),
    );
    return {
      ok: true,
      deliverable_id: deliverable.id,
      voice_sent: false,
      reason: 'voice_not_configured',
    };
  }

  const voice = await renderVoice(script, userVoiceId || undefined);
  if (!voice.ok) {
    // Голос не получился — шлём текст + лог.
    await sendText(
      tgChatId,
      `<b>${escapeHtml(agentName)} ${escapeHtml(agentEmoji)}</b>\n\n${escapeHtml(script)}`,
    );
    return { ok: true, deliverable_id: deliverable.id, voice_sent: false, reason: voice.error };
  }

  // ── 4. Telegram sendVoice с inline-кнопками "Опубликовать" ───────
  const caption = isCustomVoice
    ? `<b>${escapeHtml(agentName)} ${escapeHtml(agentEmoji)}</b>\nReels-сценарий, ~50 сек. <b>Озвучено твоим голосом</b> — можно публиковать.`
    : `<b>${escapeHtml(agentName)} ${escapeHtml(agentEmoji)}</b>\nReels-сценарий, ~50 сек. Озвучка пока тестовая — запиши свой голос в анкете и я перепишу.`;

  const tgRes = await sendVoice(tgChatId, voice.buffer, {
    caption,
    replyMarkup: {
      inline_keyboard: [
        [
          { text: '✅ Использовал', callback_data: `d:used:${deliverable.id}` },
          { text: '❌ Не пригодилось', callback_data: `d:nope:${deliverable.id}` },
        ],
      ],
    },
  });
  if (!tgRes.ok) {
    return { ok: false, error: `tg sendVoice: ${tgRes.status || ''} ${tgRes.error?.slice(0, 200)}` };
  }

  const tgMsgId = tgRes.result?.message_id;
  if (tgMsgId) {
    await query(
      `UPDATE deliverables
          SET metadata = metadata || jsonb_build_object('tg_message_id', $1::int, 'voice_sent', true)
        WHERE id = $2`,
      [tgMsgId, deliverable.id],
    );
  }

  return { ok: true, deliverable_id: deliverable.id, voice_sent: true, tg_message_id: tgMsgId };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
