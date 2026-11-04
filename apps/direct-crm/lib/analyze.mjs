/* The AI's read of each chat: priority of the request (what Bogdan answers first), stage of the lead, where the lead
   came from (code word), a short summary with the next step, and a grade of how the Direct AI handled the chat.
   A chat is read again only when it has new messages, and only after it has been quiet for QUIET_SEC — so the
   ChatPlace AI has had its chance to answer first. A stage set by hand is never overwritten. */
import { now, STAGES, PRIORITIES } from './db.mjs';

export const ISSUE_TYPES = {
  wrong_answer:'Неверный ответ', ignored_question:'Не ответил на вопрос', lost_lead:'Упустил тёплого', pushy:'Давит / спамит',
  broken_flow:'Сломалась цепочка', tone:'Тон не тот', no_handoff:'Не позвал человека', other:'Другое',
};

const SCHEMA = {
  type:'object', additionalProperties:false,
  required:['priority', 'priority_reason', 'stage', 'intent', 'source', 'summary', 'next_step', 'ai_score', 'ai_verdict', 'ai_issues', 'lead_score', 'interest', 'objection', 'contact'],
  properties:{
    priority:{ type:'string', enum:PRIORITIES },
    priority_reason:{ type:'string' },
    stage:{ type:'string', enum:STAGES },
    intent:{ type:'string' },
    source:{ type:'string' },
    summary:{ type:'string' },
    next_step:{ type:'string' },
    ai_score:{ type:'integer' },
    lead_score:{ type:'integer' }, interest:{ type:'string' }, objection:{ type:'string' }, contact:{ type:'string' },
    ai_verdict:{ type:'string' },
    ai_issues:{ type:'array', items:{ type:'object', additionalProperties:false, required:['type', 'text'], properties:{
      type:{ type:'string', enum:Object.keys(ISSUE_TYPES) }, text:{ type:'string' } } } },
  },
};

const SYSTEM = `Ты — аналитик отдела продаж блога Ильи Палия (нейросети и ИИ для блогеров и экспертов). Входящие в Instagram Direct и
Telegram-ботах первым обрабатывает ИИ-менеджер и автоматизации ChatPlace: человек пишет кодовое слово из рилса или поста — бот
выдаёт бесплатный материал (скилл, гайд, урок), проверяет подписку на Telegram-канал, зовёт на бесплатный практикум и к платным
продуктам. Руководитель отдела продаж Богдан забирает у ИИ тёплых и сложных клиентов.

Прочитай переписку и ответь строго по схеме, по-русски, коротко.

priority — кого Богдан должен взять первым:
- hot — готов купить или уже покупает: спрашивает цену, условия, рассрочку, как оплатить, хочет созвон, проблема с оплатой или доступом после оплаты;
- human — нужен человек: вопрос, на который ИИ не ответил или ответил неверно, жалоба, раздражение, нестандартная просьба, сотрудничество, ИИ зациклился;
- normal — обычный ход воронки, ИИ справляется (кодовое слово, получил материал, общие вопросы с ответом);
- low — спам, бот, пустое сообщение, человек ушёл без вопроса, всё закрыто.
priority_reason — одна фраза почему.
stage: new — пришёл, интерес не ясен; warm — забрал материал, задаёт вопросы, интерес к продукту или практикуму; hot — обсуждает покупку;
customer — оплатил; lost — отказался, отписался, раздражён или пропал после цены.
intent — суть запроса в 2–4 словах («кодовое слово», «вопрос о цене», «не пришёл материал», «оплата»…).
source — откуда пришёл: кодовое слово или название материала, если видно; иначе пустая строка.
summary — 1–2 предложения: кто, что хочет, чем кончилось.
next_step — что сделать Богдану (или «ничего — ИИ справился»).
ai_score — оценка работы ИИ-менеджера и автоматизаций в этой переписке: 5 — отлично, 4 — хорошо с мелочами, 3 — терпимо,
2 — плохо, 1 — провал; 0 — если бот в переписке не отвечал.
ai_verdict — одна фраза, как ИИ справился.
ai_issues — конкретные ошибки ИИ (пусто, если их нет): тип и одна фраза с цитатой или моментом.
Квалификация лида:
lead_score — 0–100, насколько человек близок к покупке платного продукта: 0–20 просто забрал материал, 20–50 интересуется темой
и задаёт вопросы, 50–80 обсуждает практикум, обучение, цену или условия, 80–100 готов платить или уже платит.
interest — что его интересует (продукт, тема, задача) в 2–6 словах, или пустая строка.
objection — главное возражение или препятствие (цена, время, «подумаю», нет VPN, не работает ссылка…), или пустая строка.
contact — телефон, почта или ник в Telegram, если человек их написал, иначе пустая строка.`;

