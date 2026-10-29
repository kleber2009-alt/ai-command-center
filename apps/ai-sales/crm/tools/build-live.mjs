// Builds assets/live.enc from the agent's per-chat analysis of the Instagram Direct (ChatPlace).
//   CRM_PASSWORD=… node tools/build-live.mjs <dir with batch_*.json> [insights.json]
// The CRM data object (same shape the views read from window.CRM_DATA) is gzipped and encrypted with
// AES-256-GCM; the key comes from the password via PBKDF2-SHA256. The page decrypts it in the browser,
// so neither the repo nor the server ever holds the conversations in clear text.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { webcrypto as crypto } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [dir, insightsPath] = process.argv.slice(2);
const password = process.env.CRM_PASSWORD;
if (!dir || !password) {
  console.error('usage: CRM_PASSWORD=… node tools/build-live.mjs <dir> [insights.json]');
  process.exit(1);
}

const chats = readdirSync(dir).filter((f) => /^batch_\d+\.json$/.test(f)).sort()
  .flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
  .filter((c) => c && c.id && !c.error);
const seen = new Set();
const uniq = chats.filter((c) => !seen.has(c.id) && seen.add(c.id)).sort((a, b) => b.lastAt - a.lastAt);
const now = Math.max(...uniq.map((c) => c.lastAt));

const KINDS = [
  ['funnel', 'Воронка'], ['lead', 'Лид'], ['question', 'Вопрос'], ['complaint', 'Жалоба'],
  ['partner', 'Сотрудничество'], ['personal', 'Личное'], ['spam', 'Спам'], ['other', 'Другое'],
];
const FLAG_LABEL = {
  complaint: 'Жалоба', refund: 'Возврат', payment: 'Оплата', hot_lead: 'Горячий лид', bot_failed: 'Бот не справился',
  link_broken: 'Не открылась ссылка', human_request: 'Просит Илью', partner: 'Сотрудничество', media: 'Медиа',
  feedback: 'Отзыв', kb_gap: 'Пробел в базе', spam: 'Спам',
};

