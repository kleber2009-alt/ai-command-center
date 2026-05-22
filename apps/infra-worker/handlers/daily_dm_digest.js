// ═══════════════════════════════════════════════════════════════════
// handlers/daily_dm_digest.js — ежедневная сводка по IG/TG-перепискам
// ───────────────────────────────────────────────────────────────────
// Читает все входящие сообщения за последние N часов из таблицы
// `messages` (БД `aisales`), группирует по conversation_id, гонит каждый
// диалог через Sonnet с промптом «аналитик», агрегирует и шлёт сводку
// Илье в TG.
//
// Payload:
//   {
//     tg_chat_id: number,           // куда слать дайджест (по умолч. ILYA_TG_CHAT_ID)
//     lookback_hours?: number,      // default 24
//     channels?: ['ig','tg']        // default ['ig','tg']
//   }
//
// Output:
//   { ok: true, conversations_analyzed, tg_message_id }
// ═══════════════════════════════════════════════════════════════════

import { query } from '../lib/db.js';
import { chat } from '../lib/anthropic.js';
import { sendText } from '../lib/tg.js';

const DEFAULT_LOOKBACK_H = 24;
const MAX_TRANSCRIPT_CHARS = 6000;
const MAX_DIGEST_TG_LEN = 3800;
const MODEL = 'claude-sonnet-4-6';

const ANALYST_SYSTEM = `Ты — аналитик AI Sales. Тебе дают одну переписку клиента из IG или TG за последние сутки. Верни СТРОГО JSON:
{
  "summary": "1-2 предложения по-русски — что произошло в диалоге за сутки",
  "stage": "hello|discovery|pitch|objections|close|followup|won|lost",
  "intent": "warm|cold|buyer|tire_kicker|spam|support|other",
  "score_0_100": число,
  "needs_human": true|false,
  "needs_human_reason": "строка или null",
  "next_action": "1 строка — что бы сделал менеджер дальше"
}
Если в переписке нечего анализировать (один эмодзи, спам) — стадия "hello", intent "spam"/"cold", score низкий. Никаких преамбул и комментариев, только JSON.`;

export async function handle(job) {
  const p = job.payload || {};
  const tgChatId = Number(p.tg_chat_id || process.env.ILYA_TG_CHAT_ID || 0);
  if (!tgChatId) {
    return { ok: false, error: 'tg_chat_id missing (set ILYA_TG_CHAT_ID or payload.tg_chat_id)' };
  }

  const hours = Number(p.lookback_hours) > 0 ? Number(p.lookback_hours) : DEFAULT_LOOKBACK_H;
  const channels = Array.isArray(p.channels) && p.channels.length ? p.channels : ['ig', 'tg'];

  // ── 1. Pull conversations with at least one inbound msg in window ──
  const convos = await query(
    `SELECT c.id            AS conv_id,
            c.channel       AS channel,
            cl.id           AS client_id,
            cl.ig_username  AS ig_username,
            cl.tg_username  AS tg_username,
            cl.display_name AS display_name,
            cl.funnel_stage AS prev_stage,
            COUNT(m.id) FILTER (WHERE m.direction = 'inbound') AS inbound_n,
            COUNT(m.id) FILTER (WHERE m.direction = 'outbound') AS outbound_n
       FROM conversations c
       JOIN clients cl ON cl.id = c.client_id
       JOIN messages m  ON m.conversation_id = c.id
      WHERE c.channel = ANY($1::conversation_channel[])
        AND m.created_at > NOW() - ($2 || ' hours')::interval
      GROUP BY c.id, cl.id
      HAVING COUNT(m.id) FILTER (WHERE m.direction = 'inbound') > 0
      ORDER BY MAX(m.created_at) DESC
      LIMIT 50`,
    [channels, String(hours)],
  );

  if (convos.length === 0) {
    const empty = `🌙 Сводка по DM (последние ${hours}ч)\n\nНовых входящих сообщений нет.`;
    const r = await sendText(tgChatId, empty);
    return { ok: true, conversations_analyzed: 0, tg_message_id: r.result?.message_id };
  }

  // ── 2. For each convo — pull transcript + analyse ──
  const analyses = [];
  for (const conv of convos) {
    const transcript = await loadTranscript(conv.conv_id, hours);
    if (!transcript) continue;

    const a = await analyseOne(conv, transcript);
    analyses.push(a);
  }

  // ── 3. Aggregate + send ──
  const digest = renderDigest({ analyses, hours, channels });
  const r = await sendText(tgChatId, digest, { parse_mode: 'HTML' });

  if (!r.ok) {
    return { ok: false, error: `tg: ${r.status} ${r.error || ''}` };
  }

  return {
    ok: true,
    conversations_analyzed: analyses.length,
    needs_human: analyses.filter((a) => a.needs_human).length,
    tg_message_id: r.result?.message_id,
  };
}

