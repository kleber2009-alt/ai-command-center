/* Telegram of the owner for the working desk: a message when a task needs him (a question, a result to check,
   an error) — with buttons right in the chat.

     HQ_NOTIFY_TG_TOKEN + HQ_NOTIFY_TG_CHAT   the bot and the owner's chat (assistant.env, written by the deploy)
     HQ_NOTIFY_TG_OWN=1                       the bot is the office's own (secret HQ_NOTIFY_TG_BOT_TOKEN): the desk
                                              listens to it (getUpdates) — buttons «Принять», «Правка», style and
                                              approval options, «Ответить»; a plain message to the bot is a new task.
                                              A voice message (or audio, video note) is heard through ElevenLabs Scribe
                                              (ELEVENLABS_API_KEY, voice.mjs) and goes on as if it were typed: a reply
                                              to «Что поправить?» — or straight to the result card — is a revision,
                                              to a question — an answer, otherwise a new task.
                                              Without it the bot is shared with another service that listens to it
                                              itself, so the messages carry only the «Открыть в офисе» link.

   Only the owner's chat is heard; everything else is ignored. */
import fs from 'node:fs';
import path from 'node:path';
import { voiceConfigured, transcribe as scribe } from './voice.mjs';

const API = 'https://api.telegram.org/bot';
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// the report without markdown: headings and the «Материалы» section off, first lines only
function plain(md, max = 700) {
  const out = [];
  let skip = false;
  for (const line of String(md || '').split('\n')) {
    const h = line.match(/^#{1,4}\s*(.*)/);
    if (h) { skip = /^Материал/i.test(h[1]); continue; }
    if (skip || !line.trim()) continue;
    out.push(line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/^\s*[-*•]\s+/, '• ').trim());
  }
  const s = out.join('\n');
  return s.length > max ? s.slice(0, max).replace(/\s+\S*$/, '') + '…' : s;
}
const money = u => u && (u.ms || u.cost) ? `${Math.max(1, Math.round(u.ms / 60000))} мин${u.cost ? ` · $${u.cost.toFixed(2).replace('.', ',')}` : ''}` : '';

