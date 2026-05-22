// ═══════════════════════════════════════════════════════════════════
// lib/tg-relay.js — Subscriber Relay Flow (Phase 5 · Commit 4)
// ───────────────────────────────────────────────────────────────────
// Подписчик пишет боту → owner получает уведомление с inline-кнопками →
// AI-draft (Claude) → озвучка (ElevenLabs) → owner аппрувит → бот
// пересылает voice-note подписчику.
//
// Используется из lib/tg-voice-bot.js:
//   · handleSubscriberInbound(env, msg)  ← вызывается для chat НЕ owner'а
//   · handleRelayCallback(env, cq)       ← для callback_data вида "r:*"
// ═══════════════════════════════════════════════════════════════════

import { query, queryOne } from './db.js';
import { chat, isAnthropicConfigured } from './anthropic.js';
import { generateVoiceNote } from './voice-pipeline.js';
import { markGenerationSent } from './generations.js';

const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
const TG_TOKEN = process.env.TG_VOICE_BOT_TOKEN;
const MAX_INBOUND_LEN = 2000;
const MAX_DRAFT_TOKENS = 320;

// ═══ Subscriber → owner ════════════════════════════════════════════

/**
 * Вызывается когда в бот пришло сообщение от человека, не зарегистрированного
 * как owner (нет в voice_bot_users). Считаем что это subscriber.
 */
export async function handleSubscriberInbound(msg) {
  const subscriberChatId = msg.chat.id;
  const text = (msg.text || '').trim();
  if (!text) {
    return tgSendText(TG_TOKEN, subscriberChatId, '🤖 Понимаю только текст.');
  }
  if (text.length > MAX_INBOUND_LEN) {
    return tgSendText(TG_TOKEN, subscriberChatId,
      `⚠ Слишком длинное сообщение (макс. ${MAX_INBOUND_LEN} символов).`);
  }

  // Определяем кому пересылать. v1: единственный (или первый) bound owner.
  const ownerEnv = (process.env.TG_VOICE_BOT_OWNER || '').trim();
  let ownerRow = null;
  if (ownerEnv) {
    ownerRow = await queryOne(
      'select * from voice_bot_users where owner_handle = $1 order by last_active_at desc limit 1',
      [ownerEnv.startsWith('@') ? ownerEnv : '@' + ownerEnv],
    );
  }
  if (!ownerRow) {
    // Fallback — берём первого зарегистрированного.
    ownerRow = await queryOne(
      'select * from voice_bot_users order by last_active_at desc limit 1',
      [],
    );
  }
  if (!ownerRow) {
    return tgSendText(TG_TOKEN, subscriberChatId,
      '🤖 Бот ещё не настроен на стороне получателя. Попробуй позже.');
  }

  // Сохраняем inbound
  const inbound = await queryOne(
    `insert into voice_relay_inbound
       (owner_handle, subscriber_chat_id, subscriber_user_id,
        subscriber_username, subscriber_message_id, inbound_text, status)
     values ($1, $2, $3, $4, $5, $6, 'pending')
     returning *`,
    [
      ownerRow.owner_handle,
      subscriberChatId,
      msg.from?.id || null,
      msg.from?.username || null,
      msg.message_id || null,
      text,
    ],
  );

  // Шлём бабл owner'у
  const approval = await tgSendApproval(TG_TOKEN, ownerRow.tg_chat_id, inbound, 'pending');
  if (approval?.message_id) {
    await query(
      'update voice_relay_inbound set approval_message_id = $1 where id = $2',
      [approval.message_id, inbound.id],
    );
  }

  // Подтверждаем подписчику
  await tgSendText(TG_TOKEN, subscriberChatId,
    '✓ Сообщение принято. Ответ придёт сюда после рассмотрения.');
}

// ═══ Callback queries (r:*) ═══════════════════════════════════════

/**
 * Возвращает true если запрос обработан здесь (data начинается с "r:"),
 * иначе false — пускай разбирается основной webhook.
 */
export async function handleRelayCallback(cq) {
  const data = cq.data || '';
  if (!data.startsWith('r:')) return false;

  const [, action, inboundId] = data.split(':');
  if (!inboundId) {
    await tgAnswerCallback(TG_TOKEN, cq.id, '⚠ Не понял');
    return true;
  }

  const inbound = await queryOne(
    'select * from voice_relay_inbound where id = $1',
    [inboundId],
  );
  if (!inbound) {
    await tgAnswerCallback(TG_TOKEN, cq.id, 'Запрос не найден');
    return true;
  }

  switch (action) {
    case 'd': // draft via AI
      await cbDraft(cq, inbound);
      break;
    case 'v': // voice
      await cbVoice(cq, inbound);
      break;
    case 's': // send to subscriber
      await cbSend(cq, inbound);
      break;
    case 'x': // cancel/reject
      await cbReject(cq, inbound);
      break;
    case 'i': // ignore (skip)
      await cbIgnore(cq, inbound);
      break;
    default:
      await tgAnswerCallback(TG_TOKEN, cq.id, 'Неизвестное действие');
  }
  return true;
}

