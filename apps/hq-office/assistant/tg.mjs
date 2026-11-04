/* Telegram — the owner's remote control of the office: the bot «Офис» in a private forum group with topics
   (or, before a group is bound, in the private chat with the owner). The same working desk as the site (desk.mjs):
   every task is ONE card that the bot edits in place and moves between topics as its status changes, with the
   buttons of that status; replies to a card are answers / revisions; voice messages are recognized (ElevenLabs);
   files go to tasks; the twin talks in its own topic; a pinned control panel, reminders and two digests a day.

     📥 Ждут меня — only what needs the owner: a question, a result to check, an action to allow
     ⚙️ В работе  — routing, queue, work, pause (cards edited in place, no new messages)
     ✅ Готово    — accepted and cancelled
     📁 Материалы — files of results on request («📎 Файлы»); files sent here wait for the next task
     ☀️ Утро      — the morning agents (balances, social stats)
     🎙 Двойник   — a conversation with the twin, by voice or text (it answers in the cloned voice to a voice)
     ⚠️ Ошибки    — failures, with «Повторить»

   Setup: a bot of its own (BotFather) → secret HQ_TG_BOT_TOKEN; owners — HQ_TG_OWNER_IDS (Telegram user ids).
   Create a group, turn on Topics, add the bot as an admin (manage topics, pin, delete messages), write /bind there —
   the bot creates the topics itself. Until then everything comes to the private chat with the bot. The menu button
   of the private chat opens the office as a Mini App (login by Telegram, POST /api/assistant/tg-login).
   State: DATA_DIR/tg.json. Long polling (getUpdates) — no webhook, nothing to open on the edge. */
import fs from 'node:fs';
import path from 'node:path';
import { transcribe, speak, voiceConfigured } from './voice.mjs';

// HQ_TG_API — a local Bot API server or a fake one in tests (read on every call)
const apiBase = () => (process.env.HQ_TG_API || 'https://api.telegram.org').replace(/\/$/, '');
const SEND_LIMIT = 49e6;        // the Bot API sends files up to 50 MB
const GET_LIMIT = 20e6;         // and lets a bot download files up to 20 MB
const REMIND_MS = 3 * 3600e3;   // a card waiting for the owner is reminded every 3 hours (09–22 MSK)
const WORK_EDIT_MS = 30e3;      // a card in work shows the last step, edited at most every 30 s
export const TOPICS = [
  { k:'inbox', name:'📥 Ждут меня', color:0xFF93B2 },
  { k:'work', name:'⚙️ В работе', color:0x6FB9F0 },
  { k:'done', name:'✅ Готово', color:0x8EEE98 },
  { k:'files', name:'📁 Материалы', color:0xFFD67E },
  { k:'morning', name:'☀️ Утро', color:0xFFD67E },
  { k:'twin', name:'🎙 Двойник', color:0xCB86DB },
  { k:'errors', name:'⚠️ Ошибки', color:0xFB6F5F },
];
const IMG = /\.(jpe?g|png|webp)$/i, VID = /\.(mp4|mov|m4v|webm)$/i, DOC = /\.(pdf|pptx?|docx?|xlsx?|key|csv|zip)$/i, PHOTO = 10e6;
const FILES_MAX = 60;
const plural = n => n % 10 === 1 && n % 100 !== 11 ? 'файл' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'файла' : 'файлов';
const mb = b => b >= 1e6 ? `${(b / 1e6).toFixed(1).replace('.', ',')} МБ` : `${Math.max(1, Math.round(b / 1e3))} КБ`;
const natural = (a, b) => a.localeCompare(b, 'ru', { numeric:true });
const ICON = { routing:'🧭', question:'❓', queued:'⏳', work:'⚙️', review:'👀', done:'✅', cancelled:'✖️', error:'⚠️', paused:'⏸' };

// «пришли файлом», «скинь оригиналы», «файлы», «в исходном качестве» — a short reply asking for the files themselves
export const wantsFiles = t => { t = String(t || '').trim().toLowerCase(); return t.length <= 80 && /(файл|оригинал|исходник|исходном качеств|лучшем качеств|высоком качеств|без сжатия)/.test(t) && !/(сделай|переделай|исправ|добав|убери|замени|поменяй)/.test(t); };
export const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cut = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
const plain = s => String(s || '').replace(/\*\*|__|`/g, '').replace(/^#+\s*/gm, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
const MSK = 3 * 3600e3;
const mskHour = (d = new Date()) => new Date(d.getTime() + MSK).getUTCHours();
const mskDay = (d = new Date()) => new Date(d.getTime() + MSK).toISOString().slice(0, 10);
// «⏳ Результат — примерно через 15 мин, к 14:35 МСК»: the estimate of the desk (desk.mjs → etas)
const durRu = ms => { const m = Math.max(1, Math.round(ms / 60e3)); return m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч${m % 60 ? ` ${m % 60} мин` : ''}`; };
const clockMsk = iso => new Intl.DateTimeFormat('ru-RU', { timeZone:'Europe/Moscow', hour:'2-digit', minute:'2-digit' }).format(new Date(iso));
export const etaLine = e => e.late ? `⏳ Дольше обычного — результат примерно к ${clockMsk(e.at)} МСК` : `⏳ Результат — примерно через ${durRu(e.ms)}, к ${clockMsk(e.at)} МСК`;
const mskText = iso => new Intl.DateTimeFormat('ru-RU', { timeZone:'Europe/Moscow', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }).format(new Date(iso));
// a moment in Moscow time: day offset from today and the hour
function mskAt(offset, hour, base = new Date()) {
  const m = new Date(base.getTime() + MSK);
  return new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), m.getUTCDate() + offset, hour) - MSK);
}
export function snoozeUntil(code, base = new Date()) {
  if (code === 'h1') return new Date(base.getTime() + 3600e3);
  if (code === 'h3') return new Date(base.getTime() + 3 * 3600e3);
  if (code === 'eve') { const t = mskAt(0, 19, base); return t > base ? t : mskAt(1, 19, base); }
  if (code === 'tom') return mskAt(1, 9, base);
  if (code === 'mon') { const dow = new Date(base.getTime() + MSK).getUTCDay(); return mskAt(((8 - dow) % 7) || 7, 9, base); }
  return null;
}

