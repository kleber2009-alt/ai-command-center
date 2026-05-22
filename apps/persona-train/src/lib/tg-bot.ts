// ═══════════════════════════════════════════════════════════════════
// lib/tg-bot.ts — @ilia_pali0_bot handler
// ───────────────────────────────────────────────────────────────────
// Owner-only single-tenant bot. The owner is `OWNER_HANDLE` env var.
// Any tg_user whose username matches OWNER_HANDLE (or whose chat is
// pre-bound) is treated as owner and gets full training/generation
// access. Everyone else gets a polite "this is a private bot".
//
// Commands:
//   /start           — welcome + status
//   /help            — list commands
//   /voice           — show current active voice for owner
//   /train           — pack pending voice_samples → ElevenLabs re-clone
//   /samples         — list pending sample count + total seconds
//   /reset_samples   — drop pending samples
//   /analyze         — analyze recent voice notes (transcribe + Claude)
//                      [note: transcription is wired via the api-v2
//                       Whisper pipeline; placeholder in v0]
//   /avatar          — train avatar from accumulated кружков
//
// Default inbound behavior:
//   - voice / video / audio  → store as voice_sample, ack with pending
//                              count + auto-train hint
//   - video_note (кружок)    → store as avatar_sample
//   - text                   → TTS through current voice, reply with
//                              voice-note
// ═══════════════════════════════════════════════════════════════════

import { query, queryOne, normalizeOwnerHandle } from './db';
import { generateVoiceNote } from './voice-pipeline';
import { storeVoiceSample, storeVideoSample } from './storage';

const TG_TOKEN = process.env.TG_BOT_TOKEN;
const TG_API = 'https://api.telegram.org';
const OWNER_HANDLE = normalizeOwnerHandle(process.env.OWNER_HANDLE || '@ilia_pali0');
const OWNER_TG_ID = process.env.OWNER_TELEGRAM_ID
  ? Number(process.env.OWNER_TELEGRAM_ID)
  : null;
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
const AUTO_RETRAIN_SECONDS = Number(process.env.AUTO_RETRAIN_SECONDS || 180);
const MAX_TEXT_LEN = 1500;
const ACK_DEBOUNCE_MS = Number(process.env.TG_ACK_DEBOUNCE_MS || 2000);

