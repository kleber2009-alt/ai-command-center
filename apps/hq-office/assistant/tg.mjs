/* Telegram of the owner for the working desk: one card per task in the chat, kept up to date in place, and the
   finished materials right in the chat — pictures and carousel slides as an album, videos as videos,
   presentations and documents as files.

     HQ_NOTIFY_TG_TOKEN + HQ_NOTIFY_TG_CHAT   the bot and the owner's chat (assistant.env, written by the deploy)
     HQ_NOTIFY_TG_OWN=1                       the bot is the office's own (secret HQ_NOTIFY_TG_BOT_TOKEN): the desk
                                              listens to it (getUpdates) — buttons «Принять», «Правка», style and
                                              approval options, «Ответить»; a plain message to the bot is a new task;
                                              the menu button «Офис» opens the mini app (PUBLIC_URL/app/).
                                              Without it the bot is shared with another service that listens to it
                                              itself, so the cards carry only the «Открыть в офисе» link.

   The card of a task: while it is in work — a quiet message edited in place (status, agent, stage); when it needs the
   owner (a question, a result, an error) — the old card goes, the materials come, then a new card with the buttons
   (that one makes a sound); when it is accepted — the card turns final, without buttons.
   Only the owner's chat is heard; everything else is ignored. */
import fs from 'node:fs';
import path from 'node:path';

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
const ATTN = ['question', 'review', 'error'], FINAL = ['done', 'cancelled'];
// the Bot API takes up to 50 MB per upload, a photo up to 10 MB
const MB = 1024 * 1024, LIMIT = 50 * MB, PHOTO = 10 * MB;
const IMG = /\.(jpe?g|png|webp)$/i, VID = /\.(mp4|mov|m4v|webm)$/i, DOC = /\.(pdf|pptx?|docx?|xlsx?|key|csv|zip)$/i;
const natural = (a, b) => a.localeCompare(b, 'ru', { numeric:true });

