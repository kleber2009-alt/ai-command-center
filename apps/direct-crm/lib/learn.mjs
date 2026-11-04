/* Teaching the ChatPlace AI manager from the chats. Two things, both only proposals until a person presses the button:
   1. Questions the AI agent could not answer (ChatPlace knowledge base) → Claude drafts an answer in Ilia's voice, using
      how such questions went in the stored chats → Bogdan or Ilia edits and presses «В базу знаний» → the answer goes to
      ChatPlace (ai_agent_knowledge_base_add_answer). Off-topic questions are marked «пропустить».
   2. A review of the AI's mistakes over a period (from the per-chat grades) → what to change in its rules and answers. */
import { now } from './db.mjs';
import { ISSUE_TYPES } from './analyze.mjs';

const CONTEXT = `Блог Ильи Палия: нейросети и ИИ для блогеров и экспертов — монтаж рилсов с Claude, карусели, ИИ-агенты, автоворонки
в Директе. В Instagram Direct отвечает ИИ-менеджер ChatPlace: по кодовым словам из рилсов выдаёт бесплатные материалы (скиллы, гайды,
уроки) через Telegram-бот, проверяет подписку, зовёт на бесплатный практикум и к платным продуктам. Руководитель продаж — Богдан.`;

const DRAFT_SCHEMA = { type:'object', additionalProperties:false, required:['skip', 'reason', 'answer'], properties:{
  skip:{ type:'boolean' }, reason:{ type:'string' }, answer:{ type:'string' } } };

export function createLearn({ db, claude, model, fallback = {} }) {
  const ask = async (system, user, schema, max = 4000) => {
    const msg = await claude.beta.messages.create({ model, max_tokens:max, ...fallback,
      output_config:{ effort:'low', ...(schema ? { format:{ type:'json_schema', schema } } : {}) },
      system:[{ type:'text', text:system }], messages:[{ role:'user', content:user }] });
    if (msg.stop_reason !== 'end_turn') throw new Error('stop_reason ' + msg.stop_reason);
    const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
    return schema ? JSON.parse(text) : text;
  };

  // chats where people asked something close to the question — so the draft follows what really happens
  function examples(question) {
    const words = String(question).toLowerCase().match(/[\p{L}]{5,}/gu)?.slice(0, 4) || [];
    if (!words.length) return '';
    const rows = db.prepare(`SELECT c.summary, c.next_step FROM chats c WHERE c.summary IS NOT NULL AND (${words.map(() => 'c.summary LIKE ?').join(' OR ')})
      ORDER BY c.last_message_at DESC LIMIT 6`).all(...words.map(w => `%${w}%`));
    return rows.map(r => `- ${r.summary} → ${r.next_step}`).join('\n');
  }

  async function draft(id) {
    const q = db.prepare('SELECT * FROM kb_questions WHERE id = ?').get(id);
    if (!q) throw new Error('Нет такого вопроса');
    if (!claude) throw new Error('Claude не подключён');
    const ex = examples(q.question);
    const r = await ask(`${CONTEXT}

Ты помогаешь дополнить базу знаний ИИ-менеджера. Тебе дают вопрос, на который он не смог ответить. Если вопрос не про блог,
продукты, материалы, практикум, нейросети для контента и продаж или работу бота (спам, чужой бизнес, личное, бессмыслица) —
skip=true и коротко reason. Иначе — answer: ответ для базы знаний, 1–4 предложения, на «ты», просто и по делу, без выдуманных
цен, дат, ссылок и обещаний; если без фактов нельзя — ответ, который ведёт к человеку («напиши „Богдан“ — подключу менеджера»).`,
      `Вопрос: ${q.question}${ex ? `\n\nКак похожие разговоры шли в переписках:\n${ex}` : ''}`, DRAFT_SCHEMA, 2000);
    db.prepare('UPDATE kb_questions SET draft = ?, skipped = ? WHERE id = ?').run(r.skip ? '' : String(r.answer || '').trim(), r.skip ? 1 : 0, id);
    return { skip:Boolean(r.skip), reason:String(r.reason || ''), answer:String(r.answer || '').trim() };
  }

  async function review(days = 7) {
    if (!claude) throw new Error('Claude не подключён — разбор недоступен');
    const from = now() - days * 86400;
    const rows = db.prepare(`SELECT client_name, summary, ai_score, ai_verdict, ai_issues, priority, stage FROM chats
      WHERE last_message_at >= ? AND ai_score BETWEEN 1 AND 3 ORDER BY ai_score, last_message_at DESC LIMIT 80`).all(from);
    const all = db.prepare('SELECT COUNT(*) n, ROUND(AVG(NULLIF(ai_score, 0)), 2) avg FROM chats WHERE last_message_at >= ? AND ai_score > 0').get(from);
    const qs = db.prepare('SELECT question FROM kb_questions WHERE gone = 0 AND skipped = 0 AND answered_at IS NULL ORDER BY first_seen DESC LIMIT 40').all();
    if (!rows.length && !qs.length) return { text:'За период нет переписок, где ИИ справился плохо, и нет вопросов без ответа.', at:now() };
    const lines = rows.map(r => `- [${r.ai_score}/5] ${r.summary} | ${r.ai_verdict} | ошибки: ${JSON.parse(r.ai_issues || '[]').map(i => `${ISSUE_TYPES[i.type] || i.type}: ${i.text}`).join('; ')}`);
    const text = await ask(`${CONTEXT}

Ты — руководитель качества ИИ-менеджера. По слабым перепискам за период напиши разбор для Ильи и Богдана, по-русски, markdown:
## Главное (3–5 пунктов: что чаще всего идёт не так и сколько это стоит в лидах)
## Что поменять в правилах ИИ-менеджера (конкретные формулировки правил «если клиент …, то …»)
## Ответы, которых не хватает в базе знаний (вопрос → ответ, только по делу)
## Что проверить в цепочках (кнопки, проверка подписки, ссылки)
Не выдумывай цифр, которых нет в данных.`,
      `Период: ${days} дн. Оценено переписок: ${all.n}, средняя оценка ${all.avg ?? '—'}.\n\nСлабые переписки:\n${lines.join('\n') || '—'}\n\nВопросы без ответа в базе знаний:\n${qs.map(q => '- ' + q.question).join('\n') || '—'}`,
      null, 8000);
    const out = { text, at:now(), days, chats:rows.length };
    db.prepare("INSERT INTO meta(key, value) VALUES('ai_review', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(out));
    return out;
  }

  return { draft, review, last:() => { const v = db.prepare("SELECT value FROM meta WHERE key = 'ai_review'").get()?.value; return v ? JSON.parse(v) : null; } };
}