async function cbDraft(cq, inbound) {
  await tgAnswerCallback(TG_TOKEN, cq.id, '🧠 Генерирую ответ…');

  if (!isAnthropicConfigured()) {
    await editApproval(inbound, {
      draftError: 'ANTHROPIC_API_KEY не задан — настройте в .env',
      state: 'pending',
    });
    return;
  }

  const subscriberHandle = inbound.subscriber_username
    ? '@' + inbound.subscriber_username
    : `id:${inbound.subscriber_chat_id}`;

  const system = `Ты отвечаешь от лица человека ${inbound.owner_handle} на сообщение от подписчика ${subscriberHandle}.

Правила:
- Отвечай как живой человек — кратко, тепло, по делу.
- Сохраняй разговорный тон, без официоза.
- Не повторяй вопрос подписчика.
- Не подписывайся именем и не используй «Здравствуйте» — это голосовое сообщение.
- 1-3 коротких предложения. Максимум ~280 символов.
- Без emoji, без markdown.
- Русский язык.`;

  const result = await chat({
    system,
    messages: [{ role: 'user', content: inbound.inbound_text }],
    maxTokens: MAX_DRAFT_TOKENS,
  });

  if (!result.ok) {
    await editApproval(inbound, {
      draftError: `Claude отказал: ${result.details?.slice(0, 200)}`,
      state: 'pending',
    });
    return;
  }

  const draft = result.text.slice(0, 1500);
  await query(
    `update voice_relay_inbound
        set draft_text = $1, status = 'drafted'
      where id = $2`,
    [draft, inbound.id],
  );

  await editApproval({ ...inbound, draft_text: draft }, { state: 'drafted' });
}

async function cbVoice(cq, inbound) {
  if (!inbound.draft_text) {
    await tgAnswerCallback(TG_TOKEN, cq.id, 'Сначала AI-draft');
    return;
  }
  await tgAnswerCallback(TG_TOKEN, cq.id, '🎙 Озвучиваю…');

  // Покажем "recording voice" в чате owner'а
  const ownerUser = await queryOne(
    'select tg_chat_id from voice_bot_users where owner_handle = $1 order by last_active_at desc limit 1',
    [inbound.owner_handle],
  );
  if (ownerUser?.tg_chat_id) {
    await tgChatAction(TG_TOKEN, ownerUser.tg_chat_id, 'record_voice');
  }

  const gen = await generateVoiceNote({
    text: inbound.draft_text,
    owner_handle: inbound.owner_handle,
    source: 'tg-relay',
    meta: { inbound_id: inbound.id, subscriber_chat_id: inbound.subscriber_chat_id },
  });

  if (!gen.ok) {
    await editApproval(inbound, {
      voiceError: `${gen.code}: ${gen.details?.slice(0, 150) || ''}`,
      state: 'drafted',
    });
    return;
  }

  await query(
    `update voice_relay_inbound
        set voice_generation_id = $1, status = 'voice_ready'
      where id = $2`,
    [gen.generationId, inbound.id],
  );

  // Preview voice owner'у
  if (ownerUser?.tg_chat_id) {
    await tgSendVoice(TG_TOKEN, ownerUser.tg_chat_id, gen.audioUrl, '🔊 Preview');
  }

  await editApproval(env, {
    ...inbound,
    draft_text: inbound.draft_text,
    voice_generation_id: gen.generationId,
  }, {
    state: 'voice_ready',
    audioUrl: gen.audioUrl,
  });
}

async function cbSend(cq, inbound) {
  if (inbound.status === 'sent') {
    await tgAnswerCallback(TG_TOKEN, cq.id, 'Уже отправлено');
    return;
  }
  if (!inbound.voice_generation_id) {
    await tgAnswerCallback(TG_TOKEN, cq.id, 'Сначала озвучь');
    return;
  }

  const voiceGen = await queryOne(
    'select * from voice_generations where id = $1',
    [inbound.voice_generation_id],
  );
  if (!voiceGen?.audio_url) {
    await tgAnswerCallback(TG_TOKEN, cq.id, 'Voice не найден');
    return;
  }

  await tgAnswerCallback(TG_TOKEN, cq.id, '📤 Отправляю…');

  const sendRes = await tgSendVoice(
    TG_TOKEN,
    inbound.subscriber_chat_id,
    voiceGen.audio_url,
    null,
    { reply_to_message_id: inbound.subscriber_message_id },
  );

  if (!sendRes.ok) {
    // Fallback to sendAudio
    const fb = await tgSendAudio(TG_TOKEN, inbound.subscriber_chat_id, voiceGen.audio_url);
    if (!fb.ok) {
      await editApproval(inbound, {
        sendError: 'Telegram отказался принимать audio',
        state: 'voice_ready',
      });
      return;
    }
  }

  await query(
    `update voice_relay_inbound set status = 'sent' where id = $1`,
    [inbound.id],
  );
  await markGenerationSent(inbound.voice_generation_id, {
    tg_chat_id: null,
    tg_message_id: null,
    recipient_chat_id: inbound.subscriber_chat_id,
  });

  await editApproval(inbound, { state: 'sent' });
}

