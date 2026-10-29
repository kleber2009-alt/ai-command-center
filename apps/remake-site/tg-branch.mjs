/* Shared rules for the Telegram topics of remake-site (reels-bot.mjs, carousel-bot.mjs): one topic — one bot.

   - who am I: getMe → @username, shown in /api/health;
   - a command addressed to another bot (/scan@other_bot) is not ours; a plain /bind binds only a bot that has no topic
     yet or is already in this one — to move a bound bot, /bind@its_name;
   - a topic already taken by the other branch (its state.json in DATA_DIR) is refused; in a forum only a real topic,
     not «Общий», can be bound; after binding a bot hears only its own topic;
   - progress: after ✅ one status message under the card — done / now (how long, what's next) / ahead — edited in place. */
import fs from 'node:fs';
import path from 'node:path';

export const BRANCHES = { reels: 'Instagram Reels', carousels: 'Instagram Карусели' };

// topics bound by the other branches of this site
export function takenBy(data, self, chat, topic) {
  for (const key of Object.keys(BRANCHES)) {
    if (key === self) continue;
    try {
      const s = JSON.parse(fs.readFileSync(path.join(data, key, 'state.json'), 'utf8'));
      if (s.chat_id && s.chat_id === chat && (s.topic_id || 0) === (topic || 0)) return key;
    } catch {}
  }
  return '';
}

// what a message means for this bot: {cmd, mention, mine, topic}
export function parse(msg, me) {
  const text = String(msg.text || '').trim();
  const m = text.match(/^\/([a-z_]+)(?:@(\w+))?/i) || [];
  const mention = (m[2] || '').toLowerCase();
  return { text, cmd: (m[1] || '').toLowerCase(), mention, forMe: Boolean(mention) && mention === String(me || '').toLowerCase(),
    forOther: Boolean(mention) && Boolean(me) && mention !== String(me).toLowerCase(), topic: msg.is_topic_message ? msg.message_thread_id : 0 };
}

const mins = (ms) => { const m = Math.max(0, Math.round(ms / 60e3)); return m < 1 ? 'меньше минуты' : `${m} мин`; };

// steps: [{label, eta}] · cur: index of the running step (steps.length — all done) · failed: why the running step broke
export function progressText({ title, steps, cur, failed = '', detail = '', started, stepAt, retry = '🔁 Повторить' }) {
  const now = Date.now();
  const lines = steps.map((s, i) => {
    const n = `${i + 1}/${steps.length}`;
    if (i < cur) return `✅ ${n} ${s.label}`;
    if (i > cur) return `◻️ ${n} ${s.label}${s.eta ? ` — ${s.eta}` : ''}`;
    if (failed) return `⚠️ ${n} <b>${s.label}</b> — сорвалось: ${failed}`;
    return `⏳ ${n} <b>${s.label}</b> — идёт ${mins(now - Date.parse(stepAt || started))}${s.eta ? ` (${s.eta})` : ''}${detail ? `\n      ${detail}` : ''}`;
  });
  let head;
  if (failed) head = `⚠️ <b>${title}: остановилось на шаге ${cur + 1} из ${steps.length}.</b>\nЧто дальше: нажмите «${retry}» на карточке — продолжу с этого шага.`;
  else if (cur >= steps.length) { const t = mins(now - Date.parse(started)); head = `✅ <b>${title}: готово</b> ${t === 'меньше минуты' ? 'меньше чем за минуту' : 'за ' + t}.`; }
  else head = `▶️ <b>${title}: сейчас шаг ${cur + 1} из ${steps.length}</b> — ${steps[cur].label.replace(/<[^>]+>/g, '')}.\n` +
    (steps[cur + 1] ? `Дальше: ${steps[cur + 1].label.replace(/<[^>]+>/g, '')}.` : 'Дальше: всё придёт сюда, в ветку.') + ' Писать ничего не нужно — статус обновляется сам.';
  return `${head}\n\n${lines.join('\n')}`;
}