// the parts of the agent's report worth reading in a chat: «Что сделано» and up to 5 points of «Главное»
export function reportBrief(summary) {
  const s = String(summary || ''), sec = name => (new RegExp(`^##\\s*${name}[^\\n]*\\n([\\s\\S]*?)(?=^##\\s|$(?![\\s\\S]))`, 'mi').exec(s) || [])[1] || '';
  const done = plain(sec('Что сделано') || (/^##\s/m.test(s) ? '' : s)).replace(/^(SUMMARY|RESULT):.*$/gm, '').replace(/\s+/g, ' ').trim();
  const main = plain(sec('Главное')).split('\n').map(x => x.replace(/^\s*[-*•\d.)]+\s*/, '').trim()).filter(Boolean).slice(0, 5);
  const changed = plain(sec('Что изменено')).split('\n').map(x => x.replace(/^\s*[-*•\d.)]+\s*/, '').trim()).filter(Boolean).slice(0, 3);
  return { done:cut(done, 600), main:main.map(x => cut(x, 180)), changed:changed.map(x => cut(x, 180)) };
}

/* ---------- the card: text and buttons of a task by its status (pure — tested in desk.test.mjs) ---------- */

export function topicOf(v) {
  if (v.status === 'error') return 'errors';
  if (v.routine && v.status !== 'question') return 'morning';
  if ((v.status === 'question' || v.status === 'review') && !v.snoozed) return 'inbox';
  if (v.status === 'done' || v.status === 'cancelled') return 'done';
  return 'work';
}
export function cardText(v, site) {
  const title = v.route?.title || cut(v.text, 80), L = [];
  const pos = v.status === 'queued' && v.queuePos > 1 ? ` · ${v.queuePos}-я в очереди` : '';
  L.push(`${ICON[v.status] || '•'} <b>${esc(title)}</b>${v.urgent ? ' ⚡' : ''}`);
  L.push(`<i>${esc(v.agent?.name || 'Диспетчер')} · ${esc(v.statusText)}${pos}${v.paused?.until ? ` до ${esc(mskText(v.paused.until))}` : ''}${v.snoozed ? ` · отложено до ${esc(mskText(v.snoozed))}` : ''}</i>`);
  if (v.eta) L.push(etaLine(v.eta));
  if (v.pipeline) L.push(`🔗 ${esc(v.pipeline.label)} · этап ${Math.min(v.pipeline.idx + 1, v.pipeline.stages.length)}/${v.pipeline.stages.length}`);
  if (v.style) L.push(`🎨 ${esc(v.style)}`);
  L.push('');
  if (v.status === 'question' && v.question) {
    L.push(`❓ ${esc(cut(v.question.text, 1500))}`);
    if (v.question.options?.length && v.question.from !== 'approval') L.push('', 'Выберите кнопкой или ответьте на это сообщение — текстом или голосом.');
    else if (!v.question.options?.length) L.push('', '↩️ Ответьте на это сообщение — текстом или голосом, можно с файлами.');
  } else if (v.status === 'review' || v.status === 'done') {
    const b = reportBrief(v.result?.summary);
    if (v.result?.note) { const n = reportBrief(v.result.note); if (n.changed.length || n.done) L.push(`✏️ ${esc(n.changed.join('; ') || n.done)}`, ''); }
    else if (b.changed.length) L.push(`✏️ ${esc(b.changed.join('; '))}`, '');
    if (b.done) L.push(esc(b.done));
    if (b.main.length) L.push('', ...b.main.map(x => `• ${esc(x)}`));
    if (v.result?.files?.length) L.push('', `📎 ${v.result.files.length} ${plural(v.result.files.length)}${v.result.main ? ` · главный: <code>${esc(v.result.main)}</code>` : ''}`);
    if (v.status === 'review') L.push('', '↩️ Правка — ответом на это сообщение, текстом или голосом.');
    else L.push('', v.rating ? `Оценка: ${v.rating.value === 'up' ? '👍' : '👎'}${v.rating.comment ? ' — ' + esc(cut(v.rating.comment, 200)) : ''}` : v.published ? 'В истории офиса.' : 'Принято без публикации.');
  } else if (v.status === 'error') {
    L.push(`⚠️ ${esc(cut(v.error, 900))}`);
  } else if (v.status === 'paused') {
    L.push(v.paused?.until ? 'Вернётся в очередь сама в это время.' : 'Ждёт, пока вы не нажмёте «Продолжить».');
  } else {
    const last = v.steps?.at(-1)?.text;
    if (last) L.push(`<i>${esc(cut(last, 300))}</i>`);
  }
  if (v.usage) L.push('', `⏱ ${Math.max(1, Math.round(v.usage.ms / 60000))} мин${v.usage.cost ? ` · $${v.usage.cost.toFixed(2)}` : ''}`);
  if (site) L.push(`<a href="${esc(site)}/#desk-${esc(v.id)}">Открыть в офисе</a>`);
  return cut(L.join('\n').replace(/\n{3,}/g, '\n\n'), 4000);
}
const B = (text, data) => ({ text, callback_data:data });
export function cardKeyboard(v, { mode = '', site = '', webApp = false } = {}) {
  const id = v.id, rows = [];
  // «Открыть» — the mini app of the office (app/index.html, #t=<id>); in a group Telegram allows web_app buttons only as links
  const open = site ? (webApp ? { text:'🔍 Открыть', web_app:{ url:`${site}/app/#t=${id}` } } : { text:'🔍 Открыть', url:`${site}/app/#t=${id}` }) : null;
  if (mode === 'snooze') {
    rows.push([B('1 час', `zz:${id}:h1`), B('3 часа', `zz:${id}:h3`), B('Вечером', `zz:${id}:eve`)]);
    rows.push([B('Завтра 9:00', `zz:${id}:tom`), B('Пн 9:00', `zz:${id}:mon`)]);
    rows.push([B('← Назад', `b:${id}`)]);
    return { inline_keyboard:rows };
  }
  if (mode === 'cancel') return { inline_keyboard:[[B('Да, отменить', `xx:${id}`), B('← Назад', `b:${id}`)]] };
  if (v.status === 'question') {
    const opts = v.question?.options || [];
    for (let i = 0; i < opts.length; i += 2) rows.push(opts.slice(i, i + 2).map(o => B(cut(o.label, 40), `o:${id}:${o.id}`)));
    rows.push([B('✍️ Ответить', `ans:${id}`), B('⏰ Отложить', `z:${id}`), B('✖️ Отменить', `x:${id}`)]);
  } else if (v.status === 'review') {
    rows.push([B('✅ Принять', `ok:${id}`), B('👍', `up:${id}`), B('👎', `dn:${id}`)]);
    rows.push([B('✏️ Правка', `rv:${id}`), B('📎 Файлы', `f:${id}`), B('⏰ Отложить', `z:${id}`)]);
    rows.push([B('Принять без публикации', `okp:${id}`), B('✖️ Отменить', `x:${id}`)]);
  } else if (v.status === 'queued') {
    rows.push([B('⏸ Пауза', `p:${id}`), B(v.urgent ? 'Не срочно' : '⚡ Срочно', `u:${id}`), B('⏰ Отложить', `z:${id}`)]);
    rows.push([B('✖️ Отменить', `x:${id}`)]);
  } else if (v.status === 'work') {
    rows.push([B('⏸ Пауза', `p:${id}`), B('⏰ Отложить', `z:${id}`), B('✖️ Отменить', `x:${id}`)]);
  } else if (v.status === 'paused') {
    rows.push([B('▶️ Продолжить', `r:${id}`), B(v.urgent ? 'Не срочно' : '⚡ Срочно', `u:${id}`), B('✖️ Отменить', `x:${id}`)]);
  } else if (v.status === 'routing') {
    rows.push([B('✖️ Отменить', `x:${id}`)]);
  } else if (v.status === 'error') {
    rows.push([B('🔁 Повторить', `rt:${id}`)]);
  } else if (v.status === 'done') {
    rows.push([B('📎 Файлы', `f:${id}`), B('✏️ Правка', `rv:${id}`)]);
  }
  if (open && v.status !== 'cancelled') rows.push([open]);
  return { inline_keyboard:rows };
}
// what is not shown in the card's last step: changes of these redraw the card at once
const sigOf = v => JSON.stringify([v.status, v.agent?.id, v.question?.text, v.question?.options?.length, v.result?.version, v.result?.note, v.urgent, v.paused, v.snoozed,
  v.pipeline?.idx, v.style, v.error, v.rating, v.published, v.queuePos]);

