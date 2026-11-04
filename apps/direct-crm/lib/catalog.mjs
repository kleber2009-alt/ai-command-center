/* ChatPlace automations and the AI agent's open questions — kept in the CRM, refreshed at most one request per sync pass:
   bots once a day, each bot's automation list once an hour, each active automation's detail (steps, buttons, counts) once
   an hour, the AI agent's unanswered questions every 15 minutes. From the automations the CRM knows every code word,
   step text and button text, so it marks in each chat what the person did (code word, button, step of which chain). */
import { now, tx } from './db.mjs';

const HOUR = 3600, norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').replace(/[^\p{L}\p{N} ]/gu, '').trim();

export function createCatalog({ db, cp, log = console.log }) {
  const meta = k => db.prepare('SELECT value FROM meta WHERE key = ?').get(k)?.value;
  const setMeta = (k, v) => db.prepare('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, String(v));
  let index = null;

  async function refreshBots() {
    const list = await cp.bots();
    tx(db, () => { for (const b of list || []) db.prepare(`INSERT INTO bots(id, name, username, platform, updated) VALUES(?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, username = excluded.username, platform = excluded.platform, updated = excluded.updated`)
      .run(b.id, b.name || '', b.username || '', b.platform?.label || '', now()); });
    setMeta('bots_at', now());
    return 'bots';
  }

  async function refreshList(bot) {
    const list = await cp.automations(bot.id);
    tx(db, () => {
      for (const a of list || []) db.prepare(`INSERT INTO automations(id, bot_id, name, status, start_messages, listed) VALUES(?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, status = excluded.status, start_messages = excluded.start_messages, listed = excluded.listed`)
        .run(a.id, bot.id, a.name || '', a.statusName || '', JSON.stringify(a.startMessages || []), now());
      db.prepare('UPDATE bots SET updated = ? WHERE id = ?').run(now(), bot.id);
    });
    setMeta(`list_${bot.id}`, now());
    return `automations of ${bot.username || bot.name}`;
  }

  async function refreshDetail(a) {
    const d = await cp.automation(a.id);
    const counts = {};
    for (const s of d?.steps || []) for (const m of s.messages || []) {
      counts[m.id] = m.clientsCount || 0;
      for (const b of m.inlineButtons || []) if (b.trackClicks !== false) counts[b.id] = b.clientsCount || 0;
    }
    const day = new Date(Date.now() + 3 * HOUR * 1000).toISOString().slice(0, 10);   // Moscow day
    tx(db, () => {
      db.prepare('UPDATE automations SET detail = ?, detailed = ? WHERE id = ?').run(JSON.stringify(d), now(), a.id);
      db.prepare('INSERT INTO funnel_days(automation_id, day, counts) VALUES(?, ?, ?) ON CONFLICT DO UPDATE SET counts = excluded.counts').run(a.id, day, JSON.stringify(counts));
    });
    index = null;
    return `automation ${a.name}`;
  }

  async function refreshQuestions(bot) {
    const list = await cp.kbQuestions(bot.id);
    const ids = new Set((list || []).map(q => q.id));
    tx(db, () => {
      for (const q of list || []) db.prepare('INSERT OR IGNORE INTO kb_questions(id, bot_id, question, first_seen) VALUES(?, ?, ?, ?)').run(q.id, bot.id, q.question || '', now());
      // answered or removed in ChatPlace itself
      for (const r of db.prepare('SELECT id FROM kb_questions WHERE bot_id = ? AND gone = 0').all(bot.id)) if (!ids.has(r.id)) db.prepare('UPDATE kb_questions SET gone = 1 WHERE id = ?').run(r.id);
    });
    setMeta(`kbq_${bot.id}`, now());
    return `questions of ${bot.username || bot.name}`;
  }

  // one request at most: whatever is the most overdue
  async function step() {
    if (!cp) return null;
    if (Number(meta('bots_at') || 0) < now() - 24 * HOUR) return refreshBots();
    const bots = db.prepare('SELECT * FROM bots').all();
    for (const b of bots) if (Number(meta(`list_${b.id}`) || 0) < now() - HOUR) return refreshList(b);
    const a = db.prepare(`SELECT id, name FROM automations WHERE status IN ('Active', 'Paused') AND detailed < ? ORDER BY detailed LIMIT 1`).get(now() - HOUR);
    if (a) return refreshDetail(a);
    for (const b of bots.filter(b => b.platform === 'instagram')) if (Number(meta(`kbq_${b.id}`) || 0) < now() - 15 * 60) return refreshQuestions(b);
    return null;
  }

  /* text → what it is: a code word that starts an automation, a button of an automation, or a message of its steps */
  function buildIndex() {
    const words = [], buttons = new Map(), steps = new Map();
    for (const a of db.prepare('SELECT * FROM automations').all()) {
      const name = a.name.split(/[→(]/)[0].trim() || a.name;
      for (const w of JSON.parse(a.start_messages || '[]')) if (norm(w)) words.push({ w:norm(w), automation:a.id, name });
      const d = a.detail ? JSON.parse(a.detail) : null;
      for (const s of d?.steps || []) for (const m of s.messages || []) {
        if (m.text) steps.set(norm(m.text).slice(0, 80), { automation:a.id, name, message:m.id });
        for (const b of m.inlineButtons || []) if (norm(b.text)) {
          const k = norm(b.text);
          if (!buttons.has(k)) buttons.set(k, { automation:a.id, name, button:b.text, url:b.url || null });
        }
      }
    }
    words.sort((x, y) => y.w.length - x.w.length);
    return { words, buttons, steps };
  }
  function mark(m) {
    index ||= buildIndex();
    const t = norm(m.text);
    if (!t) return null;
    if (['client', 'user', 'contact'].includes(m.side)) {
      const b = index.buttons.get(t);
      if (b) return { kind:'button', label:b.button, automation:b.automation, name:b.name };
      const w = index.words.find(x => t === x.w || (t.length <= 40 && (` ${t} `).includes(` ${x.w} `)));
      if (w) return { kind:'codeword', label:w.w, automation:w.automation, name:w.name };
      return null;
    }
    const s = index.steps.get(t.slice(0, 80));
    return s ? { kind:'step', automation:s.automation, name:s.name } : null;
  }

  return { step, mark, invalidate:() => { index = null; } };
}

/* the funnel of every automation for the reports: steps with how many people reached them, buttons with clicks and CTR,
   and the growth over the period from the daily copies */
export function funnels(db, days = 7) {
  const from = new Date(Date.now() + 3 * HOUR * 1000 - days * 864e5).toISOString().slice(0, 10);
  const bots = Object.fromEntries(db.prepare('SELECT * FROM bots').all().map(b => [b.id, b]));
  return db.prepare(`SELECT * FROM automations WHERE detail IS NOT NULL ORDER BY status = 'Active' DESC, name`).all().map(a => {
    const d = JSON.parse(a.detail), base = db.prepare('SELECT counts FROM funnel_days WHERE automation_id = ? AND day >= ? ORDER BY day LIMIT 1').get(a.id, from);
    const old = base ? JSON.parse(base.counts) : null;
    const steps = [];
    for (const s of d.steps || []) for (const m of (s.messages || []).filter(m => m.text || (m.inlineButtons || []).length)) steps.push({
      id:m.id, first:Boolean(m.isFirstMessage), text:String(m.text || '').slice(0, 160), clients:m.clientsCount || 0, delta:old && old[m.id] != null ? (m.clientsCount || 0) - old[m.id] : null,
      buttons:(m.inlineButtons || []).map(b => ({ text:b.text, url:b.url || null, tracked:b.trackClicks !== false, clicks:b.clientsCount ?? null, ctr:b.ctr ?? null,
        delta:old && old[b.id] != null ? (b.clientsCount || 0) - old[b.id] : null })),
    });
    steps.sort((x, y) => (y.first - x.first) || (y.clients - x.clients));
    const entered = steps.find(s => s.first)?.clients ?? Math.max(0, ...steps.map(s => s.clients));
    const urls = steps.flatMap(s => s.buttons.filter(b => b.url && b.clicks != null));
    return { id:a.id, name:a.name, status:a.status, bot:bots[a.bot_id]?.username || '', words:JSON.parse(a.start_messages || '[]'), entered,
      enteredDelta:steps.find(s => s.first)?.delta ?? null, links:urls.reduce((n, b) => n + b.clicks, 0), steps, updated:a.detailed, since:base ? from : null };
  });
}