export function createTelegram({ token, chat, own, publicUrl, dataDir, act, get, createTask, log = console,
  transcribe = voiceConfigured() ? scribe : null }) {
  const on = Boolean(token && chat);
  const FILE = path.join(dataDir, 'tg.json');
  let st = { offset:0, replies:{} };   // replies: message id of a «reply here» prompt → { id, kind }
  try { st = { ...st, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch {}
  const keep = () => {
    const ids = Object.keys(st.replies);
    for (const k of ids.slice(0, Math.max(0, ids.length - 200))) delete st.replies[k];
    try { fs.writeFileSync(FILE + '.tmp', JSON.stringify(st)); fs.renameSync(FILE + '.tmp', FILE); } catch {}
  };

  async function call(method, body) {
    const r = await fetch(API + token + '/' + method, { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify(body), signal:AbortSignal.timeout(method === 'getUpdates' ? 70e3 : 20e3) });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) throw Object.assign(new Error(`${method}: ${j.description || r.status}`), { code:j.error_code || r.status });
    return j.result;
  }
  const link = id => ({ text:'Открыть в офисе', url:`${publicUrl}/#desk-${id}` });

  /* ---------- the message about a task ---------- */

  function message(v) {
    const who = v.agent?.name || 'Диспетчер', title = esc(v.route?.title || v.text.slice(0, 80)), q = v.question;
    const cost = money(v.usage), qa = v.qa?.verdict === 'ok' ? 'проверено контролёром' : v.qa?.verdict === 'fix' ? 'доработано по замечаниям контролёра' : '';
    const foot = [cost, qa].filter(Boolean).join(' · ');
    let head, body = '', rows = [];
    if (v.status === 'question' && q?.from === 'approval') {
      head = `🟠 «${esc(who)}» ждёт разрешения`;
      body = (v.approval?.actions || []).map((x, i) => `${i + 1}. ${esc(x)}`).join('\n') + '\n\nБез вашего «Выполнить» во внешних системах ничего не меняется.';
    } else if (v.status === 'question') {
      head = q?.from === 'style' ? `🎨 Выберите стиль — «${esc(who)}» начнёт сразу` : q?.from === 'agent' ? `❓ «${esc(who)}» спрашивает` : '❓ Диспетчер уточняет';
      body = esc(q?.text || '');
    } else if (v.status === 'review') {
      head = `✅ «${esc(who)}» принёс результат`;
      body = esc(plain(v.result?.summary));
    } else if (v.status === 'error') {
      head = `⚠️ «${esc(who)}»: не получилось`;
      body = esc(v.error || '');
    } else return null;
    if (v.alerts) {
      const crit = v.alerts.critical || [], warn = v.alerts.warn || [];
      if (crit.length || warn.length) { head = crit.length ? `🔴 ${esc(who)}: срочно` : `🟡 ${esc(who)}: скоро продлить`; body = [...crit.map(x => '• ' + esc(x)), ...warn.map(x => '◦ ' + esc(x))].join('\n'); }
    }
    if (own) {
      if (v.status === 'question' && q?.options?.length) rows = q.options.map(o => [{ text:o.label, callback_data:`op:${v.id}:${o.id}` }]);
      if (v.status === 'question' && q?.from !== 'approval') rows.push([{ text:'💬 Ответить своими словами', callback_data:`an:${v.id}` }]);
      if (v.status === 'review') rows = [[{ text:'✅ Принять', callback_data:`ap:${v.id}` }, { text:'👍 Отлично', callback_data:`up:${v.id}` }], [{ text:'✏️ Правка', callback_data:`rv:${v.id}` }]];
      if (v.status === 'error') rows = [[{ text:'🔁 Повторить', callback_data:`rt:${v.id}` }]];
    }
    rows.push([link(v.id)]);
    const text = `${head}\n<b>${title}</b>${body ? '\n\n' + body : ''}${foot ? `\n\n<i>${esc(foot)}</i>` : ''}`;
    return { text:text.slice(0, 4000), reply_markup:{ inline_keyboard:rows } };
  }

  async function notify(v) {
    if (!on) return;
    const m = message(v);
    if (!m) return;
    try {
      const r = await call('sendMessage', { chat_id:chat, parse_mode:'HTML', disable_web_page_preview:true, ...m });
      // a reply (text or voice) straight to the card works like the button: a revision of a result, an answer to a question
      const kind = v.status === 'review' ? 'revise' : v.status === 'question' && v.question?.from !== 'approval' ? 'answer' : '';
      if (own && kind && r?.message_id) { st.replies[r.message_id] = { id:v.id, kind }; keep(); }
    }
    catch (e) { log.error('tg notify:', e.message); }
  }

  /* ---------- buttons and replies (own bot only) ---------- */

  async function ask(id, kind, prompt) {
    const r = await call('sendMessage', { chat_id:chat, text:prompt, reply_markup:{ force_reply:true, input_field_placeholder:kind === 'revise' ? 'Что поправить' : 'Ваш ответ' } });
    st.replies[r.message_id] = { id, kind }; keep();
  }
  async function onCallback(cq) {
    const [k, id, arg] = String(cq.data || '').split(':');
    const done = (text, alert = false) => call('answerCallbackQuery', { callback_query_id:cq.id, text, show_alert:alert }).catch(() => {});
    const strip = () => cq.message && call('editMessageReplyMarkup', { chat_id:chat, message_id:cq.message.message_id, reply_markup:{ inline_keyboard:[[link(id)]] } }).catch(() => {});
    if (k === 'an') { await ask(id, 'answer', 'Ответьте на это сообщение текстом или голосом.'); return done('Жду ответ'); }
    if (k === 'rv') { await ask(id, 'revise', 'Что поправить? Ответьте на это сообщение текстом или голосом — агент поправит в той же сессии.'); return done('Жду правку'); }
    let r;
    if (k === 'ap' || k === 'up') r = act(id, 'approve', '', k === 'up' ? 'up' : '');
    else if (k === 'rt') r = act(id, 'retry');
    else if (k === 'op') {
      const opt = (get(id)?.question?.options || []).find(o => o.id === arg);
      r = opt ? act(id, 'answer', opt.label) : { error:'Вопрос уже закрыт — откройте задачу в офисе.' };
    } else return done('Неизвестная кнопка');
    if (r?.error) return done(r.error, true);
    await strip();
    return done(k === 'ap' || k === 'up' ? 'Принято — в истории офиса' : k === 'rt' ? 'Снова в очереди' : 'Передал агенту');
  }
  // a voice message, an audio or a video note → text (ElevenLabs Scribe); '' when there is nothing to hear
  async function hear(m) {
    const f = m.voice || m.audio || m.video_note;
    if (!f) return '';
    if (!transcribe) throw new Error('распознавание голоса не настроено (нет ELEVENLABS_API_KEY) — напишите текстом');
    if (f.file_size > 20e6) throw new Error('запись больше 20 МБ — Telegram не отдаёт такие боту');
    const { file_path } = await call('getFile', { file_id:f.file_id });
    const r = await fetch(`${API.replace(/bot$/, 'file/bot')}${token}/${file_path}`, { signal:AbortSignal.timeout(60e3) });
    if (!r.ok) throw new Error(`не скачал запись (${r.status})`);
    const mime = f.mime_type || (m.video_note ? 'video/mp4' : 'audio/ogg');
    return String(await transcribe(Buffer.from(await r.arrayBuffer()), mime) || '').trim();
  }
  async function onMessage(m) {
    let text = String(m.text || m.caption || '').trim(), heard = false;
    if (!text && (m.voice || m.audio || m.video_note)) {
      try { text = await hear(m); heard = true; }
      catch (e) { log.error('tg voice:', e.message); return call('sendMessage', { chat_id:chat, text:`Не разобрал голосовое: ${e.message}`, reply_to_message_id:m.message_id }).catch(() => {}); }
      if (!text) return call('sendMessage', { chat_id:chat, text:'В голосовом не услышал слов — повторите или напишите текстом.', reply_to_message_id:m.message_id }).catch(() => {});
    }
    if (!text) return;
    const said = heard ? `\n\n🎙 «${text.length > 600 ? text.slice(0, 600).replace(/\s+\S*$/, '') + '…' : text}»` : '';
    const to = m.reply_to_message && st.replies[m.reply_to_message.message_id];
    if (to) {
      const r = act(to.id, to.kind, text);
      if (!r?.error) { delete st.replies[m.reply_to_message.message_id]; keep(); }
      return call('sendMessage', { chat_id:chat, text:(r?.error ? `Не получилось: ${r.error}` : to.kind === 'revise' ? 'Правка ушла агенту ✍️' : 'Ответ передан ✅') + said, reply_to_message_id:m.message_id }).catch(() => {});
    }
    if (text === '/start' || text === '/help') return call('sendMessage', { chat_id:chat, text:'Я пишу, когда задаче нужен ваш ответ, готов результат или что-то сломалось. Кнопки под сообщением — принять, поправить, выбрать стиль или разрешить действие. Напишите задачу обычным сообщением или скажите голосом — поставлю её агентам офиса. Правку и ответ тоже можно голосом — ответом на сообщение.' }).catch(() => {});
    // a plain message from the owner is a new task for the office
    const { task } = createTask({ text, source:'telegram' });
    return call('sendMessage', { chat_id:chat, text:'Задача поставлена — диспетчер выбирает агента. Напишу, когда понадобится ваш ответ или будет готов результат.' + said,
      reply_to_message_id:m.message_id, reply_markup:{ inline_keyboard:[[link(task.id)]] } }).catch(() => {});
  }

  let stopped = false, lastErr = null;
  async function poll() {
    while (!stopped) {
      try {
        const ups = await call('getUpdates', { offset:st.offset, timeout:50, allowed_updates:['message', 'callback_query'] });
        for (const u of ups) {
          st.offset = u.update_id + 1;
          const from = String(u.callback_query?.message?.chat?.id ?? u.message?.chat?.id ?? '');
          if (from !== String(chat)) continue;   // only the owner's chat
          try { if (u.callback_query) await onCallback(u.callback_query); else if (u.message) await onMessage(u.message); }
          catch (e) { log.error('tg update:', e.message); }
        }
        lastErr = null;
        if (ups.length) keep();
      } catch (e) {
        // 409: someone else reads the bot too — the old container during a deploy (passes in a minute) or a webhook;
        // 401: the token is wrong — stop. Logged once per kind, not every retry.
        if (e.code === 401) { log.error('tg poll: the bot token is not valid — buttons off'); stopped = true; break; }
        if (lastErr !== e.code) { log.error('tg poll:', e.message); lastErr = e.code; }
        await new Promise(r => setTimeout(r, e.code === 409 ? 20e3 : 10e3));
        continue;
      }
    }
  }
  if (on && own) poll();

  return { on, own:on && own, notify, message, stop:() => { stopped = true; } };
}
