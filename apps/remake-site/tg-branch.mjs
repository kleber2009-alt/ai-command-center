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

// topic names of the «руководители» group by lane: a bot binds only a topic whose name is its own or unknown
const LANES = [
  { key: 'reels', name: 'Instagram Reels', re: /reels?|рилс/i },
  { key: 'carousels', name: 'Карусели', re: /карус|carousel/i },
  { key: 'threads', name: 'Threads', re: /threads|тредс/i },
  { key: 'direct', name: 'Директ', re: /директ|direct/i },
  { key: 'office', name: 'AI-офис', re: /офис|office/i },
];
// a lane by topic name (carousels before reels: «Карусели Instagram» is not reels)
export function laneOf(name) {
  const n = String(name || '');
  if (!n) return null;
  return [LANES[1], LANES[0], ...LANES.slice(2)].find((l) => l.re.test(n)) || null;
}
// the topic name Telegram attaches to a message inside a topic (its root «topic created» message), if known
export const topicName = (msg) => msg.reply_to_message?.forum_topic_created?.name || '';

// one-time repairs of the bindings, each applied once (DATA_DIR/fixes/<mark>)
export function fixTopics(data) {
  const fixes = [
    // 2026-10-29: a plain /bind in the «Карусели» topic reached @instaoo_bot (Telegram gives a plain command to the bot
    // that spoke last) and the reels branch moved there: the topic goes back to carousels, reels waits for /bind@ in its own
    { mark: 'reels-out-of-carousels-18868', topic: 18868, from: 'reels', to: 'carousels' },
  ];
  const read = (k) => { try { return JSON.parse(fs.readFileSync(path.join(data, k, 'state.json'), 'utf8')); } catch { return null; } };
  const write = (k, v) => { fs.mkdirSync(path.join(data, k), { recursive: true }); fs.writeFileSync(path.join(data, k, 'state.json'), JSON.stringify(v, null, 1)); };
  fs.mkdirSync(path.join(data, 'fixes'), { recursive: true });
  for (const f of fixes) {
    const flag = path.join(data, 'fixes', f.mark);
    if (fs.existsSync(flag)) continue;
    const from = read(f.from);
    if (from?.chat_id && from.topic_id === f.topic) {
      const to = read(f.to) || {};
      if (!to.chat_id) write(f.to, { ...to, chat_id: from.chat_id, topic_id: f.topic, owners: to.owners?.length ? to.owners : from.owners || [], announce: 'moved' });
      write(f.from, { ...from, chat_id: 0, topic_id: 0, announce: '' });
      console.log(`fix ${f.mark}: topic ${f.topic} ${f.from} → ${f.to}`);
    }
    fs.writeFileSync(flag, new Date().toISOString());
  }
}

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

// @usernames the branches saved in their state (each bot writes its own after getMe)
export function botsOf(data) {
  const out = {};
  for (const key of Object.keys(BRANCHES)) {
    try { const s = JSON.parse(fs.readFileSync(path.join(data, key, 'state.json'), 'utf8')); if (s.bot) out[key] = s.bot; } catch {}
  }
  return out;
}

// a plain /bind reached a bot that already has a topic (Telegram gives a plain command to the bot that spoke last):
// say which bot it is and how to bind the right one — unless the other branch took this topic meanwhile
export async function wrongBind({ data, self, me, chat, topic, name = '', reply }) {
  await new Promise((r) => setTimeout(r, 3000));
  if (takenBy(data, self, chat, topic)) return;
  const bots = botsOf(data), lane = laneOf(name);
  const head = `Я @${me} — бот ветки «${BRANCHES[self]}», уже привязан к своей ветке, поэтому здесь не привязываюсь.`;
  let hint;
  if (lane && BRANCHES[lane.key] && lane.key !== self) hint = `Эта ветка — ${BRANCHES[lane.key]}: ${bots[lane.key] ? `/bind@${bots[lane.key]}` : '/bind@ник её бота'}.`;
  else if (lane && !BRANCHES[lane.key]) hint = `Ветку «${name}» ведёт не бот рилсов и не бот каруселей — здесь им делать нечего.`;
  else hint = `Привязать эту ветку: ${Object.entries(bots).filter(([k]) => k !== self).map(([k, b]) => `${BRANCHES[k]} — /bind@${b}`).join(', ') || '/bind@ник нужного бота'}.`;
  return reply(`${head}\n${hint}${lane && lane.key !== self ? '' : `\nПеренести меня сюда — /bind@${me}.`}`);
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