const fmtTime = (t) => new Date(t * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
const fmtDay = (t) => new Date(t * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' });
const ago = (t) => {
  const m = Math.round((now - t) / 60);
  if (m < 1) return 'сейчас';
  if (m < 60) return `${m} мин`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} ч` : `${Math.round(h / 24)} д`;
};
const inboxType = (c) => {
  const f = new Set(c.flags || []);
  if (c.priority === 1 || f.has('complaint') || f.has('refund') || f.has('payment')) return 'esc';
  if (f.has('hot_lead') || c.kind === 'lead') return 'lead';
  if (f.has('partner') || f.has('media') || c.kind === 'partner') return 'partner';
  if (f.has('bot_failed') || f.has('link_broken') || f.has('human_request')) return 'bot';
  return 'info';
};

const clients = uniq.map((c) => {
  const msgs = (c.messages || []).filter((m) => m && m.text);
  const last = msgs[msgs.length - 1];
  const user = /^@/.test(c.client || '') ? c.client : '';
  const messages = [];
  let day = '';
  for (const m of msgs) {
    const d = fmtDay(m.t);
    if (d !== day) messages.push({ day: (day = d) });
    messages.push({ side: m.side === 'in' ? 'in' : m.side === 'me' ? 'me' : 'out', t: fmtTime(m.t), text: m.text });
  }
  const f = new Set(c.flags || []);
  return {
    id: c.id,
    name: (c.client || 'Без имени').replace(/^@/, '') || 'Без имени',
    user,
    ch: 'ig',
    stage: KINDS.some(([k]) => k === c.kind) ? c.kind : 'other',
    priority: c.priority || 0,
    flags: [...f].map((k) => FLAG_LABEL[k] || k),
    keyword: c.keyword || null,
    waiting: !!c.waiting,
    last: last ? last.text : '',
    lastBy: last ? (last.side === 'in' ? 'client' : last.side === 'me' ? 'me' : 'agent') : 'client',
    lastAt: c.lastAt,
    ago: ago(c.lastAt),
    flag: c.priority === 1 ? 'esc' : f.has('hot_lead') ? 'hot' : null,
    unread: c.waiting ? 1 : 0,
    summary: c.summary || '',
    suggestion: c.suggestion || null,
    draft: c.draft || null,
    chatStatus: c.status,
    operator: c.type === 'open',
    info: { source: c.keyword ? `кодовое слово «${c.keyword}»` : '', msgs: msgs.length },
    messages,
  };
});

const flagged = clients.filter((c) => c.priority > 0).sort((a, b) => a.priority - b.priority || b.lastAt - a.lastAt);
const count = (fn) => clients.filter(fn).length;

const kwMap = new Map();
for (const c of clients) {
  if (!c.keyword) continue;
  const k = c.keyword.trim().toLowerCase();
  const e = kwMap.get(k) || { name: c.keyword.trim(), n: 0, waiting: 0, failed: 0 };
  e.n++;
  if (c.waiting) e.waiting++;
  if (c.flags.includes('Бот не справился') || c.flags.includes('Не открылась ссылка')) e.failed++;
  kwMap.set(k, e);
}
const keywords = [...kwMap.values()].sort((a, b) => b.n - a.n);

const hours = Array.from({ length: 24 }, (_, i) => {
  const from = now - (24 - i) * 3600;
  return { label: fmtTime(from + 3600), n: count((c) => c.lastAt > from && c.lastAt <= from + 3600) };
});

const data = {
  demo: false,
  live: true,
  generatedAt: now,
  now: `${fmtDay(now)} · ${fmtTime(now)}`,
  period: `${fmtDay(now - 86400)} ${fmtTime(now - 86400)} — ${fmtDay(now)} ${fmtTime(now)}`,
  total: clients.length,
  metrics: [
    { label: 'Диалогов за сутки', value: clients.length, delta: 'весь директ', dir: 'flat', icon: 'messages-square', tone: 'b' },
    { label: 'Срочно', value: count((c) => c.priority === 1), delta: 'приоритет 1', dir: 'flat', icon: 'siren', tone: 'p' },
    { label: 'Важно', value: count((c) => c.priority === 2), delta: 'приоритет 2', dir: 'flat', icon: 'flag', tone: 'a' },
    { label: 'Ждут ответа', value: count((c) => c.waiting), delta: 'последнее слово за клиентом', dir: 'flat', icon: 'hourglass', tone: 'v' },
    { label: 'Горячие лиды', value: count((c) => c.flags.includes('Горячий лид') || c.stage === 'lead'), delta: 'спрашивают о покупке', dir: 'flat', icon: 'flame', tone: 'p' },
    { label: 'Бот не справился', value: count((c) => c.flags.includes('Бот не справился')), delta: 'нужна правка воронки', dir: 'flat', icon: 'bot', tone: 'g' },
  ],
  stages: KINDS.map(([id, name]) => ({ id, name, count: count((c) => c.stage === id) })),
  keywords,
  hours,
  flagStats: Object.entries(FLAG_LABEL).map(([, label]) => ({ label, n: count((c) => c.flags.includes(label)) })).filter((x) => x.n).sort((a, b) => b.n - a.n),
  inbox: flagged.map((c) => ({
    id: c.id, type: inboxType(c), p: c.priority, unread: c.waiting, client: c.id,
    title: `${c.user || c.name} — ${c.summary}`, from: c.flags.join(' · ') || 'агент', desc: c.suggestion || '',
    t: c.ago, day: c.lastAt > now - 6 * 3600 ? 'Последние 6 часов' : 'Ранее за сутки',
  })),
  clients,
  insights: insightsPath ? JSON.parse(readFileSync(insightsPath, 'utf8')) : [],
};

const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const iter = 310000;
const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, gzipSync(Buffer.from(JSON.stringify(data)))));
const b64 = (u) => Buffer.from(u).toString('base64');
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'live.enc');
writeFileSync(out, JSON.stringify({ v: 1, kdf: 'PBKDF2-SHA256', iter, salt: b64(salt), iv: b64(iv), ct: b64(ct) }));
console.log(`✓ ${clients.length} chats, ${flagged.length} flagged → ${out} (${Math.round(ct.length / 1024)} KB)`);
