/* HTTP API of the CRM (all under /api, every route but health/login needs a session). */
import { now, logEvent, STAGES } from './db.mjs';
import { ISSUE_TYPES } from './analyze.mjs';
import { funnels } from './catalog.mjs';

const RANK = { hot:0, human:1, normal:2, low:3 };
const CLIENT = "('client','user','contact')";

export function createApi({ db, cp, auth, sync, analyzer, catalog = null, learn = null, status = null, model = '', secure = false, log = console.log }) {
  const chat = db.prepare('SELECT * FROM chats WHERE id = ?');
  const msgs = db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at, rowid');
  const events = db.prepare('SELECT * FROM events WHERE chat_id = ? ORDER BY at DESC LIMIT 50');

  const view = c => {
    const waiting = c.last_side && ['client', 'user', 'contact'].includes(c.last_side) && c.last_client_at ? now() - c.last_client_at : 0;
    return {
      id:c.id, name:c.client_name || 'Без имени', username:c.username, status:c.status, ai:c.type !== 1,
      lastAt:c.last_message_at, lastClientAt:c.last_client_at, lastSide:c.last_side, waiting, messages:c.msg_count,
      priority:c.priority, priorityReason:c.priority_reason, stage:c.stage, stageManual:!!c.stage_manual,
      source:c.source, intent:c.intent, summary:c.summary, nextStep:c.next_step,
      aiScore:c.ai_score, aiVerdict:c.ai_verdict, aiIssues:c.ai_issues ? JSON.parse(c.ai_issues) : [],
      analyzed:c.analyzed_upto >= c.last_message_at && !!c.analyzed_at, handledBy:c.handled_by,
      reviewed:c.reviewed_upto >= c.last_client_at && c.reviewed_upto > 0, reviewedBy:c.reviewed_by,
      leadScore:c.lead_score ?? null, interest:c.interest || '', objection:c.objection || '', contact:c.contact || '',
    };
  };

  function list(q) {
    const where = [], args = [];
    const v = q.get('view') || 'queue';
    if (v === 'queue') where.push(`client_count > 0 AND reviewed_upto < last_client_at AND (priority IN ('hot','human') OR (last_side IN ${CLIENT} AND last_client_at < ?))`), args.push(now() - 600);
    if (v === 'mine') where.push('handled_by = ?'), args.push(q.get('user') || '');
    if (v === 'taken') where.push('handled_by IS NOT NULL');
    const stage = q.get('stage');
    if (stage && STAGES.includes(stage)) where.push('stage = ?'), args.push(stage);
    const pr = q.get('priority');
    if (pr && RANK[pr] != null) where.push('priority = ?'), args.push(pr);
    const src = q.get('source');
    if (src) where.push('source = ?'), args.push(src);
    const s = (q.get('q') || '').trim();
    if (s) {
      where.push(`(client_name LIKE ? OR username LIKE ? OR summary LIKE ? OR id IN (SELECT chat_id FROM messages WHERE text LIKE ?))`);
      args.push(...Array(4).fill(`%${s}%`));
    }
    const days = Number(q.get('days')) || 0;
    if (days) where.push('last_message_at >= ?'), args.push(now() - days * 86400);
    const sql = `SELECT * FROM chats ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY last_message_at DESC LIMIT ${v === 'queue' ? 500 : 300}`;
    let rows = db.prepare(sql).all(...args).map(view);
    // the queue: hot first, then those who need a person; inside — who has waited longest
    if (v === 'queue') rows.sort((a, b) => (RANK[a.priority] ?? 2) - (RANK[b.priority] ?? 2) || (b.waiting - a.waiting) || (b.lastAt - a.lastAt));
    return rows;
  }

  function counts() {
    const r = db.prepare(`SELECT
      SUM(client_count > 0 AND reviewed_upto < last_client_at AND priority = 'hot') hot,
      SUM(client_count > 0 AND reviewed_upto < last_client_at AND priority = 'human') human,
      SUM(client_count > 0 AND reviewed_upto < last_client_at AND (priority IN ('hot','human') OR (last_side IN ${CLIENT} AND last_client_at < ?))) queue,
      SUM(handled_by IS NOT NULL) taken, COUNT(*) total FROM chats`).get(now() - 600);
    return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v || 0]));
  }

  function stats(days) {
    const from = now() - days * 86400;
    const act = 'last_message_at >= ? AND client_count > 0';
    const funnel = Object.fromEntries(STAGES.map(s => [s, 0]));
    for (const r of db.prepare(`SELECT stage, COUNT(*) n FROM chats WHERE ${act} GROUP BY stage`).all(from)) funnel[r.stage] = r.n;
    const sources = db.prepare(`SELECT COALESCE(NULLIF(source, ''), 'не определён') source, COUNT(*) n,
        SUM(stage IN ('warm','hot','customer')) warm, SUM(stage IN ('hot','customer')) hot, SUM(stage = 'customer') customer, SUM(stage = 'lost') lost
      FROM chats WHERE ${act} GROUP BY 1 ORDER BY n DESC LIMIT 30`).all(from);
    const priority = Object.fromEntries(Object.keys(RANK).map(p => [p, 0]));
    for (const r of db.prepare(`SELECT priority, COUNT(*) n FROM chats WHERE ${act} GROUP BY priority`).all(from)) priority[r.priority] = r.n;
    const scored = db.prepare(`SELECT ai_score, ai_issues FROM chats WHERE ${act} AND ai_score > 0`).all(from);
    const dist = [1, 2, 3, 4, 5].map(s => scored.filter(r => r.ai_score === s).length);
    const issues = Object.fromEntries(Object.keys(ISSUE_TYPES).map(k => [k, 0]));
    for (const r of scored) for (const i of JSON.parse(r.ai_issues || '[]')) if (i.type in issues) issues[i.type]++;
    const byDay = db.prepare(`SELECT date(last_message_at, 'unixepoch', '+3 hours') day, COUNT(*) chats, ROUND(AVG(NULLIF(ai_score, 0)), 2) score,
        SUM(priority = 'hot') hot, SUM(priority = 'human') human FROM chats WHERE ${act} GROUP BY 1 ORDER BY 1`).all(from);
    const worst = db.prepare(`SELECT * FROM chats WHERE ${act} AND ai_score BETWEEN 1 AND 2 ORDER BY last_message_at DESC LIMIT 20`).all(from).map(view);
    const msgsIn = db.prepare(`SELECT COUNT(*) n FROM messages WHERE created_at >= ? AND side IN ${CLIENT}`).get(from).n;
    // how fast our people answer: from a client's message to the next message sent from the CRM
    const replies = db.prepare(`SELECT m.created_at at, m.by_user user, (SELECT MAX(c.created_at) FROM messages c WHERE c.chat_id = m.chat_id AND c.side IN ${CLIENT} AND c.created_at <= m.created_at) asked
      FROM messages m WHERE m.by_user IS NOT NULL AND m.created_at >= ?`).all(from).filter(r => r.asked).map(r => r.at - r.asked).sort((a, b) => a - b);
    // qualification and what people pressed (from the chats: buttons and code words of the automations)
    const q = db.prepare(`SELECT COUNT(lead_score) n, ROUND(AVG(lead_score)) avg, SUM(lead_score >= 80) l80, SUM(lead_score BETWEEN 50 AND 79) l50,
      SUM(lead_score BETWEEN 20 AND 49) l20, SUM(lead_score < 20) l0, SUM(contact <> '') contacts FROM chats WHERE ${act} AND lead_score IS NOT NULL`).get(from);
    const objections = db.prepare(`SELECT objection, COUNT(*) n FROM chats WHERE ${act} AND objection <> '' GROUP BY lower(objection) ORDER BY n DESC LIMIT 12`).all(from);
    const pressed = new Map();
    if (catalog) for (const m of db.prepare(`SELECT side, text FROM messages WHERE created_at >= ? AND side IN ${CLIENT}`).all(from)) {
      const k = catalog.mark(m); if (!k) continue;
      const key = `${k.kind}|${k.label}|${k.name}`; pressed.set(key, (pressed.get(key) || 0) + 1);
    }
    const actions = [...pressed].map(([k, n]) => { const [kind, label, name] = k.split('|'); return { kind, label, name, n }; }).sort((a, b) => b.n - a.n).slice(0, 40);
    return {
      days, chats:Object.values(funnel).reduce((a, b) => a + b, 0), messagesIn:msgsIn, funnel, priority, sources,
      qualification:{ ...Object.fromEntries(Object.entries(q).map(([k, v]) => [k, v || 0])), objections }, actions,
      ai:{ graded:scored.length, avg:scored.length ? +(scored.reduce((a, r) => a + r.ai_score, 0) / scored.length).toFixed(2) : null, dist, issues, issueNames:ISSUE_TYPES, worst },
      byDay, manual:{ replies:replies.length, medianSec:replies.length ? replies[Math.floor(replies.length / 2)] : null },
    };
  }

  const json = (res, code, body, headers = {}) => { res.writeHead(code, { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store', ...headers }); res.end(JSON.stringify(body)); };
  async function body(req) {
    let s = '';
    for await (const c of req) { s += c; if (s.length > 64e3) throw Object.assign(new Error('too large'), { code:413 }); }
    try { return s ? JSON.parse(s) : {}; } catch { return {}; }
  }

  async function act(id, user, kind, fn) {
    const c = chat.get(id);
    if (!c) return [404, { error:'Нет такой переписки' }];
    try {
      const out = await fn(c);
      logEvent(db, id, user.login, kind, out?.log || {});
      return [200, { ok:true, chat:view(chat.get(id)), ...(out?.extra || {}) }];
    } catch (e) {
      log(`${kind} ${id}: ${e.message}`);
      return [502, { error:`ChatPlace не выполнил действие: ${e.message}`.slice(0, 300) }];
    }
  }

  return async function handle(req, res, url) {
    const p = url.pathname;
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    if (p === '/api/health') {
      const m = k => db.prepare('SELECT value FROM meta WHERE key = ?').get(k)?.value ?? null;
      const c = db.prepare(`SELECT COUNT(*) n, SUM(analyzed_at IS NOT NULL) analyzed, SUM(client_count > 0 AND last_message_at > analyzed_upto) waiting FROM chats`).get();
      return json(res, 200, { ok:true, chats:c.n, messages:db.prepare('SELECT COUNT(*) n FROM messages').get().n, analyzed:c.analyzed || 0, toAnalyze:c.waiting || 0,
        lastSync:Number(m('last_sync')) || null, backfill:m('backfill_done') ? 'done' : 'running', chatplace:!!cp, claude:!!analyzer?.on, model,
        requestsPerMin:cp?.rate?.() ?? null, automations:db.prepare('SELECT COUNT(*) n FROM automations WHERE detail IS NOT NULL').get().n, status });
    }
    if (p === '/api/login' && req.method === 'POST') {
      const b = await body(req), r = auth.check(b.login, b.password, ip);
      if (r.error) return json(res, 401, { error:r.error });
      return json(res, 200, { ok:true, user:{ login:r.user.login, name:r.user.name, role:r.user.role } }, { 'set-cookie':auth.cookieFor(r.user, secure) });
    }
    if (p === '/api/logout' && req.method === 'POST') return json(res, 200, { ok:true }, { 'set-cookie':auth.clear });
    const user = auth.userOf(req);
    if (!user) return json(res, 401, { error:'Нужен вход' });
    if (p === '/api/me') return json(res, 200, { user, counts:counts() });

    if (p === '/api/chats' && req.method === 'GET') {
      const q = url.searchParams;
      if (q.get('view') === 'mine') q.set('user', user.login);
      return json(res, 200, { chats:list(q), counts:counts() });
    }
    if (p === '/api/stats') return json(res, 200, stats(Math.min(90, Math.max(1, Number(url.searchParams.get('days')) || 7))));
    if (p === '/api/funnels') return json(res, 200, { funnels:funnels(db, Math.min(90, Math.max(1, Number(url.searchParams.get('days')) || 7))) });
    if (p === '/api/learn' && req.method === 'GET') {
      const bots = Object.fromEntries(db.prepare('SELECT id, username, name FROM bots').all().map(b => [b.id, b.username || b.name]));
      const rows = db.prepare(`SELECT * FROM kb_questions WHERE gone = 0 OR answered_at IS NOT NULL ORDER BY answered_at IS NOT NULL, skipped, first_seen DESC LIMIT 300`).all();
      return json(res, 200, { review:learn?.last() || null, questions:rows.map(r => ({ id:r.id, bot:bots[r.bot_id] || '', question:r.question, seen:r.first_seen,
        draft:r.draft || '', answer:r.answer || '', answeredAt:r.answered_at, answeredBy:r.answered_by, skipped:!!r.skipped, gone:!!r.gone })),
        open:rows.filter(r => !r.gone && !r.answered_at && !r.skipped).length });
    }
    if (p === '/api/learn/review' && req.method === 'POST') {
      const b = await body(req);
      try { return json(res, 200, { review:await learn.review(Math.min(30, Math.max(1, Number(b.days) || 7))) }); }
      catch (e) { return json(res, 502, { error:`Разбор не получился: ${e.message}`.slice(0, 300) }); }
    }
    const lm = p.match(/^\/api\/learn\/([\w-]+)\/(draft|answer|skip|unskip)$/);
    if (lm && req.method === 'POST') {
      const [, qid, act] = lm, row = db.prepare('SELECT * FROM kb_questions WHERE id = ?').get(qid);
      if (!row) return json(res, 404, { error:'Нет такого вопроса' });
      try {
        if (act === 'draft') return json(res, 200, await learn.draft(qid));
        if (act === 'skip' || act === 'unskip') { db.prepare('UPDATE kb_questions SET skipped = ? WHERE id = ?').run(act === 'skip' ? 1 : 0, qid); logEvent(db, null, user.login, 'kb_' + act, { id:qid }); return json(res, 200, { ok:true }); }
        const answer = String((await body(req)).answer || '').trim();
        if (answer.length < 3) return json(res, 400, { error:'Пустой ответ' });
        if (answer.length > 2000) return json(res, 400, { error:'Слишком длинный ответ' });
        if (!cp) throw new Error('ChatPlace не подключён');
        await cp.kbAnswer(qid, answer);   // the answer goes into the AI agent's knowledge base — only on a person's button
        db.prepare('UPDATE kb_questions SET answer = ?, answered_at = ?, answered_by = ? WHERE id = ?').run(answer, now(), user.login, qid);
        logEvent(db, null, user.login, 'kb_answer', { id:qid, question:row.question.slice(0, 200) });
        return json(res, 200, { ok:true });
      } catch (e) { log(`learn ${act} ${qid}: ${e.message}`); return json(res, 502, { error:`Не получилось: ${e.message}`.slice(0, 300) }); }
    }
    if (p === '/api/sync' && req.method === 'POST') {
      const r = await sync.run().catch(e => ({ error:e.message }));
      analyzer?.run().catch(() => {});
      return json(res, r.error ? 502 : 200, r);
    }

    const m = p.match(/^\/api\/chats\/([\w-]+)(?:\/(\w+))?$/);
    if (!m) return json(res, 404, { error:'not found' });
    const [, id, action] = m;
    if (!action && req.method === 'GET') {
      const c = chat.get(id);
      if (!c) return json(res, 404, { error:'Нет такой переписки' });
      return json(res, 200, { chat:view(c), messages:msgs.all(id).map(x => ({ id:x.id, side:x.side, text:x.text, at:x.created_at, type:x.type_name,
        media:x.media ? JSON.parse(x.media) : [], by:x.by_user, mark:catalog?.mark(x) || null })), events:events.all(id).map(e => ({ at:e.at, user:e.user, kind:e.kind, data:JSON.parse(e.data || '{}') })) });
    }
    if (req.method !== 'POST') return json(res, 405, { error:'method' });
    const b = await body(req);
    let r;
    if (action === 'take') r = await act(id, user, 'take', async c => {
      if (c.type !== 1) await cp.open(id);
      db.prepare('UPDATE chats SET type = 1, handled_by = ?, handled_at = ? WHERE id = ?').run(user.login, now(), id);
    });
    else if (action === 'release') r = await act(id, user, 'release', async c => {
      if (c.type === 1) await cp.close(id);
      db.prepare('UPDATE chats SET type = 2, handled_by = NULL WHERE id = ?').run(id);
    });
    else if (action === 'reply') {
      const text = String(b.text || '').trim();
      if (!text) return json(res, 400, { error:'Пустое сообщение' });
      if (text.length > 4000) return json(res, 400, { error:'Слишком длинное сообщение' });
      r = await act(id, user, 'reply', async c => {
        if (c.type !== 1) await cp.open(id);         // ChatPlace sends from an operator only into an open chat — the AI pauses here
        await cp.send(id, text);
        const at = now();
        db.prepare(`INSERT INTO messages(id, chat_id, side, text, created_at, by_user) VALUES(?, ?, 'operator', ?, ?, ?)`).run(`crm-${id}-${Date.now()}`, id, text, at, user.login);
        db.prepare(`UPDATE chats SET type = 1, handled_by = COALESCE(handled_by, ?), handled_at = COALESCE(handled_at, ?), last_side = 'operator', last_reply_at = ?,
          msg_count = msg_count + 1, reviewed_upto = MAX(reviewed_upto, last_client_at), reviewed_by = ? WHERE id = ?`).run(user.login, at, at, user.login, id);
        return { log:{ chars:text.length } };
      });
    }
    else if (action === 'stage') {
      if (!STAGES.includes(b.stage)) return json(res, 400, { error:'Нет такого этапа' });
      r = await act(id, user, 'stage', async c => {
        db.prepare('UPDATE chats SET stage = ?, stage_manual = 1 WHERE id = ?').run(b.stage, id);
        return { log:{ from:c.stage, to:b.stage } };
      });
    }
    else if (action === 'priority') {
      if (RANK[b.priority] == null) return json(res, 400, { error:'Нет такого приоритета' });
      r = await act(id, user, 'priority', async c => { db.prepare('UPDATE chats SET priority = ? WHERE id = ?').run(b.priority, id); return { log:{ from:c.priority, to:b.priority } }; });
    }
    else if (action === 'review') r = await act(id, user, b.undo ? 'unreview' : 'review', async () => {
      db.prepare('UPDATE chats SET reviewed_upto = ?, reviewed_by = ? WHERE id = ?').run(b.undo ? 0 : now(), b.undo ? null : user.login, id);
    });
    else if (action === 'refresh') r = await act(id, user, 'refresh', async c => {
      await sync.pullMessages({ ...c, last_message_at:c.last_message_at });
      if (analyzer?.on) { db.prepare('UPDATE chats SET analyzed_upto = 0 WHERE id = ?').run(id); await analyzer.analyzeChat(chat.get(id)); }
    });
    else return json(res, 404, { error:'not found' });
    return json(res, r[0], r[1]);
  };
}