async function cbReject(cq, inbound) {
  await tgAnswerCallback(TG_TOKEN, cq.id, '🗑 Отменено');
  await query(
    `update voice_relay_inbound set status = 'rejected' where id = $1`,
    [inbound.id],
  );
  await editApproval(inbound, { state: 'rejected' });
}

async function cbIgnore(cq, inbound) {
  await tgAnswerCallback(TG_TOKEN, cq.id, '🔇 Пропущено');
  await query(
    `update voice_relay_inbound set status = 'ignored' where id = $1`,
    [inbound.id],
  );
  await editApproval(inbound, { state: 'ignored' });
}

// ═══ Approval bubble rendering ═════════════════════════════════════

async function tgSendApproval(token, ownerChatId, inbound, state) {
  const text = renderApproval(inbound, { state });
  const kb = approvalKeyboard(inbound, state);
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: ownerChatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: kb },
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.result;
}

async function editApproval(inbound, opts = {}) {
  if (!inbound.approval_message_id) return;
  const ownerUser = await queryOne(
    'select tg_chat_id from voice_bot_users where owner_handle = $1 order by last_active_at desc limit 1',
    [inbound.owner_handle],
  );
  if (!ownerUser) return;

  const text = renderApproval(inbound, opts);
  const kb = approvalKeyboard(inbound, opts.state);

  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: ownerUser.tg_chat_id,
      message_id: inbound.approval_message_id,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: kb.length ? { inline_keyboard: kb } : { inline_keyboard: [] },
    }),
  });
}

function renderApproval(inbound, opts = {}) {
  const subHandle = inbound.subscriber_username
    ? '@' + inbound.subscriber_username
    : `id ${inbound.subscriber_chat_id}`;
  const lines = [
    `📩 <b>Входящее</b> от <b>${escapeHtml(subHandle)}</b>:`,
    '',
    `<i>${escapeHtml(truncate(inbound.inbound_text, 500))}</i>`,
  ];
  if (inbound.draft_text) {
    lines.push('', '💬 <b>Draft:</b>', escapeHtml(truncate(inbound.draft_text, 700)));
  }
  if (opts.audioUrl) {
    lines.push('', '🎧 Voice сгенерирован (preview выше).');
  }
  if (opts.draftError) {
    lines.push('', `⚠ ${escapeHtml(opts.draftError)}`);
  }
  if (opts.voiceError) {
    lines.push('', `⚠ ${escapeHtml(opts.voiceError)}`);
  }
  if (opts.sendError) {
    lines.push('', `⚠ ${escapeHtml(opts.sendError)}`);
  }
  if (opts.state === 'sent') {
    lines.push('', '✅ <b>Отправлено</b>');
  } else if (opts.state === 'rejected') {
    lines.push('', '🗑 Отклонено');
  } else if (opts.state === 'ignored') {
    lines.push('', '🔇 Пропущено');
  }
  return lines.join('\n');
}

function approvalKeyboard(inbound, state) {
  const id = inbound.id;
  if (state === 'sent' || state === 'rejected' || state === 'ignored') return [];

  if (state === 'voice_ready') {
    return [
      [
        { text: '✅ Отправить', callback_data: `r:s:${id}` },
        { text: '🔄 Заново озвучить', callback_data: `r:v:${id}` },
      ],
      [{ text: '🗑 Отменить', callback_data: `r:x:${id}` }],
    ];
  }
  if (state === 'drafted') {
    return [
      [
        { text: '🎧 Озвучить', callback_data: `r:v:${id}` },
        { text: '♻️ Другой вариант', callback_data: `r:d:${id}` },
      ],
      [{ text: '🗑 Отменить', callback_data: `r:x:${id}` }],
    ];
  }
  // pending (default)
  return [
    [
      { text: '🤖 AI-ответ', callback_data: `r:d:${id}` },
      { text: '🔇 Пропустить', callback_data: `r:i:${id}` },
    ],
    [{ text: '🗑 Отменить', callback_data: `r:x:${id}` }],
  ];
}

// ═══ Telegram primitives ═══════════════════════════════════════════

async function tgSendText(token, chatId, text, extra = {}) {
  return tgApi(token, 'sendMessage', {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...extra,
  });
}

async function tgSendVoice(token, chatId, audioUrl, caption, extra = {}) {
  return tgApi(token, 'sendVoice', {
    chat_id: chatId,
    voice: audioUrl,
    caption: caption || undefined,
    ...extra,
  });
}

async function tgSendAudio(token, chatId, audioUrl) {
  return tgApi(token, 'sendAudio', { chat_id: chatId, audio: audioUrl });
}

async function tgChatAction(token, chatId, action) {
  return tgApi(token, 'sendChatAction', { chat_id: chatId, action });
}

async function tgAnswerCallback(token, cqId, text) {
  return tgApi(token, 'answerCallbackQuery', { callback_query_id: cqId, text });
}

async function tgApi(token, method, payload) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false, status: res.status };
    return await res.json();
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ═══ Helpers ═══════════════════════════════════════════════════════

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function truncate(s, n) {
  s = String(s);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