// ─── Persistent reply keyboard ─────────────────────────────────────-
// Labels here are treated as slash-command aliases inside handleMessage.
const MAIN_KEYBOARD = {
  keyboard: [
    [{ text: '🎙 Голос' }, { text: '📊 Samples' }],
    [{ text: '🔁 Обучить голос' }, { text: '⭕ Обучить аватар' }],
    [{ text: '🔬 Анализ' }, { text: '✂ Сбросить' }],
    [{ text: 'ℹ️ Помощь' }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

const BUTTON_TO_COMMAND: Record<string, string> = {
  '🎙 Голос': '/voice',
  '📊 Samples': '/samples',
  '🔁 Обучить голос': '/train',
  '⭕ Обучить аватар': '/avatar',
  '🔬 Анализ': '/analyze',
  '✂ Сбросить': '/reset_samples',
  'ℹ️ Помощь': '/help',
};

export function isConfigured(): boolean {
  return Boolean(TG_TOKEN);
}

// ─── Public entry ──────────────────────────────────────────────────-
export async function handleUpdate(update: Record<string, unknown>): Promise<void> {
  void lazyInitCommands();

  if ((update as { message?: unknown }).message) {
    await handleMessage(
      (update as { message: TgMessage }).message,
    );
    return;
  }
  if ((update as { callback_query?: unknown }).callback_query) {
    await answerCallback(
      (update as { callback_query: { id: string } }).callback_query.id,
    );
  }
}

// Fire-once registration of the slash-command menu shown in the TG UI.
let commandsInitPromise: Promise<void> | null = null;
function lazyInitCommands(): Promise<void> {
  if (commandsInitPromise) return commandsInitPromise;
  commandsInitPromise = (async () => {
    await tgApi('setMyCommands', {
      commands: [
        { command: 'voice', description: 'Активный голос' },
        { command: 'samples', description: 'Накопленные сэмплы' },
        { command: 'train', description: 'Пере-клонировать голос' },
        { command: 'avatar', description: 'Обучить аватар' },
        { command: 'analyze', description: 'Анализ голоса бренда' },
        { command: 'reset_samples', description: 'Сбросить накопленное' },
        { command: 'help', description: 'Помощь' },
      ],
    });
  })().catch((e) => {
    console.error('[tg] setMyCommands failed:', (e as Error).message);
    commandsInitPromise = null; // allow retry next update
  });
  return commandsInitPromise;
}

// ─── Owner identification ──────────────────────────────────────────-
function isOwner(msg: TgMessage): boolean {
  if (OWNER_TG_ID && msg.from?.id === OWNER_TG_ID) return true;
  const handle = msg.from?.username ? '@' + msg.from.username : null;
  return Boolean(OWNER_HANDLE && handle && handle.toLowerCase() === OWNER_HANDLE.toLowerCase());
}

// ─── Routing ───────────────────────────────────────────────────────-
async function handleMessage(msg: TgMessage): Promise<void> {
  const chatId = msg.chat.id;
  const rawText = (msg.text || '').trim();
  // Keyboard buttons send their label as text — alias them to slash commands.
  const text = BUTTON_TO_COMMAND[rawText] ?? rawText;

  if (!isOwner(msg)) {
    if (text === '/start') {
      await sendText(
        chatId,
        '🤖 Это приватный бот для обучения голоса владельца.\n' +
          'Если ты пришёл не туда — напиши автору в Telegram.',
      );
    }
    return;
  }

  // ── Slash commands ─────────────────────────────────────────────
  if (text === '/start' || text === '/help') return cmdHelp(chatId);
  if (text === '/voice') return cmdVoice(chatId);
  if (text === '/samples') return cmdSamples(chatId);
  if (text === '/reset_samples') return cmdResetSamples(chatId);
  if (text === '/train') return cmdTrain(chatId);
  if (text === '/avatar') return cmdAvatarTrain(chatId);
  if (text.startsWith('/analyze')) return cmdAnalyze(chatId, text.slice('/analyze'.length).trim());
  if (text.startsWith('/')) return sendText(chatId, '❓ Неизвестная команда. /help — список.');

  // ── Voice / audio → store as voice sample ──────────────────────
  if (msg.voice || msg.audio) {
    return ingestVoiceFile(chatId, msg);
  }

  // ── Video note (кружок) → avatar sample ────────────────────────
  if (msg.video_note) {
    return ingestVideoNote(chatId, msg);
  }

  // ── Plain video (uploaded mp4) → avatar sample too ─────────────
  if (msg.video) {
    return ingestVideo(chatId, msg);
  }

  // ── Text → TTS with current voice ──────────────────────────────
  if (text) return ttsAndSend(chatId, msg.message_id, text);

  await sendText(chatId, '🤖 Не понял. /help — список команд.');
}

// ═══ Commands ═════════════════════════════════════════════════════

async function cmdHelp(chatId: number): Promise<void> {
  await sendText(
    chatId,
    `<b>🎙 Persona Train</b>\n\n` +
      `Я обучаюсь на твоих голосовых, расшифровываю твой голос бренда и озвучиваю текст твоим голосом.\n\n` +
      `<b>Команды:</b>\n` +
      `/voice — активный голос\n` +
      `/samples — сколько голосовых накоплено\n` +
      `/train — пере-клонировать голос из накопленного\n` +
      `/reset_samples — выбросить накопленное\n` +
      `/analyze — извлечь профиль голоса (для AI-агентов)\n` +
      `/avatar — обучить аватар на кружках\n\n` +
      `<b>Просто шли:</b>\n` +
      `🎤 voice / audio → копится в samples (можно пачкой до 10 — отвечу одним сообщением)\n` +
      `⭕ кружок → копится для аватара\n` +
      `📝 текст → отвечу твоим голосом\n\n` +
      `Auto-train порог: ${AUTO_RETRAIN_SECONDS}с\n` +
      `Кабинет: ${PUBLIC_BASE_URL}/cabinet`,
    { parse_mode: 'HTML', reply_markup: MAIN_KEYBOARD },
  );
}

async function cmdVoice(chatId: number): Promise<void> {
  if (!OWNER_HANDLE) return sendText(chatId, '⚠ OWNER_HANDLE не сконфигурирован.');
  const voice = await queryOne<{
    display_name: string | null;
    provider: string;
    provider_voice_id: string;
    sample_seconds: number | null;
    created_at: string;
  }>(
    `select display_name, provider, provider_voice_id, sample_seconds, created_at
     from voices where owner_handle = $1 and archived_at is null
     order by created_at desc limit 1`,
    [OWNER_HANDLE],
  );

  if (!voice) {
    return sendText(
      chatId,
      `⚠ Активного голоса нет.\n\nСоздай первый клон: ${PUBLIC_BASE_URL}/cabinet/train\n` +
        `Или накопи ≥30 сек через /samples и сделай /train.`,
    );
  }

  await sendText(
    chatId,
    `🎙 <b>${escapeHtml(voice.display_name || OWNER_HANDLE)}</b>\n\n` +
      `Provider: ${voice.provider}\nVoice ID: <code>${voice.provider_voice_id}</code>\n` +
      `Sample: ${voice.sample_seconds ? voice.sample_seconds + 's' : '—'}\n` +
      `Создан: ${new Date(voice.created_at).toLocaleString('ru-RU')}`,
    { parse_mode: 'HTML' },
  );
}

async function cmdSamples(chatId: number): Promise<void> {
  if (!OWNER_HANDLE) return sendText(chatId, '⚠ OWNER_HANDLE не сконфигурирован.');
  const stats = await queryOne<{
    pending_count: string;
    pending_seconds: string;
    total: string;
  }>(
    `select count(*) filter (where consumed = false) as pending_count,
            coalesce(sum(duration_seconds) filter (where consumed = false), 0) as pending_seconds,
            count(*) as total
     from voice_samples where owner_handle = $1`,
    [OWNER_HANDLE],
  );

  const pendingSec = Number(stats?.pending_seconds || 0);
  const ratio = Math.min(100, Math.round((pendingSec / AUTO_RETRAIN_SECONDS) * 100));
  const bar = '█'.repeat(Math.floor(ratio / 10)) + '░'.repeat(10 - Math.floor(ratio / 10));

  await sendText(
    chatId,
    `📊 <b>Накоплено для обучения</b>\n\n` +
      `Pending: <b>${stats?.pending_count || 0}</b> samples · <b>${Math.round(pendingSec)}с</b>\n` +
      `Total ever: ${stats?.total || 0}\n\n` +
      `<code>${bar}</code> ${ratio}% от ${AUTO_RETRAIN_SECONDS}с\n\n` +
      (pendingSec >= AUTO_RETRAIN_SECONDS
        ? `✅ Достаточно — отправь /train.`
        : `Догрузи ещё <b>${Math.max(0, Math.round(AUTO_RETRAIN_SECONDS - pendingSec))}с</b> или /train принудительно.`),
    { parse_mode: 'HTML' },
  );
}

async function cmdResetSamples(chatId: number): Promise<void> {
  if (!OWNER_HANDLE) return sendText(chatId, '⚠ OWNER_HANDLE не сконфигурирован.');
  const res = await query(
    'delete from voice_samples where owner_handle = $1 and consumed = false returning id',
    [OWNER_HANDLE],
  );
  await sendText(chatId, `✂ Удалил ${res.length} pending samples.`);
}

async function cmdTrain(chatId: number): Promise<void> {
  if (!OWNER_HANDLE) return sendText(chatId, '⚠ OWNER_HANDLE не сконфигурирован.');
  if (!PUBLIC_BASE_URL) return sendText(chatId, '⚠ PUBLIC_BASE_URL не сконфигурирован.');

  await sendText(chatId, '⏳ Запускаю пере-клонирование через ElevenLabs… (5-15 сек)');

  const res = await fetch(`${PUBLIC_BASE_URL}/api/voice/train`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ owner_handle: OWNER_HANDLE }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || !data.ok) {
    return sendText(chatId, friendlyTrainError(data, res.status), { parse_mode: 'HTML' });
  }
  const skipped = Number(data.skipped_samples || 0);
  const usedFallback = Boolean(data.used_fallback_45min);
  const minsUsed = Math.round(Number(data.seconds_used || 0) / 60);
  await sendText(
    chatId,
    `✅ Новый голос создан.\n` +
      `Использовано <b>${data.consumed_samples}</b> samples (~${minsUsed} мин).\n` +
      (usedFallback
        ? `<i>Твой тариф ElevenLabs IVC не пустил 60 мин — auto-fallback взял последние 45 мин.</i>\n`
        : '') +
      (skipped > 0
        ? `Отложено на следующий /train: <b>${skipped}</b> sample(ов)\n`
        : '') +
      `Voice ID: <code>${data.provider_voice_id}</code>`,
    { parse_mode: 'HTML' },
  );
}

async function cmdAvatarTrain(chatId: number): Promise<void> {
  if (!OWNER_HANDLE || !PUBLIC_BASE_URL) {
    return sendText(chatId, '⚠ env не сконфигурирован.');
  }

  // Pre-check: don't even hit the API if there are zero pending кружков —
  // gives a friendlier UX than echoing back the JSON error.
  const pending = await queryOne<{ n: string }>(
    `select count(*) as n from avatar_samples where owner_handle = $1 and consumed = false`,
    [OWNER_HANDLE],
  );
  if (!pending || Number(pending.n) === 0) {
    return sendText(
      chatId,
      '⭕ Кружков пока нет.\n\nЗапиши кружок прямо в чат (зажми микрофон → переключи на видео) — копится для обучения аватара. На 30-60с можно запускать /avatar.',
    );
  }

  await sendText(chatId, '⏳ Регистрирую аватара в обучении…');
  const res = await fetch(`${PUBLIC_BASE_URL}/api/avatar/train`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ owner_handle: OWNER_HANDLE }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || !data.ok) {
    return sendText(chatId, friendlyTrainError(data, res.status), { parse_mode: 'HTML' });
  }
  await sendText(
    chatId,
    `✅ Avatar reserved: <code>${data.avatar_id}</code>\n` +
      `Кружков: ${data.consumed_samples} (~${data.seconds_used}s)\n` +
      `<i>Provider pipeline (HeyGen / Higgsfield) дозаложу в follow-up — sample-ы помечены consumed.</i>`,
    { parse_mode: 'HTML' },
  );
}

// ─── Friendly error renderer ───────────────────────────────────────-
// Turns a raw {ok:false, error, details, status} response into a single
// human-readable Telegram message. Knows about the most common
// ElevenLabs / Anthropic / our-own error codes.
function friendlyTrainError(data: Record<string, unknown>, httpStatus: number): string {
  const code = String(data.error || 'error');
  const details = typeof data.details === 'string' ? data.details : JSON.stringify(data.details ?? '');

  if (code === 'no_pending_samples') {
    return '⚠ Нет накопленных samples. Пришли несколько voice-note или /reset_samples → накопи заново.';
  }
  if (code === 'no_samples_fit') {
    return '⚠ ' + (details || 'Все pending samples > ElevenLabs лимита (11MB / 45 мин).');
  }
  if (code === 'eleven_clone_failed') {
    // Common ElevenLabs validation_error shapes — surface the message field.
    let msg = details;
    try {
      const parsed = JSON.parse(details) as { detail?: { message?: string; status?: string } };
      msg = parsed?.detail?.message || parsed?.detail?.status || details;
    } catch {}
    if (/audio_too_long|voice_too_long|45 minutes/i.test(msg)) {
      return '⚠ Слишком много накоплено для ElevenLabs IVC (лимит — 45 мин total). Сделай /reset_samples и догрузи покороче, либо подожди — следующий /train возьмёт только последние 45 мин.';
    }
    if (/payment_issue|payment_required|invalid_subscription/i.test(msg)) {
      return '💳 ElevenLabs: оплата не прошла. elevenlabs.io → Subscription → обнови способ оплаты.';
    }
    if (/quota_exceeded|character_limit_exceeded/i.test(msg)) {
      return '⚠ ElevenLabs: достигнут лимит символов на тарифе.';
    }
    return `⚠ ElevenLabs: ${msg.slice(0, 250)}`;
  }
  if (code === 'db_insert_failed') return '⚠ БД не приняла запись — посмотри логи персона-train-web.';

  return `❌ ${code}${httpStatus ? ` (${httpStatus})` : ''}: ${details.slice(0, 250) || 'без деталей'}`;
}

async function cmdAnalyze(chatId: number, _arg: string): Promise<void> {
  await sendText(
    chatId,
    '⏳ /analyze в боте требует Whisper-транскрипцию голосовых.\n' +
      'Сейчас Endpoint /api/voice/analyze принимает уже-расшифрованный текст. ' +
      `Пока используй: ${PUBLIC_BASE_URL}/cabinet/analyze`,
  );
}

// ═══ Inbound voice/video handlers ═════════════════════════════════

async function ingestVoiceFile(chatId: number, msg: TgMessage): Promise<void> {
  if (!OWNER_HANDLE) return;
  const fileId = msg.voice?.file_id || msg.audio?.file_id;
  const duration = msg.voice?.duration || msg.audio?.duration || null;
  if (!fileId) return;

  await sendChatAction(chatId, 'typing');

  try {
    const downloaded = await downloadTgFile(fileId);
    if (!downloaded) {
      bumpAck(chatId, 'voice', 0, true);
      return;
    }
    const { buffer, mime, ext } = downloaded;
    const stored = await storeVoiceSample(buffer, OWNER_HANDLE, ext);
    await query(
      `insert into voice_samples
         (owner_handle, source, storage_kind, storage_path, mime_type, byte_size,
          duration_seconds, tg_chat_id, tg_message_id, tg_file_id)
       values ($1, 'tg', $2, $3, $4, $5, $6, $7, $8, $9)`,
      [OWNER_HANDLE, stored.storageKind, stored.storagePath, mime, buffer.length, duration, chatId, msg.message_id, fileId],
    );
    bumpAck(chatId, 'voice', Number(duration) || 0, false);
  } catch (e) {
    console.error('[tg] ingestVoiceFile failed:', (e as Error).message);
    bumpAck(chatId, 'voice', 0, true);
  }
}

async function ingestVideoNote(chatId: number, msg: TgMessage): Promise<void> {
  if (!OWNER_HANDLE) return;
  const fileId = msg.video_note?.file_id;
  const duration = msg.video_note?.duration || null;
  if (!fileId) return;

  await sendChatAction(chatId, 'typing');

  try {
    const downloaded = await downloadTgFile(fileId);
    if (!downloaded) {
      bumpAck(chatId, 'circle', 0, true);
      return;
    }
    const { buffer, mime, ext } = downloaded;
    const stored = await storeVideoSample(buffer, OWNER_HANDLE, ext || 'mp4');
    await query(
      `insert into avatar_samples
         (owner_handle, source, storage_kind, storage_path, mime_type, byte_size,
          duration_seconds, tg_chat_id, tg_message_id, tg_file_id)
       values ($1, 'tg', $2, $3, $4, $5, $6, $7, $8, $9)`,
      [OWNER_HANDLE, stored.storageKind, stored.storagePath, mime, buffer.length, duration, chatId, msg.message_id, fileId],
    );
    bumpAck(chatId, 'circle', Number(duration) || 0, false);
  } catch (e) {
    console.error('[tg] ingestVideoNote failed:', (e as Error).message);
    bumpAck(chatId, 'circle', 0, true);
  }
}

// ─── Debounced batch ack ──────────────────────────────────────────-
// User can drop up to ~10 voice/circle files in a row; we accumulate
// arrivals into a single per-chat bucket and flush ONE summary message
// ACK_DEBOUNCE_MS after the last file lands.
type AckBucket = {
  voice: { count: number; sec: number };
  circle: { count: number; sec: number };
  failed: number;
  timer: NodeJS.Timeout | null;
};
const ackBuckets = new Map<number, AckBucket>();

function bumpAck(chatId: number, kind: 'voice' | 'circle', sec: number, failed: boolean): void {
  let bucket = ackBuckets.get(chatId);
  if (!bucket) {
    bucket = {
      voice: { count: 0, sec: 0 },
      circle: { count: 0, sec: 0 },
      failed: 0,
      timer: null,
    };
    ackBuckets.set(chatId, bucket);
  }
  if (failed) {
    bucket.failed += 1;
  } else {
    bucket[kind].count += 1;
    bucket[kind].sec += sec;
  }
  if (bucket.timer) clearTimeout(bucket.timer);
  bucket.timer = setTimeout(() => {
    void flushAck(chatId);
  }, ACK_DEBOUNCE_MS);
}

async function flushAck(chatId: number): Promise<void> {
  const bucket = ackBuckets.get(chatId);
  if (!bucket) return;
  ackBuckets.delete(chatId);

  const totalAccepted = bucket.voice.count + bucket.circle.count;
  const lines: string[] = [];

  if (totalAccepted > 0) {
    lines.push(`✅ Принял в обработку: <b>${totalAccepted}</b> файл(ов)`);
    if (bucket.voice.count) {
      lines.push(`  🎙 voice: ${bucket.voice.count} (~${Math.round(bucket.voice.sec)}с)`);
    }
    if (bucket.circle.count) {
      lines.push(`  ⭕ кружков: ${bucket.circle.count} (~${Math.round(bucket.circle.sec)}с)`);
    }
  }
  if (bucket.failed > 0) {
    lines.push(`❌ Не смог скачать: ${bucket.failed}`);
  }

  if (OWNER_HANDLE && totalAccepted > 0) {
    const voiceStats = await queryOne<{ pending_count: string; pending_seconds: string }>(
      `select count(*) as pending_count,
              coalesce(sum(duration_seconds), 0) as pending_seconds
       from voice_samples where owner_handle = $1 and consumed = false`,
      [OWNER_HANDLE],
    );
    const circleStats = await queryOne<{ pending_count: string; pending_seconds: string }>(
      `select count(*) as pending_count,
              coalesce(sum(duration_seconds), 0) as pending_seconds
       from avatar_samples where owner_handle = $1 and consumed = false`,
      [OWNER_HANDLE],
    );

    const voicePendingSec = Number(voiceStats?.pending_seconds || 0);
    const circlePendingSec = Number(circleStats?.pending_seconds || 0);
    const voiceReady = voicePendingSec >= AUTO_RETRAIN_SECONDS;
    const voiceRemain = Math.max(0, Math.round(AUTO_RETRAIN_SECONDS - voicePendingSec));

    lines.push('');
    lines.push('<b>Всего pending:</b>');
    lines.push(
      `🎙 voice — ${voiceStats?.pending_count || 0}× ~${Math.round(voicePendingSec)}с ` +
        (voiceReady ? '✅ /train готов' : `(ещё ${voiceRemain}с до auto-train)`),
    );
    lines.push(
      `⭕ avatar — ${circleStats?.pending_count || 0}× ~${Math.round(circlePendingSec)}с`,
    );
  }

  if (lines.length === 0) return;
  await sendText(chatId, lines.join('\n'), { parse_mode: 'HTML' });
}

async function ingestVideo(chatId: number, msg: TgMessage): Promise<void> {
  // Same as video_note but for full-rect videos.
  if (!msg.video) return;
  await ingestVideoNote(chatId, { ...msg, video_note: { file_id: msg.video.file_id, duration: msg.video.duration } as TgMessage['video_note'] });
}

async function ttsAndSend(chatId: number, messageId: number, text: string): Promise<void> {
  if (!OWNER_HANDLE) return;
  if (text.length > MAX_TEXT_LEN) {
    return sendText(chatId, `⚠ Слишком длинно (${text.length}). Максимум — ${MAX_TEXT_LEN} символов.`);
  }
  await sendChatAction(chatId, 'record_voice');

  const result = await generateVoiceNote({
    text,
    owner_handle: OWNER_HANDLE,
    outputFormat: 'opus_48000_64',
  });

  if (!result.ok) {
    return sendText(chatId, `❌ ${result.code}: ${(result.details || '').slice(0, 200)}`);
  }

  const formBody = new FormData();
  formBody.append('chat_id', String(chatId));
  formBody.append('reply_to_message_id', String(messageId));
  formBody.append('allow_sending_without_reply', 'true');
  formBody.append('caption', text.slice(0, 150));
  const audioBlob = new Blob([result.audioBuf], { type: 'audio/ogg' });
  formBody.append('voice', audioBlob, 'voice.ogg');

  const res = await fetch(`${TG_API}/bot${TG_TOKEN}/sendVoice`, {
    method: 'POST',
    body: formBody,
  });
  if (!res.ok) {
    const body = await res.text();
    console.error('[tg] sendVoice failed:', res.status, body.slice(0, 200));
  }
}

// ═══ Telegram helpers ═════════════════════════════════════════════

async function downloadTgFile(
  fileId: string,
): Promise<{ buffer: Buffer; mime: string; ext: string } | null> {
  if (!TG_TOKEN) return null;
  const meta = await tgApi('getFile', { file_id: fileId });
  if (!meta?.ok) return null;
  const filePath = (meta.result as { file_path: string }).file_path;
  const res = await fetch(`${TG_API}/file/bot${TG_TOKEN}/${filePath}`);
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = (filePath.split('.').pop() || '').toLowerCase().slice(0, 5);
  const mime =
    ext === 'oga' || ext === 'ogg'
      ? 'audio/ogg'
      : ext === 'mp4'
        ? 'video/mp4'
        : ext === 'm4a'
          ? 'audio/mp4'
          : 'application/octet-stream';
  return { buffer: buf, mime, ext };
}

type TgApiResp = { ok: boolean; result?: unknown; description?: string };

async function tgApi(method: string, payload: Record<string, unknown>): Promise<TgApiResp | null> {
  if (!TG_TOKEN) return null;
  try {
    const res = await fetch(`${TG_API}/bot${TG_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return (await res.json()) as TgApiResp;
  } catch (e) {
    console.error('[tg]', method, 'failed:', (e as Error).message);
    return null;
  }
}

async function sendText(
  chatId: number,
  text: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await tgApi('sendMessage', { chat_id: chatId, text, disable_web_page_preview: true, ...extra });
}

async function sendChatAction(chatId: number, action: string): Promise<void> {
  await tgApi('sendChatAction', { chat_id: chatId, action });
}

async function answerCallback(id: string): Promise<void> {
  await tgApi('answerCallbackQuery', { callback_query_id: id });
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
}

// ═══ TG message shape (subset) ════════════════════════════════════
type TgMessage = {
  message_id: number;
  chat: { id: number };
  from?: { id: number; username?: string };
  text?: string;
  voice?: { file_id: string; duration?: number; mime_type?: string };
  audio?: { file_id: string; duration?: number; mime_type?: string };
  video_note?: { file_id: string; duration?: number };
  video?: { file_id: string; duration?: number };
};