const SIDE = { client:'Клиент', user:'Клиент', contact:'Клиент', bot:'Бот', operator:'Менеджер', manager:'Менеджер', admin:'Менеджер' };
const fmt = ts => new Date(ts * 1000).toLocaleString('ru-RU', { timeZone:'Europe/Moscow', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });

export function transcript(messages, max = 60) {
  return messages.slice(-max).map(m => {
    const who = m.by_user ? `Менеджер (${m.by_user})` : SIDE[m.side] || m.side;
    const media = m.media ? JSON.parse(m.media).map(f => `[${f.type || 'файл'}]`).join(' ') : '';
    const text = String(m.text || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
    return `[${fmt(m.created_at)}] ${who}: ${text}${media ? ' ' + media : ''}`;
  }).join('\n');
}

export function createAnalyzer({ db, claude, model, fallback = {}, quietSec = 90, batch = 12, log = console.log }) {
  const due = db.prepare(`SELECT * FROM chats WHERE client_count > 0 AND last_message_at > analyzed_upto AND last_message_at <= ?
    ORDER BY last_client_at DESC LIMIT ?`);
  const msgs = db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at, rowid');
  const save = db.prepare(`UPDATE chats SET lead_score = ?, interest = ?, objection = ?, contact = CASE WHEN ? <> '' THEN ? ELSE contact END,
    priority = ?, priority_reason = ?, stage = CASE WHEN stage_manual = 1 THEN stage ELSE ? END,
    intent = ?, source = CASE WHEN ? <> '' THEN ? ELSE source END, summary = ?, next_step = ?, ai_score = ?, ai_verdict = ?, ai_issues = ?,
    analyzed_upto = ?, analyzed_at = ? WHERE id = ?`);
  let running = null;
  const backoff = new Map();

  async function analyzeChat(chat) {
    const list = msgs.all(chat.id);
    if (!list.length) return null;
    const hand = chat.stage_manual ? `\nЭтап, который поставил Богдан вручную: ${chat.stage}.` : '';
    const msg = await claude.beta.messages.create({
      model, max_tokens:4000, ...fallback, output_config:{ effort:'low', format:{ type:'json_schema', schema:SCHEMA } },
      system:[{ type:'text', text:SYSTEM, cache_control:{ type:'ephemeral' } }],
      messages:[{ role:'user', content:`Клиент: ${chat.client_name || 'без имени'}${chat.username ? ' (@' + chat.username + ')' : ''}${hand}\n\nПереписка:\n${transcript(list)}` }],
    });
    if (msg.stop_reason !== 'end_turn') throw new Error('stop_reason ' + msg.stop_reason);
    const r = JSON.parse(msg.content.filter(b => b.type === 'text').map(b => b.text).join(''));
    const score = Math.max(0, Math.min(5, Math.round(Number(r.ai_score) || 0)));
    const issues = (r.ai_issues || []).filter(i => ISSUE_TYPES[i.type]).slice(0, 8);
    const contact = String(r.contact || '').trim().slice(0, 120);
    save.run(Math.max(0, Math.min(100, Math.round(Number(r.lead_score) || 0))), String(r.interest || '').slice(0, 120), String(r.objection || '').slice(0, 160), contact, contact,
      PRIORITIES.includes(r.priority) ? r.priority : 'normal', String(r.priority_reason || ''), STAGES.includes(r.stage) ? r.stage : chat.stage,
      String(r.intent || '').slice(0, 80), String(r.source || '').trim().slice(0, 80), String(r.source || '').trim().slice(0, 80),
      String(r.summary || ''), String(r.next_step || ''), score || null, String(r.ai_verdict || ''), JSON.stringify(issues),
      chat.last_message_at, now(), chat.id);
    return r;
  }

  async function pass() {
    if (!claude) return { analyzed:0, off:true };
    let analyzed = 0, failed = 0, lastError = null;
    for (const chat of due.all(now() - quietSec, batch + backoff.size)) {
      if ((backoff.get(chat.id) || 0) > now()) continue;
      if (analyzed + failed >= batch) break;
      try { await analyzeChat(chat); analyzed++; backoff.delete(chat.id); }
      catch (e) {
        failed++; lastError = e.message; backoff.set(chat.id, now() + 1800);  // a chat that fails is not retried for 30 min
        log(`analyze: chat ${chat.id}: ${e.message}`);
        if (e.status === 429 || e.status === 401) break;
      }
    }
    return { analyzed, failed, lastError };
  }

  return { on:!!claude, run() { return running ||= pass().finally(() => { running = null; }); }, analyzeChat };
}