export function createTelegram({ token, chat, own, publicUrl, dataDir, act, get, createTask, fileOf, log = console }) {
  const on = Boolean(token && chat);
  const FILE = path.join(dataDir, 'tg.json');
  let st = { offset:0, replies:{}, cards:{} };   // replies: prompt message → { id, kind }; cards: task → { msg, mode, key }
  try { st = { ...st, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; st.cards ||= {}; } catch {}
  const keep = () => {
    for (const k of Object.keys(st.replies).slice(0, -200)) delete st.replies[k];
    for (const k of Object.keys(st.cards).slice(0, -300)) delete st.cards[k];
    try { fs.writeFileSync(FILE + '.tmp', JSON.stringify(st)); fs.renameSync(FILE + '.tmp', FILE); } catch {}
  };

  async function call(method, body) {
    const multipart = body instanceof FormData;
    const r = await fetch(API + token + '/' + method, { method:'POST', ...(multipart ? {} : { headers:{ 'content-type':'application/json' } }),
      body:multipart ? body : JSON.stringify(body), signal:AbortSignal.timeout(method === 'getUpdates' ? 70e3 : multipart ? 300e3 : 20e3) });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) throw Object.assign(new Error(`${method}: ${j.description || r.status}`), { code:j.error_code || r.status });
    return j.result;
  }
  // the «open» button: in the own bot — the mini app right in Telegram, else the office site
  const openBtn = (id, text = 'Открыть') => own ? { text, web_app:{ url:`${publicUrl}/app/#t=${id}` } } : { text, url:`${publicUrl}/#desk-${id}` };

  /* ---------- the card of a task ---------- */

  function message(v) {
    const who = v.agent?.name || 'Диспетчер', title = esc(v.route?.title || v.text.slice(0, 80)), q = v.question;
    const cost = money(v.usage), qa = v.qa?.verdict === 'ok' ? 'проверено контролёром' : v.qa?.verdict === 'fix' ? 'доработано по замечаниям контролёра' : '';
    const stage = v.pipeline ? `этап ${Math.min(v.pipeline.idx + 1, v.pipeline.stages.length)} из ${v.pipeline.stages.length} · ` : '';
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
    } else if (v.status === 'done') {
      head = `☑️ Принято${v.published ? ' — в истории офиса' : ''}`;
    } else if (v.status === 'cancelled') {
      head = '✖️ Отменена';
    } else {
      head = v.status === 'routing' ? '⏳ Диспетчер выбирает агента' : v.status === 'queued' ? `🔵 В очереди · ${esc(who)}` : `🟢 В работе · ${esc(who)}`;
      body = esc(`${stage}${v.status === 'work' ? 'шаги — в приложении' : v.queuePos > 1 ? `${v.queuePos}-я в очереди` : 'скоро начнёт'}`);
    }
    if (v.alerts && v.status === 'review') {
      const crit = v.alerts.critical || [], warn = v.alerts.warn || [];
      if (crit.length || warn.length) { head = crit.length ? `🔴 ${esc(who)}: срочно` : `🟡 ${esc(who)}: скоро продлить`; body = [...crit.map(x => '• ' + esc(x)), ...warn.map(x => '◦ ' + esc(x))].join('\n'); }
    }
    if (own) {
      if (v.status === 'question' && q?.options?.length) rows = q.options.map(o => [{ text:o.label, callback_data:`op:${v.id}:${o.id}` }]);
      if (v.status === 'question' && q?.from !== 'approval') rows.push([{ text:'💬 Ответить своими словами', callback_data:`an:${v.id}` }]);
      if (v.status === 'review') rows = [[{ text:'✅ Принять', callback_data:`ap:${v.id}` }, { text:'👍 Отлично', callback_data:`up:${v.id}` }], [{ text:'✏️ Правка', callback_data:`rv:${v.id}` }]];
      if (v.status === 'error') rows = [[{ text:'🔁 Повторить', callback_data:`rt:${v.id}` }]];
    }
    rows.push([openBtn(v.id, v.status === 'review' ? 'Открыть результат' : 'Открыть')]);
    const text = `${head}\n<b>${title}</b>${body ? '\n\n' + body : ''}${foot ? `\n\n<i>${esc(foot)}</i>` : ''}`;
    return { text:text.slice(0, 4000), reply_markup:{ inline_keyboard:rows } };
  }

  /* ---------- the materials of a result, right in the chat ---------- */

  async function materials(v) {
    const r = v.result;
    if (!r || !fileOf) return;
    const files = r.files.map(f => ({ ...f, abs:fileOf(v.id, r.version, f.path) })).filter(f => f.abs && f.size <= LIMIT);
    const title = (v.route?.title || '').slice(0, 900);
    const imgs = files.filter(f => IMG.test(f.path) && f.size <= PHOTO).sort((a, b) => natural(a.path, b.path)).slice(0, 20);
    const vids = files.filter(f => VID.test(f.path)).sort((a, b) => (b.path === r.main) - (a.path === r.main)).slice(0, 3);
    const docs = files.filter(f => DOC.test(f.path) || (IMG.test(f.path) && f.size > PHOTO)).slice(0, 5);
    let first = true;
    const caption = () => (first ? (first = false, title) : '');
    const form = () => { const fd = new FormData(); fd.append('chat_id', String(chat)); fd.append('disable_notification', 'true'); return fd; };
    // pictures and carousel slides: albums of up to 10, in the order of the slides
    for (let i = 0; i < imgs.length; i += 10) {
      const part = imgs.slice(i, i + 10), fd = form(), cap = caption();
      if (part.length === 1) {
        fd.append('photo', await fs.openAsBlob(part[0].abs), path.basename(part[0].path)); if (cap) fd.append('caption', cap);
        await call('sendPhoto', fd);
        continue;
      }
      fd.append('media', JSON.stringify(part.map((f, k) => ({ type:'photo', media:`attach://f${k}`, ...(k === 0 && cap ? { caption:cap } : {}) }))));
      for (const [k, f] of part.entries()) fd.append(`f${k}`, await fs.openAsBlob(f.abs), path.basename(f.path));
      await call('sendMediaGroup', fd);
    }
    for (const f of vids) {
      const fd = form(), cap = caption();
      fd.append('supports_streaming', 'true');
      fd.append('video', await fs.openAsBlob(f.abs), path.basename(f.path));
      if (cap) fd.append('caption', cap);
      await call('sendVideo', fd);
    }
    for (const f of docs) {
      const fd = form(), cap = caption();
      fd.append('document', await fs.openAsBlob(f.abs), path.basename(f.path));
      if (cap) fd.append('caption', cap);
      await call('sendDocument', fd);
    }
    const sent = imgs.length + vids.length + docs.length, rest = r.files.length - sent - r.files.filter(f => /\.html?$/i.test(f.path)).length;
    if (rest > 0 && sent) await call('sendMessage', { chat_id:chat, disable_notification:true, text:`Ещё ${rest} ${rest === 1 ? 'файл' : 'файлов'} — в приложении.` }).catch(() => {});
    return sent;
  }

  /* ---------- keeping the card in step with the task ---------- */

  const chains = new Map();
  // one queue per task: events of a task come in order, events of different tasks — in parallel
  function sync(v) {
    if (!on || !v) return Promise.resolve();
    const p = (chains.get(v.id) || Promise.resolve()).then(() => syncNow(v)).catch(e => log.error('tg sync:', e.message));
    chains.set(v.id, p);
    p.finally(() => { if (chains.get(v.id) === p) chains.delete(v.id); });
    return p;
  }
  async function syncNow(v) {
    const card = st.cards[v.id] || null;
    const attn = ATTN.includes(v.status), fin = FINAL.includes(v.status);
    const key = `${v.status}|${v.agent?.id || ''}|${v.pipeline?.idx ?? ''}|${v.question?.text || ''}|${v.result?.version || 0}|${v.error || ''}|${v.qa?.status || ''}`;
    if (card?.key === key) return;
    // routine tasks (morning checks) come only when they need the owner
    if (v.routine && !attn && !card) return;
    const m = message(v);
    if (attn) {
      if (card) await call('deleteMessage', { chat_id:chat, message_id:card.msg }).catch(() => {});
      if (v.status === 'review') await materials(v).catch(e => log.error('tg materials:', e.message));
      const r = await call('sendMessage', { chat_id:chat, parse_mode:'HTML', disable_web_page_preview:true, ...m });
      st.cards[v.id] = { msg:r.message_id, mode:'attn', key };
    } else if (card) {
      await call('editMessageText', { chat_id:chat, message_id:card.msg, parse_mode:'HTML', disable_web_page_preview:true, ...m })
        .catch(async e => { if (!/not modified/i.test(e.message)) { const r = await call('sendMessage', { chat_id:chat, parse_mode:'HTML', disable_notification:true, ...m }); card.msg = r.message_id; } });
      st.cards[v.id] = { msg:card.msg, mode:fin ? 'final' : 'work', key };
    } else if (!fin) {
      const r = await call('sendMessage', { chat_id:chat, parse_mode:'HTML', disable_notification:true, disable_web_page_preview:true, ...m });
      st.cards[v.id] = { msg:r.message_id, mode:'work', key };
    }
    keep();
  }

  /* ---------- buttons and replies (own bot only) ---------- */

  async function ask(id, kind, prompt) {
    const r = await call('sendMessage', { chat_id:chat, text:prompt, reply_markup:{ force_reply:true, input_field_placeholder:kind === 'revise' ? 'Что поправить' : 'Ваш ответ' } });
    st.replies[r.message_id] = { id, kind }; keep();
  }
  async function onCallback(cq) {
    const [k, id, arg] = String(cq.data || '').split(':');
    const done = (text, alert = false) => call('answerCallbackQuery', { callback_query_id:cq.id, text, show_alert:alert }).catch(() => {});
    if (k === 'an') { await ask(id, 'answer', 'Напишите ответ ответом на это сообщение.'); return done('Жду ответ'); }
    if (k === 'rv') { await ask(id, 'revise', 'Что поправить? Ответьте на это сообщение — агент поправит в той же сессии.'); return done('Жду правку'); }
    let r;
    if (k === 'ap' || k === 'up') r = act(id, 'approve', '', k === 'up' ? 'up' : '');
    else if (k === 'rt') r = act(id, 'retry');
    else if (k === 'op') {
      const opt = (get(id)?.question?.options || []).find(o => o.id === arg);
      r = opt ? act(id, 'answer', opt.label) : { error:'Вопрос уже закрыт — откройте задачу в офисе.' };
    } else return done('Неизвестная кнопка');
    if (r?.error) return done(r.error, true);
    return done(k === 'ap' || k === 'up' ? 'Принято — в истории офиса' : k === 'rt' ? 'Снова в очереди' : 'Передал агенту');
  }
  async function onMessage(m) {
    const text = String(m.text || m.caption || '').trim();
    if (!text) return;
    const to = m.reply_to_message && st.replies[m.reply_to_message.message_id];
    if (to) {
      const r = act(to.id, to.kind, text);
      delete st.replies[m.reply_to_message.message_id]; keep();
      return call('sendMessage', { chat_id:chat, text:r.error ? `Не получилось: ${r.error}` : to.kind === 'revise' ? 'Правка ушла агенту ✍️' : 'Ответ передан ✅', reply_to_message_id:m.message_id }).catch(() => {});
    }
    if (text === '/start' || text === '/help') return call('sendMessage', { chat_id:chat, text:'Я пишу, когда задаче нужен ваш ответ, готов результат или что-то сломалось, и присылаю материалы: картинки, карусели, видео, презентации. Кнопки под сообщением — принять, поправить, выбрать стиль или разрешить действие. Кнопка «Офис» внизу открывает приложение офиса. Напишите задачу обычным сообщением — поставлю её агентам.' }).catch(() => {});
    // a plain message from the owner is a new task for the office (its card appears by itself)
    createTask({ text, source:'telegram' });
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
      }
    }
  }
  if (on && own) {
    // the menu button «Офис» opens the mini app
    call('setChatMenuButton', { chat_id:Number(chat) || chat, menu_button:{ type:'web_app', text:'Офис', web_app:{ url:`${publicUrl}/app/` } } }).catch(e => log.error('tg menu:', e.message));
    poll();
  }

  return { on, own:on && own, sync, notify:sync, message, materials, stop:() => { stopped = true; } };
}