/* ---------- the bot ---------- */

export function startTelegram({ desk, dataDir, token, owners, site, ask, ownerVoice, fileLink }) {
  if (!token || !owners.length) { console.log('telegram: off (HQ_TG_BOT_TOKEN / HQ_TG_OWNER_IDS)'); return null; }
  const FILE = path.join(dataDir, 'tg.json');
  let st = { chat:null, topics:{}, cards:{}, msgs:{}, prompts:{}, pult:null, offset:0, digest:{}, me:'' };
  try { st = { ...st, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch {}
  let saveTimer = null;
  const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { fs.writeFileSync(FILE + '.tmp', JSON.stringify(st)); fs.renameSync(FILE + '.tmp', FILE); } catch (e) { console.error('telegram save:', e.message); } }, 300); };
  const isOwner = id => owners.includes(String(id));
  const grouped = () => Boolean(st.chat);
  const chatId = () => st.chat || owners[0];
  const where = k => ({ chat_id:chatId(), ...(grouped() && k && st.topics[k] ? { message_thread_id:st.topics[k] } : {}) });
  const remember = (mid, id) => { st.msgs[mid] = id; const keys = Object.keys(st.msgs); if (keys.length > 3000) for (const k of keys.slice(0, keys.length - 2500)) delete st.msgs[k]; };
  const drafts = new Map();      // chat:thread → { uploads:[{id,name}], at } — files waiting for the next task
  const pendingNew = new Map();  // key → { text, uploads } — a new task waiting for «Поставить»

  async function tg(method, body, timeout = 30e3) {
    const isForm = body instanceof FormData;
    const r = await fetch(`${apiBase()}/bot${token}/${method}`, { method:'POST', ...(isForm ? { body } : { headers:{ 'content-type':'application/json' }, body:JSON.stringify(body || {}) }), signal:AbortSignal.timeout(timeout) });
    const j = await r.json().catch(() => ({ ok:false, description:'bad json' }));
    if (!j.ok) {
      if (j.parameters?.retry_after) { await new Promise(res => setTimeout(res, (j.parameters.retry_after + 1) * 1000)); return tg(method, body, timeout); }
      throw Object.assign(new Error(`${method}: ${j.description}`), { tg:j });
    }
    return j.result;
  }
  const quiet = p => p.catch(e => { if (!/not modified|message to delete not found|message can't be deleted/i.test(e.message)) console.error('telegram:', e.message); return null; });
  const send = (k, text, extra = {}) => tg('sendMessage', { ...where(k), text, parse_mode:'HTML', disable_web_page_preview:true, ...extra });

  // asFile — always a document with the original bytes (sendPhoto / sendVideo re-encode and shrink)
  async function sendFile(k, file, caption = '', extra = {}, asFile = false) {
    const size = fs.statSync(file).size, name = path.basename(file), ext = path.extname(name).toLowerCase();
    if (size > SEND_LIMIT) return send(k, `📎 <b>${esc(name)}</b> — ${Math.round(size / 1e6)} МБ, больше лимита Telegram.${fileLink ? ` <a href="${esc(fileLink(file))}">Скачать по ссылке</a>` : ''}`, extra);
    const fd = new FormData(), w = where(k);
    for (const [a, b] of Object.entries({ ...w, ...extra })) fd.append(a, typeof b === 'object' ? JSON.stringify(b) : String(b));
    if (caption) { fd.append('caption', cut(caption, 1000)); fd.append('parse_mode', 'HTML'); }
    const method = asFile ? 'sendDocument' : ext === '.mp4' && size < SEND_LIMIT ? 'sendVideo' : ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) && size < 10e6 ? 'sendPhoto' : 'sendDocument';
    const field = { sendVideo:'video', sendPhoto:'photo', sendDocument:'document' }[method];
    if (method === 'sendVideo') fd.append('supports_streaming', 'true');
    if (method === 'sendDocument') fd.append('disable_content_type_detection', 'true');
    fd.append(field, new Blob([fs.readFileSync(file)]), name);
    return tg(method, fd, 300e3);
  }

  // the materials of a result, the way Ilia asked: pictures and carousel slides — an album in their order (up to 20),
  // videos (up to 3), PDF / PPTX / DOCX — as files (up to 5); the rest — «📎 Файлы» or the app
  async function materials(v, k) {
    const r = v.result;
    const files = r.files.map(f => ({ ...f, abs:desk.resultFile(v.id, f.path) })).filter(f => f.abs);
    const title = esc(cut(v.route?.title || '', 900));
    const imgs = files.filter(f => IMG.test(f.path) && f.size <= PHOTO).sort((a, b) => natural(a.path, b.path)).slice(0, 20);
    const vids = files.filter(f => VID.test(f.path)).sort((a, b) => (b.path === r.main) - (a.path === r.main)).slice(0, 3);
    const docs = files.filter(f => DOC.test(f.path) || (IMG.test(f.path) && f.size > PHOTO)).slice(0, 5);
    let first = true;
    const caption = () => (first ? (first = false, title) : '');
    for (let i = 0; i < imgs.length; i += 10) {
      const part = imgs.slice(i, i + 10);
      if (part.length === 1) { await sendFile(k, part[0].abs, caption(), { disable_notification:true }); continue; }
      const fd = new FormData(), cap = caption();
      for (const [a, b] of Object.entries({ ...where(k), disable_notification:true })) fd.append(a, String(b));
      fd.append('media', JSON.stringify(part.map((f, n) => ({ type:'photo', media:`attach://f${n}`, ...(n === 0 && cap ? { caption:cap, parse_mode:'HTML' } : {}) }))));
      for (const [n, f] of part.entries()) fd.append(`f${n}`, new Blob([fs.readFileSync(f.abs)]), path.basename(f.path));
      await tg('sendMediaGroup', fd, 300e3);
    }
    for (const f of [...vids, ...docs]) await sendFile(k, f.abs, caption(), { disable_notification:true });
    const sent = imgs.length + vids.length + docs.length, rest = r.files.length - sent - r.files.filter(f => /\.html?$/i.test(f.path)).length;
    if (sent && (imgs.length || vids.length || rest > 0)) await quiet(send(k, `${rest > 0 ? `Ещё ${rest} ${plural(rest)}. ` : ''}Это превью — Telegram сжимает картинки и видео. Оригиналы в лучшем качестве, каждый слайд и ролик отдельным файлом — кнопка «📎 Файлы» или напишите «файлом» ответом на карточку.`, { disable_notification:true }));
    return sent;
  }

  /* ----- cards ----- */

  const chains = new Map();   // one sync at a time per task
  function sync(id, force = false) {
    const prev = chains.get(id) || Promise.resolve();
    const next = prev.then(() => syncNow(id, force)).catch(e => console.error('telegram card:', e.message));
    chains.set(id, next);
    next.finally(() => { if (chains.get(id) === next) chains.delete(id); });
    return next;
  }
  async function dropCard(c) {
    for (const mid of [c.mid, ...(c.extra || [])].filter(Boolean)) await quiet(tg('deleteMessage', { chat_id:c.chat, message_id:mid }));
  }
  async function syncNow(id, force) {
    const v = desk.get(id);
    if (!v) return;
    const c = st.cards[id], k = topicOf(v), sig = sigOf(v), text = cardText(v, site), kb = cardKeyboard(v, { site, webApp:!grouped() });
    const sameChat = c && String(c.chat) === String(chatId());
    if (c && sameChat && c.topic === k && !force) {
      if (c.sig === sig && (v.status !== 'work' || Date.now() - (c.at || 0) < WORK_EDIT_MS)) return;
      if (c.text === text && c.sig === sig) return;
      let edited = false;
      try { await tg('editMessageText', { chat_id:c.chat, message_id:c.mid, text, parse_mode:'HTML', disable_web_page_preview:true, reply_markup:kb }); edited = true; }
      catch (e) { edited = /not modified/i.test(e.message); if (!edited) console.error('telegram edit:', e.message); }
      if (edited) { Object.assign(c, { sig, text, at:Date.now() }); save(); return; }
    }
    // a new place (or a new card): the old one goes, the new one comes with a notification
    if (c) await dropCard(c);
    const extra = [];
    let sentVersion = c?.sent || 0;
    // a result to check: its materials come right before the card, once per version (pictures and slides — an album in
    // order, videos, documents); in a group — into «Материалы», so they stay there when the card moves on
    if (v.status === 'review' && v.result && !v.routine && c?.sent !== v.result.version) {
      await quiet(materials(v, grouped() && st.topics.files ? 'files' : k));
      sentVersion = v.result.version;
    }
    const m = await tg('sendMessage', { ...where(k), text, parse_mode:'HTML', disable_web_page_preview:true, reply_markup:kb, ...(k === 'done' || k === 'work' ? { disable_notification:true } : {}) });
    remember(m.message_id, id);
    st.cards[id] = { chat:chatId(), mid:m.message_id, topic:k, sig, text, at:Date.now(), extra, since:k === 'inbox' ? Date.now() : 0, reminded:0, sent:sentVersion };
    save(); pultLater();
  }
  // a menu inside the card (snooze times, cancel confirmation) — the same message, other buttons
  async function cardMode(id, mode) {
    const v = desk.get(id), c = st.cards[id];
    if (!v || !c) return;
    await quiet(tg('editMessageReplyMarkup', { chat_id:c.chat, message_id:c.mid, reply_markup:cardKeyboard(v, { mode, site, webApp:!grouped() }) }));
  }

  /* ----- the pinned control panel and lists ----- */

  function counts() {
    const all = desk.all(), open = all.filter(v => !['done', 'cancelled', 'error'].includes(v.status));
    return { all, wait:open.filter(v => ['question', 'review'].includes(v.status) && !v.snoozed && !v.routine), snoozed:open.filter(v => v.snoozed),
      work:open.filter(v => ['work', 'routing'].includes(v.status)), queued:open.filter(v => v.status === 'queued'), paused:open.filter(v => v.status === 'paused'),
      errors:all.filter(v => v.status === 'error' && Date.now() - Date.parse(v.updated) < 7 * 864e5) };
  }
  function pultText() {
    const n = counts();
    return [`🏢 <b>Офис · пульт</b>`, '',
      `📥 Ждут вас: <b>${n.wait.length}</b>${n.snoozed.length ? ` · отложено ${n.snoozed.length}` : ''}`,
      `⚙️ В работе: <b>${n.work.length}</b> · в очереди ${n.queued.length} · на паузе ${n.paused.length}`,
      n.errors.length ? `⚠️ Ошибки за неделю: <b>${n.errors.length}</b>` : '',
      '', `<i>Задача — просто напишите или наговорите сюда. Ответ, правка — ответом на карточку.</i>`].filter((x, i, a) => x || a[i - 1]).join('\n');
  }
  const pultKb = () => {
    const n = counts();
    return { inline_keyboard:[[B(`📥 Ждут меня (${n.wait.length})`, 'l:wait'), B(`⚙️ В работе (${n.work.length + n.queued.length + n.paused.length})`, 'l:work')],
      [B('➕ Новая задача', 'new'), B('🔄 Обновить', 'pult'), ...(n.errors.length ? [B(`⚠️ ${n.errors.length}`, 'l:err')] : [])],
      ...(site ? [[grouped() ? { text:'📱 Приложение', url:`${site}/app/` } : { text:'📱 Приложение', web_app:{ url:`${site}/app/` } }, { text:'🏢 3D-офис', url:site }]] : [])] };
  };
  let pultTimer = null;
  const pultLater = () => { clearTimeout(pultTimer); pultTimer = setTimeout(() => quiet(pultNow()), 4000); };
  async function pultNow(fresh = false) {
    const text = pultText();
    if (st.pult && !fresh && String(st.pult.chat) === String(chatId())) {
      if (st.pult.text === text) return quiet(tg('editMessageReplyMarkup', { chat_id:st.pult.chat, message_id:st.pult.mid, reply_markup:pultKb() }));
      const ok = await quiet(tg('editMessageText', { chat_id:st.pult.chat, message_id:st.pult.mid, text, parse_mode:'HTML', reply_markup:pultKb() }));
      if (ok) { st.pult.text = text; save(); return; }
    }
    if (st.pult) await quiet(tg('deleteMessage', { chat_id:st.pult.chat, message_id:st.pult.mid }));
    const m = await tg('sendMessage', { chat_id:chatId(), text, parse_mode:'HTML', reply_markup:pultKb(), disable_notification:true });
    st.pult = { chat:chatId(), mid:m.message_id, text };
    save();
    await quiet(tg('pinChatMessage', { chat_id:chatId(), message_id:m.message_id, disable_notification:true }));
  }
  async function list(kind, thread) {
    const n = counts(), items = kind === 'wait' ? [...n.wait, ...n.snoozed] : kind === 'err' ? n.errors : [...n.work, ...n.queued, ...n.paused];
    const head = kind === 'wait' ? '📥 Ждут вас' : kind === 'err' ? '⚠️ Ошибки' : '⚙️ В работе, в очереди и на паузе';
    const kb = { inline_keyboard:items.slice(0, 20).map(v => [B(cut(`${ICON[v.status]} ${v.route?.title || v.text}${v.snoozed ? ' ⏰' : ''}`, 60), `c:${v.id}`)]) };
    return tg('sendMessage', { chat_id:chatId(), ...(thread ? { message_thread_id:thread } : {}), text:items.length ? `${head} — нажмите, чтобы поднять карточку:` : `${head}: пусто.`, reply_markup:kb, disable_notification:true });
  }

  /* ----- incoming ----- */

  const say = (m, text, extra = {}) => tg('sendMessage', { chat_id:m.chat.id, ...(m.message_thread_id && m.chat.is_forum ? { message_thread_id:m.message_thread_id } : {}), text, parse_mode:'HTML', disable_web_page_preview:true, reply_parameters:{ message_id:m.message_id, allow_sending_without_reply:true }, ...extra });
  const result = (m, r, okText) => r.error ? say(m, `⚠️ ${esc(r.error)}`) : okText ? say(m, okText, { disable_notification:true }) : null;

  async function download(fileId, size, name) {
    if (size && size > GET_LIMIT) throw Object.assign(new Error('big'), { big:true });
    const f = await tg('getFile', { file_id:fileId });
    const r = await fetch(`${apiBase()}/file/bot${token}/${f.file_path}`, { signal:AbortSignal.timeout(120e3) });
    if (!r.ok) throw new Error('download ' + r.status);
    return { buf:Buffer.from(await r.arrayBuffer()), name:name || path.basename(f.file_path) };
  }
  // files of a message → desk uploads
  async function takeFiles(m) {
    const doc = m.document || m.video || m.animation || (m.photo ? m.photo.at(-1) : null);
    if (!doc) return [];
    const ext = m.photo ? '.jpg' : m.video ? '.mp4' : '';
    const name = m.document?.file_name || m.video?.file_name || `${m.photo ? 'foto' : 'video'}-${m.message_id}${ext}`;
    const { buf } = await download(doc.file_id, doc.file_size, name);
    return [desk.putUpload(name, buf)];
  }
  async function voiceText(m) {
    const a = m.voice || m.audio || m.video_note;
    if (!a) return '';
    if (!voiceConfigured()) throw new Error('Голос не подключён (ключ ElevenLabs).');
    const { buf } = await download(a.file_id, a.file_size);
    return transcribe(buf, m.voice ? 'audio/ogg' : m.video_note ? 'video/mp4' : a.mime_type || 'audio/mpeg');
  }
  const draftKey = m => `${m.chat.id}:${m.message_thread_id || 0}`;
  function takeDraft(m) {
    const d = drafts.get(draftKey(m));
    drafts.delete(draftKey(m));
    return d && Date.now() - d.at < 3600e3 ? d.uploads : [];
  }

  // the action of a reply / prompt to a task, by its status
  async function onTaskText(m, id, text, uploads, how = '') {
    const v = desk.get(id);
    if (!v) return say(m, 'Этой задачи уже нет на столе.');
    const ids = uploads.map(u => u.id);
    if (how === 'down') return result(m, desk.act(id, 'approve', text, 'down'), '👎 Принято с замечанием — агент учтёт его в следующих задачах.');
    if (v.status === 'question' || how === 'answer') return result(m, desk.act(id, 'answer', text, '', { uploads:ids }), '↩️ Ответ передан.');
    if (['review', 'done'].includes(v.status) || how === 'revise') return result(m, desk.act(id, 'revise', text, '', { uploads:ids }), '✏️ Правка ушла агенту.');
    return say(m, `Задача сейчас «${esc(v.statusText)}» — ответ или правку можно дать, когда она спросит или принесёт результат.`);
  }

  async function onMessage(m) {
    if (!m.from || !isOwner(m.from.id)) {
      if (m.chat.type === 'private') await quiet(say(m, 'Это личный пульт офиса — он отвечает только владельцу.'));
      return;
    }
    const text0 = String(m.text || m.caption || '').trim(), cmd = /^\/(\w+)(?:@\w+)?\s*([\s\S]*)$/.exec(text0);
    if (cmd) return command(m, cmd[1].toLowerCase(), cmd[2].trim());
    if (grouped() && String(m.chat.id) !== String(st.chat) && m.chat.type !== 'private') return;

    let text = text0, uploads = [], heard = false;
    try {
      if (m.voice || m.audio || m.video_note) {
        text = await voiceText(m); heard = true;
        if (!text) return say(m, 'Не расслышал — запишите ещё раз.');
      }
      uploads = await takeFiles(m);
    } catch (e) {
      return say(m, e.big ? '⚠️ Файл больше 20 МБ — Telegram не отдаёт такие боту. Загрузите его в офисе (кнопка «Открыть» → материалы).' : `⚠️ ${esc(e.message)}`);
    }
    const reply = m.reply_to_message?.message_id, prompt = reply && st.prompts[reply];
    const target = prompt?.id || (reply && st.msgs[reply]);
    if (heard) await quiet(say(m, `🎙 <i>${esc(cut(text, 900))}</i>`, { disable_notification:true }));

    if (target) {
      if (prompt) delete st.prompts[reply];
      if (!text && uploads.length) {
        const d = drafts.get(draftKey(m)) || { uploads:[], at:Date.now() };
        d.uploads.push(...uploads); d.at = Date.now(); drafts.set(draftKey(m), d);
        return say(m, '📎 Файл принят. Теперь напишите или наговорите ответ / правку ответом на карточку — приложу файл к нему.');
      }
      if (!prompt && !uploads.length && wantsFiles(text)) { if (desk.get(target)?.result?.files?.length) return files(target); }
      return onTaskText(m, target, text, [...takeDraft(m), ...uploads], prompt?.how || '');
    }
    const thread = m.message_thread_id;
    if (grouped() && thread && thread === st.topics.twin || !grouped() && /^(двойник|двойнику)[,:\s]/i.test(text)) return twin(m, text.replace(/^(двойник|двойнику)[,:\s]+/i, ''), heard, uploads);
    if (!text && uploads.length) {
      const d = drafts.get(draftKey(m)) || { uploads:[], at:Date.now() };
      d.uploads.push(...uploads); d.at = Date.now(); drafts.set(draftKey(m), d);
      return say(m, `📎 Сохранил: ${d.uploads.map(u => esc(u.name)).join(', ')}. Напишите или наговорите задачу — приложу ${d.uploads.length > 1 ? 'их' : 'его'}.`);
    }
    if (!text) return;
    // a new task: one tap to confirm — nothing goes to agents by accident
    const key = Math.random().toString(36).slice(2, 10), all = [...takeDraft(m), ...uploads];
    pendingNew.set(key, { text, uploads:all, at:Date.now() });
    for (const [k, p] of pendingNew) if (Date.now() - p.at > 86400e3) pendingNew.delete(k);
    return say(m, `Поставить задачу офису?\n\n«${esc(cut(text, 1500))}»${all.length ? `\n📎 ${all.map(u => esc(u.name)).join(', ')}` : ''}`,
      { reply_markup:{ inline_keyboard:[[B('▶️ Поставить', `nt:${key}`), B('🔗 Рилс под ключ', `ntp:${key}:reel`)], [B('💬 Спросить двойника', `nw:${key}`), B('✖️ Не надо', `nx:${key}`)]] } });
  }

  async function command(m, c, arg) {
    if (c === 'bind') return bind(m);
    if (c === 'start' || c === 'menu' || c === 'pult') { if (m.chat.type === 'private' && !grouped() || String(m.chat.id) === String(st.chat)) { await pultNow(true); return firstSync(); } return say(m, 'Пульт живёт в привязанной группе офиса.'); }
    if (c === 'inbox' || c === 'wait') return list('wait', m.message_thread_id);
    if (c === 'work' || c === 'status') return list('work', m.message_thread_id);
    if (c === 'new' || c === 'task') {
      if (!arg) return say(m, 'Напишите задачу после /new или просто сообщением.');
      const { task } = desk.createTask({ text:arg, uploads:takeDraft(m).map(u => u.id), source:'telegram' });
      return say(m, `🧭 Поставлено: «${esc(cut(arg, 200))}» — карточка придёт в «В работе».`, { disable_notification:true }).then(() => task);
    }
    if (c === 'unbind') { if (String(m.chat.id) !== String(st.chat)) return; st.chat = null; st.topics = {}; save(); await say(m, 'Группа отвязана — пульт снова в личных сообщениях.'); return firstSync(); }
    if (c === 'help') return say(m, HELP);
    return say(m, HELP);
  }
  const HELP = ['<b>Пульт офиса в Telegram</b>', '',
    '• Новая задача — просто напишите или наговорите голосовое. Файлы — прикрепите или пришлите до текста.',
    '• Ответ на вопрос, правка — ответом на карточку задачи (текст, голос, файлы).',
    '• Кнопки карточки: принять, оценить, правка, файлы, пауза, отложить, срочно, отменить, повторить.',
    '• Двойник — в ветке «🎙 Двойник» (в личке — начните с «Двойник, …»): отвечает голосом на голос.',
    '• /inbox — что ждёт вас, /work — что в работе, /pult — пульт, /bind — привязать группу с ветками.'].join('\n');

  async function bind(m) {
    if (m.chat.type !== 'supergroup' || !m.chat.is_forum) return say(m, 'Привязать можно группу с включёнными «Темами»: настройки группы → Темы. Затем добавьте меня админом (управление темами, закрепление, удаление сообщений) и напишите /bind.');
    const same = String(st.chat) === String(m.chat.id);
    st.chat = m.chat.id;
    if (!same) st.topics = {};
    const made = [];
    for (const T of TOPICS) {
      if (st.topics[T.k]) continue;
      try { const r = await tg('createForumTopic', { chat_id:m.chat.id, name:T.name, icon_color:T.color }); st.topics[T.k] = r.message_thread_id; made.push(T.name); }
      catch (e) { save(); return say(m, `⚠️ Не могу создать ветки: ${esc(e.message)}. Дайте мне право «Управление темами».`); }
    }
    // the old cards stay where they were (private chat); the open tasks come here
    st.cards = Object.fromEntries(Object.entries(st.cards).filter(([, c]) => String(c.chat) === String(st.chat)));
    save();
    await say(m, made.length ? `Готово — создал ветки: ${made.join(', ')}. Задачи, вопросы и результаты теперь приходят сюда.` : 'Группа уже привязана — обновил пульт.');
    await pultNow(true);
    return firstSync();
  }
  // the open tasks get their cards (on /start and after /bind); closed ones are not resent
  async function firstSync() {
    for (const v of desk.all().filter(v => !['done', 'cancelled'].includes(v.status) && !(v.status === 'error' && Date.now() - Date.parse(v.updated) > 3 * 864e5)).reverse()) await sync(v.id);
  }

  async function twin(m, text, heard, uploads) {
    if (!text) return say(m, 'Напишите или наговорите, что спросить у двойника.');
    await quiet(tg('sendChatAction', { chat_id:m.chat.id, ...(m.message_thread_id ? { message_thread_id:m.message_thread_id } : {}), action:heard ? 'record_voice' : 'typing' }));
    let reply = '';
    try { reply = await ask(text, { voice:heard, uploads }); }
    catch (e) { return say(m, `⚠️ ${esc(e.message || 'Двойник не ответил — попробуйте ещё раз.')}`); }
    if (!reply) return say(m, 'Двойник промолчал — попробуйте сформулировать иначе.');
    await say(m, esc(cut(plain(reply), 4000)));
    if (heard && voiceConfigured()) {
      try {
        const v = await ownerVoice();
        if (v) {
          const r = await speak(v.id, cut(plain(reply), 800)), buf = Buffer.from(await r.arrayBuffer());
          const fd = new FormData();
          fd.append('chat_id', String(m.chat.id));
          if (m.message_thread_id && m.chat.is_forum) fd.append('message_thread_id', String(m.message_thread_id));
          fd.append('audio', new Blob([buf], { type:'audio/mpeg' }), 'dvoinik.mp3'); fd.append('title', 'Двойник');
          await tg('sendAudio', fd, 120e3);
        }
      } catch (e) { console.error('telegram tts:', e.message); }
    }
  }

  async function onCallback(q) {
    const answer = (text = '', alert = false) => quiet(tg('answerCallbackQuery', { callback_query_id:q.id, text, show_alert:alert }));
    if (!isOwner(q.from.id)) return answer('Это пульт владельца офиса.', true);
    const [op, id, arg] = String(q.data || '').split(':'), m = q.message;
    const ack = r => r?.error ? answer(r.error, true) : answer('Готово');
    const promptFor = async (how, text) => {
      const p = await tg('sendMessage', { chat_id:m.chat.id, ...(m.message_thread_id && m.chat.is_forum ? { message_thread_id:m.message_thread_id } : {}), text, parse_mode:'HTML',
        reply_parameters:{ message_id:m.message_id, allow_sending_without_reply:true }, reply_markup:{ force_reply:true, input_field_placeholder:'Текст или голосовое…' } });
      st.prompts[p.message_id] = { id, how, at:Date.now() };
      for (const [k, x] of Object.entries(st.prompts)) if (Date.now() - x.at > 7 * 864e5) delete st.prompts[k];
      save();
      const c = st.cards[id]; if (c) { (c.extra ||= []).push(p.message_id); save(); }
      return answer();
    };
    switch (op) {
      case 'ok': return ack(desk.act(id, 'approve', '', ''));
      case 'okp': return ack(desk.act(id, 'approve', '', '', { publish:false }));
      case 'up': return ack(desk.act(id, 'approve', '', 'up'));
      case 'dn': return promptFor('down', '👎 Что не так? Ответьте текстом или голосом — агент учтёт это в следующих задачах.');
      case 'rv': return promptFor('revise', '✏️ Какую правку внести? Ответьте текстом или голосом, можно с файлами.');
      case 'ans': return promptFor('answer', '✍️ Ваш ответ — текстом или голосом, можно с файлами.');
      case 'o': {
        const v = desk.get(id), o = v?.question?.options?.find(x => x.id === arg);
        if (!o) return answer('Этого варианта уже нет.', true);
        return ack(desk.act(id, 'answer', o.label));
      }
      case 'p': return ack(desk.act(id, 'pause'));
      case 'r': return ack(desk.act(id, 'resume'));
      case 'u': return ack(desk.act(id, 'urgent', '', '', { on:!desk.get(id)?.urgent }));
      case 'z': await cardMode(id, 'snooze'); return answer();
      case 'zz': { const t = snoozeUntil(arg); if (!t) return answer(); const r = desk.act(id, 'snooze', '', '', { until:t.toISOString() }); if (r.error) { await sync(id, true); } return ack(r); }
      case 'x': await cardMode(id, 'cancel'); return answer();
      case 'xx': return ack(desk.act(id, 'cancel'));
      case 'b': await cardMode(id, ''); return answer();
      case 'rt': return ack(desk.act(id, 'retry'));
      case 'f': answer('Отправляю файлы…'); return files(id);
      case 'c': { const c = st.cards[id]; if (c) { await dropCard(c); delete st.cards[id]; } await sync(id, true); return answer(); }
      case 'l': await list(id, m.message_thread_id); return answer();
      case 'pult': await pultNow(); return answer('Обновлено');
      case 'new': await tg('sendMessage', { chat_id:m.chat.id, ...(m.message_thread_id && m.chat.is_forum ? { message_thread_id:m.message_thread_id } : {}), text:'Напишите или наговорите задачу — можно сразу с файлами.', reply_markup:{ force_reply:true, input_field_placeholder:'Что сделать?' } }); return answer();
      case 'nt': case 'ntp': case 'nw': case 'nx': {
        const p = pendingNew.get(id);
        pendingNew.delete(id);
        if (!p) { await quiet(tg('editMessageReplyMarkup', { chat_id:m.chat.id, message_id:m.message_id, reply_markup:{ inline_keyboard:[] } })); return answer('Уже решено.'); }
        if (op === 'nx') { await quiet(tg('deleteMessage', { chat_id:m.chat.id, message_id:m.message_id })); return answer('Не ставлю.'); }
        if (op === 'nw') { await quiet(tg('deleteMessage', { chat_id:m.chat.id, message_id:m.message_id })); answer(); return twin({ ...m, message_id:m.reply_to_message?.message_id || m.message_id }, p.text, false, p.uploads); }
        desk.createTask({ text:p.text, uploads:p.uploads.map(u => u.id), source:'telegram', pipeline:op === 'ntp' ? arg : '' });
        await quiet(tg('deleteMessage', { chat_id:m.chat.id, message_id:m.message_id }));
        return answer('Поставлено — карточка в «В работе».');
      }
    }
    return answer();
  }

  // «📎 Файлы» — every file of the result separately, as a document: the original bytes, no Telegram compression
  // (photos and videos sent as media get re-encoded); the main file first, slides in their order
  async function files(id) {
    const v = desk.get(id);
    if (!v?.result?.files?.length) return send(st.topics.files ? 'files' : '', 'У этой задачи нет файлов.');
    const k = st.topics.files ? 'files' : topicOf(v), main = v.result.main;
    // slides and videos first (the main one ahead), then documents, the page last
    const rank = f => /\.html?$/i.test(f.path) ? 3 : f.path === main ? 0 : IMG.test(f.path) || VID.test(f.path) ? 1 : 2;
    const list = v.result.files.filter(f => !/\.html?$/i.test(f.path) || f.path === main).sort((a, b) => rank(a) - rank(b) || natural(a.path, b.path));
    const all = list.slice(0, FILES_MAX);
    await send(k, `📁 <b>${esc(v.route?.title || v.text)}</b> — ${list.length} ${plural(list.length)} в исходном качестве, каждый отдельно${list.length > FILES_MAX ? ` (первые ${FILES_MAX})` : ''}`);
    for (const [n, f] of all.entries()) {
      const file = desk.resultFile(id, f.path);
      if (file) await quiet(sendFile(k, file, `${all.length > 1 ? `${n + 1}/${all.length} · ` : ''}<code>${esc(f.path)}</code> · ${mb(f.size)}`, { disable_notification:true }, true));
    }
  }

  /* ----- reminders and digests ----- */

  async function tick() {
    const now = Date.now(), h = mskHour();
    if (h >= 9 && h < 22) for (const [id, c] of Object.entries(st.cards)) {
      if (c.topic !== 'inbox') continue;
      const v = desk.get(id);
      if (!v || topicOf(v) !== 'inbox') continue;
      if (now - Math.max(c.since || c.at, c.reminded || 0) < REMIND_MS) continue;
      c.reminded = now; save();
      const hrs = Math.round((now - (c.since || c.at)) / 3600e3);
      const r = await quiet(tg('sendMessage', { chat_id:c.chat, ...(grouped() && st.topics.inbox ? { message_thread_id:st.topics.inbox } : {}), text:`⏰ Ждёт вас ${hrs} ч: <b>${esc(v.route?.title || v.text)}</b>`, parse_mode:'HTML', reply_parameters:{ message_id:c.mid, allow_sending_without_reply:true } }));
      if (r) { (c.extra ||= []).push(r.message_id); save(); }
    }
    for (const [slot, at] of [['am', 9], ['pm', 19]]) {
      if (h !== at || st.digest[slot] === mskDay()) continue;
      st.digest[slot] = mskDay(); save();
      const n = counts(), lines = [];
      const line = v => `• ${esc(cut(v.route?.title || v.text, 80))} — ${esc(v.agent?.name || 'диспетчер')}${v.snoozed ? ' ⏰' : ''}`;
      if (n.wait.length || n.snoozed.length) lines.push(`📥 <b>Ждут вас (${n.wait.length + n.snoozed.length})</b>`, ...[...n.wait, ...n.snoozed].slice(0, 10).map(line));
      if (n.work.length + n.queued.length) lines.push('', `⚙️ <b>В работе и в очереди (${n.work.length + n.queued.length})</b>`, ...[...n.work, ...n.queued].slice(0, 10).map(line));
      if (n.paused.length) lines.push('', `⏸ <b>На паузе (${n.paused.length})</b>`, ...n.paused.slice(0, 10).map(line));
      if (n.errors.length) lines.push('', `⚠️ Ошибки за неделю: ${n.errors.length}`);
      if (!lines.length) continue;
      await quiet(tg('sendMessage', { chat_id:chatId(), text:`${slot === 'am' ? '☀️ Доброе утро' : '🌙 Итог дня'} — что на столе офиса:\n\n${lines.join('\n')}`, parse_mode:'HTML', reply_markup:{ inline_keyboard:[[B('📥 Ждут меня', 'l:wait'), B('⚙️ В работе', 'l:work')]] } }));
    }
  }

  /* ----- start ----- */

  // the earlier bot of the office (#219/#226) kept its cards in DATA_DIR/desk/tg.json: its messages go, the open tasks get cards here
  async function migrate() {
    const old = path.join(dataDir, 'desk', 'tg.json');
    if (st.migrated || !fs.existsSync(old)) return;
    st.migrated = true; save();
    let o = {};
    try { o = JSON.parse(fs.readFileSync(old, 'utf8')); } catch {}
    if (o.offset > st.offset) st.offset = o.offset;
    for (const c of Object.values(o.cards || {})) if (c?.msg) await quiet(tg('deleteMessage', { chat_id:owners[0], message_id:c.msg }));
    await pultNow(true);
    await firstSync();
  }

  let running = true, conflicts = 0;
  const off = desk.onChange(t => { sync(t.id); pultLater(); });
  async function loop() {
    try {
      const me = await tg('getMe'); st.me = me.username || ''; save();
      // a token with a webhook belongs to another bot (Office Worker, ai-hub…): polling it would take that bot down — stop
      const hook = await tg('getWebhookInfo', {});
      if (hook.url) { console.error(`telegram: @${st.me} has a webhook (${hook.url.replace(/\/\/([^/]+).*/, '//$1')}) — it is another bot; give the office its own bot (HQ_TG_BOT_TOKEN). Off.`); running = false; off(); return; }
      await quiet(tg('setMyCommands', { commands:[{ command:'pult', description:'Пульт офиса' }, { command:'inbox', description:'Что ждёт меня' }, { command:'work', description:'Что в работе' },
        { command:'new', description:'Новая задача' }, { command:'bind', description:'Привязать группу с ветками' }, { command:'help', description:'Как пользоваться' }] }));
      // the menu button opens the mini app «Офис» (app/index.html), HQ_TG_MINIAPP_URL — another address
      const app = (process.env.HQ_TG_MINIAPP_URL || (site ? `${site}/app/` : '')).trim();
      if (app) for (const o of owners) await quiet(tg('setChatMenuButton', { chat_id:Number(o), menu_button:{ type:'web_app', text:'Офис', web_app:{ url:app } } }));
      await migrate();
      console.log(`telegram: @${st.me} · ${grouped() ? 'group ' + st.chat : 'private chat'}`);
    } catch (e) { console.error('telegram start:', e.message); }
    while (running) {
      try {
        const ups = await tg('getUpdates', { offset:st.offset, timeout:50, allowed_updates:['message', 'callback_query'] }, 65e3);
        for (const u of ups) {
          st.offset = u.update_id + 1; save();
          try { if (u.callback_query) await onCallback(u.callback_query); else if (u.message) await onMessage(u.message); }
          catch (e) { console.error('telegram update:', e.message); }
        }
      } catch (e) {
        console.error('telegram poll:', e.message);
        if (/Conflict/.test(e.message) && ++conflicts >= 10) { console.error('telegram: another process polls this bot — give the office its own bot (HQ_TG_BOT_TOKEN). Off.'); running = false; off(); return; }
        await new Promise(r => setTimeout(r, /Conflict/.test(e.message) ? 30e3 : 5e3));
      }
    }
  }
  loop();
  const timer = setInterval(() => quiet(tick()), 5 * 60e3); timer.unref();
  return { stop:() => { running = false; off(); clearInterval(timer); }, sync, state:() => st, sendFiles:files };
}