async function loadTranscript(convId, hours) {
  const msgs = await query(
    `SELECT direction, content, type, created_at
       FROM messages
      WHERE conversation_id = $1
        AND created_at > NOW() - ($2 || ' hours')::interval
      ORDER BY created_at ASC
      LIMIT 100`,
    [convId, String(hours)],
  );
  if (msgs.length === 0) return null;

  const lines = msgs.map((m) => {
    const who = m.direction === 'inbound' ? 'CLIENT' : 'US';
    const body = (m.content || `[${m.type}]`).replace(/\s+/g, ' ').trim();
    return `${who}: ${body}`;
  });
  let out = lines.join('\n');
  if (out.length > MAX_TRANSCRIPT_CHARS) {
    out = '…(обрезано)…\n' + out.slice(-MAX_TRANSCRIPT_CHARS);
  }
  return out;
}

async function analyseOne(conv, transcript) {
  const handle =
    conv.ig_username ||
    conv.tg_username ||
    conv.display_name ||
    String(conv.client_id).slice(0, 8);

  const userBlock = `<dialog channel="${conv.channel}" client="${handle}" prev_stage="${conv.prev_stage || '?'}">
${transcript}
</dialog>`;

  const r = await chat({
    system: ANALYST_SYSTEM,
    messages: [{ role: 'user', content: userBlock }],
    model: MODEL,
    maxTokens: 400,
  });

  if (!r.ok) {
    return {
      handle, channel: conv.channel, error: `claude: ${r.status}`,
      summary: '(не удалось проанализировать)',
      stage: conv.prev_stage || 'hello',
      intent: 'other', score_0_100: 0,
      needs_human: false, needs_human_reason: null,
      next_action: '—',
      inbound_n: Number(conv.inbound_n), outbound_n: Number(conv.outbound_n),
    };
  }

  const parsed = safeJson(r.text) || {};
  return {
    handle,
    channel: conv.channel,
    summary: parsed.summary || '(пусто)',
    stage: parsed.stage || conv.prev_stage || 'hello',
    intent: parsed.intent || 'other',
    score_0_100: Number(parsed.score_0_100 || 0),
    needs_human: Boolean(parsed.needs_human),
    needs_human_reason: parsed.needs_human_reason || null,
    next_action: parsed.next_action || '—',
    inbound_n: Number(conv.inbound_n),
    outbound_n: Number(conv.outbound_n),
  };
}

function safeJson(s) {
  if (!s) return null;
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function renderDigest({ analyses, hours, channels }) {
  const sorted = [...analyses].sort((a, b) => {
    if (a.needs_human !== b.needs_human) return b.needs_human ? 1 : -1;
    return b.score_0_100 - a.score_0_100;
  });

  const needHuman = sorted.filter((a) => a.needs_human);
  const buyers = sorted.filter((a) => !a.needs_human && a.intent === 'buyer');
  const rest = sorted.filter((a) => !a.needs_human && a.intent !== 'buyer');

  const ch = channels.map((c) => c.toUpperCase()).join('/');
  const head = `🌙 <b>Сводка по ${ch} (последние ${hours}ч)</b>\n` +
    `Диалогов: <b>${analyses.length}</b>` +
    (needHuman.length ? ` · 🚨 эскалаций: <b>${needHuman.length}</b>` : '') +
    (buyers.length ? ` · 💰 покупателей: <b>${buyers.length}</b>` : '');

  const blocks = [head];

  if (needHuman.length) {
    blocks.push('\n🚨 <b>Требуют тебя:</b>');
    for (const a of needHuman) blocks.push(renderItem(a));
  }
  if (buyers.length) {
    blocks.push('\n💰 <b>Тёплые покупатели:</b>');
    for (const a of buyers) blocks.push(renderItem(a));
  }
  if (rest.length) {
    blocks.push('\n💬 <b>Остальные:</b>');
    for (const a of rest.slice(0, 15)) blocks.push(renderItem(a));
    if (rest.length > 15) blocks.push(`\n…ещё ${rest.length - 15}`);
  }

  let out = blocks.join('\n');
  if (out.length > MAX_DIGEST_TG_LEN) out = out.slice(0, MAX_DIGEST_TG_LEN - 20) + '\n…(обрезано)';
  return out;
}

function renderItem(a) {
  const handle = a.channel === 'ig' ? `@${a.handle}` : a.handle;
  const reason = a.needs_human_reason ? ` — ${a.needs_human_reason}` : '';
  return `• <b>${esc(handle)}</b> [${a.stage}, ${a.score_0_100}/100]${esc(reason)}\n` +
         `  ${esc(a.summary)}\n` +
         `  → <i>${esc(a.next_action)}</i>`;
}

function esc(s) {
  return String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
