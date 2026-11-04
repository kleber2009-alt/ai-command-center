/* Check of the CRM with a fake ChatPlace (an MCP server over HTTP) and a fake Claude — runs on every deploy.
   Sync pulls chats and messages, the analyzer fills priority/stage/grade, the queue orders hot first,
   Bogdan logs in, takes a chat, answers (the answer is not doubled when ChatPlace returns it), sets a stage,
   gives the chat back, the stats count it. Run: node --disable-warning=ExperimentalWarning check.mjs */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { openDb } from './lib/db.mjs';
import { createChatPlace, chatPlaceFromMcpJson } from './lib/chatplace.mjs';
import { createSync } from './lib/sync.mjs';
import { createAnalyzer } from './lib/analyze.mjs';
import { createAuth, loadUsers } from './lib/auth.mjs';
import { createApi } from './lib/api.mjs';
import { createCatalog } from './lib/catalog.mjs';
import { createLearn } from './lib/learn.mjs';

const T = Math.floor(Date.now() / 1000);
const chats = [
  { id:'c-hot', clientId:'k1', clientName:'Анна', status:1, type:2, lastMessageAt:T - 900 },
  { id:'c-ok', clientId:'k2', clientName:'Олег', status:1, type:2, lastMessageAt:T - 1200 },
  { id:'c-old', clientId:'k3', clientName:'Старый', status:1, type:2, lastMessageAt:T - 40 * 86400 },
];
const msgs = {
  'c-hot':[
    { id:'m3', side:'client', message:'Сколько стоит курс и можно в рассрочку?', createdAt:T - 900, mediaFiles:[] },
    { id:'m2', side:'bot', message:'Держите скилл «AI-монтажёр»', createdAt:T - 1000, mediaFiles:[] },
    { id:'m1', side:'client', message:'МОНТАЖ', createdAt:T - 1010, mediaFiles:[] },
  ],
  'c-ok':[
    { id:'n2', side:'bot', message:'Держите гайд', createdAt:T - 1200, mediaFiles:[{ typeName:'image', url:'https://example.com/a.jpg' }] },
    { id:'n1', side:'client', message:'ГАЙД', createdAt:T - 1210, mediaFiles:[] },
  ],
  'c-old':[{ id:'o1', side:'client', message:'привет', createdAt:T - 40 * 86400, mediaFiles:[] }],
};
const calls = [], kbAnswers = [];
let rateLimit = false;
const mcp = http.createServer(async (req, res) => {
  let s = ''; for await (const c of req) s += c;
  const b = JSON.parse(s);
  if (rateLimit && b.method === 'tools/call') { calls.push('429'); res.writeHead(429, { 'content-type':'application/json' }); return res.end('{"title":"Error 1015: You are being rate limited"}'); }
  assert.equal(req.headers.authorization, 'Bearer cp-token');
  if (b.id == null) { res.writeHead(202); return res.end(); }
  let result = {};
  if (b.method === 'initialize') { res.setHeader('mcp-session-id', 'sess-1'); result = { protocolVersion:'2025-06-18', capabilities:{} }; }
  if (b.method === 'tools/call') {
    const { name, arguments:a } = b.params;
    calls.push(name);
    let data;
    if (name === 'chats_list') {
      // keyset pagination like ChatPlace: newest first, after (lastItemTimestamp, lastItemId)
      let all = [...chats].sort((x, y) => y.lastMessageAt - x.lastMessageAt || (x.id < y.id ? -1 : 1));
      if (a.lastItemId) { const i = all.findIndex(c => c.id === a.lastItemId); all = all.slice(i + 1); }
      const page = all.slice(0, a.limit || 20), last = page.at(-1);
      data = { items:page, hasNextItems:all.length > page.length, lastItemId:last?.id, lastItemTimestamp:String(last?.lastMessageAt || '') };
    }
    if (name === 'chats_messages') data = (msgs[a.chatId] || []).slice((a.page - 1) * a.limit, a.page * a.limit);
    if (name === 'bots_list') data = [{ id:'bot-ig', name:'Илья', username:'@ilia.paliy', platform:{ label:'instagram' } }];
    if (name === 'automations_list') data = [{ id:'au-1', name:'МОНТАЖ → скилл', statusName:'Active', startMessages:['Монтаж', 'Сетап'] }];
    if (name === 'automations_get_detail') data = { id:'au-1', name:'МОНТАЖ → скилл', steps:[{ messages:[
      { id:'m-1', isFirstMessage:true, text:'Привет! Жми кнопку — пришлю скилл', clientsCount:100, inlineButtons:[{ id:'b-1', text:'Хочу скилл', trackClicks:true, clientsCount:60, ctr:60 }] },
      { id:'m-2', text:'Держите скилл «AI-монтажёр»', clientsCount:55, inlineButtons:[{ id:'b-2', text:'Записаться бесплатно', url:'https://aicex.club/practicum', trackClicks:true, clientsCount:9, ctr:16.4 }] }] }] };
    if (name === 'ai_agent_knowledge_base_questions') data = [{ id:'kq-1', question:'Как купить курс?' }, { id:'kq-2', question:'Сколько стоит лазерный липолиз?' }];
    if (name === 'ai_agent_knowledge_base_add_answer') { kbAnswers.push(a); data = { ok:true }; }
    if (name === 'chats_get') data = { ...chats.find(c => c.id === a.chatId), username:'user_' + a.chatId };
    if (name === 'chats_open') { chats.find(c => c.id === a.chatId).type = 1; data = { ok:true }; }
    if (name === 'chats_close') { chats.find(c => c.id === a.chatId).type = 2; data = { ok:true }; }
    if (name === 'chats_send_message') {
      const c = chats.find(x => x.id === a.chatId);
      assert.equal(c.type, 1, 'send only into an open chat');
      msgs[a.chatId].unshift({ id:'real-' + msgs[a.chatId].length, side:'operator', message:a.text, createdAt:Math.floor(Date.now() / 1000), mediaFiles:[] });
      c.lastMessageAt = Math.floor(Date.now() / 1000) + 1;
      data = { ok:true };
    }
    result = { content:[{ type:'text', text:JSON.stringify(data) }] };
  }
  // answer as an event stream, like ChatPlace does
  res.writeHead(200, { 'content-type':'text/event-stream' });
  res.end(`event: message\ndata: ${JSON.stringify({ jsonrpc:'2.0', id:b.id, result })}\n\n`);
});
await new Promise(r => mcp.listen(0, r));
const MCP_URL = `http://127.0.0.1:${mcp.address().port}/mcp`;

// the office's mcp-config → the chatplace server
const cfg = chatPlaceFromMcpJson(JSON.stringify({ mcpServers:{ heygen:{ command:'uvx' }, chatplace:{ type:'http', url:MCP_URL, headers:{ Authorization:'Bearer ${CP_TOKEN}' } } } }), { CP_TOKEN:'cp-token' });
assert.equal(cfg.url, MCP_URL);
assert.equal(cfg.headers.Authorization, 'Bearer cp-token');

const answers = {
  'Анна':{ lead_score:85, interest:'курс по монтажу', objection:'цена', contact:'+7 900 000-00-00', priority:'hot', priority_reason:'спрашивает цену и рассрочку', stage:'hot', intent:'вопрос о цене', source:'МОНТАЖ', summary:'Забрала скилл, спрашивает цену курса', next_step:'Ответить про рассрочку', ai_score:2, ai_verdict:'Не ответил на вопрос о цене', ai_issues:[{ type:'ignored_question', text:'вопрос о рассрочке без ответа' }, { type:'bogus', text:'x' }] },
  'Олег':{ lead_score:15, interest:'', objection:'', contact:'', priority:'normal', priority_reason:'получил материал', stage:'warm', intent:'кодовое слово', source:'ГАЙД', summary:'Забрал гайд', next_step:'ничего — ИИ справился', ai_score:5, ai_verdict:'Всё чётко', ai_issues:[] },
};
let claudeCalls = 0;
const claude = { beta:{ messages:{ create:async req => {
  claudeCalls++;
  const txt = req.messages[0].content;
  if (txt.startsWith('Вопрос:')) return { stop_reason:'end_turn', content:[{ type:'text', text:JSON.stringify(/липолиз/.test(txt) ? { skip:true, reason:'не про блог', answer:'' } : { skip:false, reason:'', answer:'Напиши «Богдан» — подключу менеджера.' }) }] };
  if (txt.startsWith('Период:')) return { stop_reason:'end_turn', content:[{ type:'text', text:'## Главное\n- ИИ не отвечает о цене' }] };
  assert.equal(req.output_config.format.type, 'json_schema');
  const name = txt.match(/Клиент: (\S+)/)[1];
  return { stop_reason:'end_turn', content:[{ type:'text', text:JSON.stringify(answers[name]) }] };
} } } };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dcrm-'));
const db = openDb(dir);
const cp = createChatPlace({ ...cfg, gapMs:0 });
const sync = createSync({ db, cp, backfillDays:14, log:() => {} });
const analyzer = createAnalyzer({ db, claude, model:'m', quietSec:60, log:() => {} });
const users = loadUsers({ CRM_BOGDAN_PASSWORD:'b-pass', CRM_OWNER_PASSWORD:'i-pass' });
const auth = createAuth({ db, users });
const catalog = createCatalog({ db, cp, log:() => {} }), learn = createLearn({ db, claude, model:'m' });
const handle = createApi({ db, cp, auth, sync, analyzer, catalog, learn, log:() => {} });
const srv = http.createServer((req, res) => handle(req, res, new URL(req.url, 'http://x')));
await new Promise(r => srv.listen(0, r));
const BASE = `http://127.0.0.1:${srv.address().port}/api`;
let cookie = '';
async function call(p, body, method) {
  const r = await fetch(BASE + p, { method:method || (body ? 'POST' : 'GET'), headers:{ 'content-type':'application/json', cookie }, body:body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  return { status:r.status, body:await r.json() };
}

// 1. first sync: two recent chats, the 40-day-old one stays out
let s = await sync.run();
assert.equal(s.firstRun, true);
assert.equal(s.chats, 2);
assert.equal(s.messages, 5);
assert.equal(db.prepare('SELECT COUNT(*) n FROM chats').get().n, 2);
assert.equal(db.prepare("SELECT username FROM chats WHERE id = 'c-hot'").get().username, 'user_c-hot');
const st = db.prepare("SELECT * FROM chats WHERE id = 'c-hot'").get();
assert.equal(st.last_side, 'client'); assert.equal(st.client_count, 2);

// 2. analysis: both chats, unknown issue types dropped; nothing new → no second call
let a = await analyzer.run();
assert.equal(a.analyzed, 2);
assert.equal(claudeCalls, 2);
const hot = db.prepare("SELECT * FROM chats WHERE id = 'c-hot'").get();
assert.equal(hot.priority, 'hot'); assert.equal(hot.stage, 'hot'); assert.equal(hot.source, 'МОНТАЖ'); assert.equal(hot.ai_score, 2);
assert.equal(JSON.parse(hot.ai_issues).length, 1);
await analyzer.run(); assert.equal(claudeCalls, 2);
s = await sync.run(); assert.equal(s.chats, 0, 'nothing new on the second pass');

// 3. login
assert.equal((await call('/chats')).status, 401);
assert.equal((await call('/login', { login:'bogdan', password:'nope' })).status, 401);
let r = await call('/login', { login:'Bogdan', password:'b-pass' });
assert.equal(r.status, 200); assert.equal(r.body.user.name, 'Богдан'); assert.ok(cookie.startsWith('dcrm='));
assert.equal((await call('/me')).body.user.login, 'bogdan');

// 4. queue: hot chat first; the normal one waits > 10 min with the last word from the bot → not in the queue
r = await call('/chats?view=queue');
assert.deepEqual(r.body.chats.map(c => c.id), ['c-hot']);
assert.equal(r.body.counts.hot, 1);
assert.ok(r.body.chats[0].waiting >= 900);
r = await call('/chats?view=all&q=гайд');
assert.deepEqual(r.body.chats.map(c => c.id), ['c-ok']);
r = await call('/chats/c-ok');
assert.equal(r.body.messages.length, 2); assert.equal(r.body.messages[1].media[0].url, 'https://example.com/a.jpg');

// 5. answer from the CRM: ChatPlace opens the chat first, then sends; the copy is not doubled on the next sync
r = await call('/chats/c-hot/reply', { text:'Рассрочка есть, пришлю ссылку' });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.deepEqual(calls.slice(-2), ['chats_open', 'chats_send_message']);
assert.equal(r.body.chat.ai, false); assert.equal(r.body.chat.handledBy, 'bogdan'); assert.equal(r.body.chat.reviewed, true);
assert.equal((await call('/chats?view=queue')).body.chats.length, 0, 'answered → out of the queue');
assert.equal((await call('/chats?view=mine')).body.chats[0].id, 'c-hot');
await sync.run();
const mine = db.prepare("SELECT * FROM messages WHERE chat_id = 'c-hot' AND side = 'operator'").all();
assert.equal(mine.length, 1, 'no double of our own answer'); assert.equal(mine[0].by_user, 'bogdan'); assert.ok(mine[0].id.startsWith('real-'));

// 6. stage by hand survives the next analysis; give the chat back to the AI
r = await call('/chats/c-hot/stage', { stage:'customer' });
assert.equal(r.body.chat.stage, 'customer'); assert.equal(r.body.chat.stageManual, true);
db.prepare("UPDATE chats SET analyzed_upto = 0, last_message_at = ? WHERE id = 'c-hot'").run(T - 120);
await analyzer.run();
assert.equal(db.prepare("SELECT stage FROM chats WHERE id = 'c-hot'").get().stage, 'customer');
r = await call('/chats/c-hot/release', {});
assert.equal(r.body.chat.ai, true); assert.equal(calls.at(-1), 'chats_close');
assert.equal((await call('/chats/c-hot/stage', { stage:'nope' })).status, 400);

// 6b. the catalog: one ChatPlace request per step — bots, the automation list, its detail, the AI's open questions
const steps = [];
for (let i = 0; i < 5; i++) steps.push(await catalog.step());
assert.deepEqual(steps.map(x => x && x.split(' ')[0]), ['bots', 'automations', 'automation', 'questions', null]);
assert.deepEqual(catalog.mark({ side:'client', text:'Хочу скилл' }), { kind:'button', label:'Хочу скилл', automation:'au-1', name:'МОНТАЖ' });
assert.equal(catalog.mark({ side:'client', text:'МОНТАЖ' }).kind, 'codeword');
assert.equal(catalog.mark({ side:'client', text:'просто вопрос' }), null);
assert.equal(catalog.mark({ side:'bot', text:'Держите скилл «AI-монтажёр»' }).kind, 'step');
r = await call('/chats/c-hot');
assert.equal(r.body.messages.find(m => m.text === 'МОНТАЖ').mark.kind, 'codeword');
assert.equal(r.body.chat.leadScore, 85); assert.equal(r.body.chat.contact, '+7 900 000-00-00');
r = await call('/funnels?days=7');
const fn = r.body.funnels[0];
assert.equal(fn.entered, 100); assert.equal(fn.links, 9); assert.equal(fn.steps[0].buttons[0].clicks, 60);
// teaching the AI manager: a draft, a skip suggestion, and the answer goes to ChatPlace only on the button
r = await call('/learn'); assert.equal(r.body.open, 2);
r = await call('/learn/kq-1/draft', {}); assert.equal(r.body.answer, 'Напиши «Богдан» — подключу менеджера.');
r = await call('/learn/kq-2/draft', {}); assert.equal(r.body.skip, true);
assert.equal(kbAnswers.length, 0, 'nothing goes to ChatPlace without the button');
r = await call('/learn/kq-1/answer', { answer:'Напиши «Богдан» — подключу менеджера.' }); assert.equal(r.status, 200);
assert.deepEqual(kbAnswers, [{ datasetId:'kq-1', answer:'Напиши «Богдан» — подключу менеджера.' }]);
r = await call('/learn'); assert.equal(r.body.open, 0); assert.equal(r.body.questions.find(q => q.id === 'kq-1').answeredBy, 'bogdan');
r = await call('/learn/review', { days:7 }); assert.match(r.body.review.text, /Главное/);

// 7. stats: funnel, sources, AI grades, manual answers
r = await call('/stats?days=7');
assert.equal(r.body.chats, 2);
assert.equal(r.body.funnel.customer, 1); assert.equal(r.body.funnel.warm, 1);
assert.equal(r.body.sources.find(x => x.source === 'МОНТАЖ').customer, 1);
assert.equal(r.body.ai.graded, 2); assert.equal(r.body.ai.issues.ignored_question, 1);
assert.equal(r.body.manual.replies, 1);
assert.equal(r.body.qualification.l80, 1); assert.equal(r.body.qualification.contacts, 1);
assert.equal(r.body.qualification.objections[0].objection, 'цена');
assert.ok(r.body.actions.some(a => a.kind === 'codeword' && a.name === 'МОНТАЖ'));
const ev = db.prepare('SELECT kind FROM events ORDER BY id').all().map(e => e.kind);
assert.deepEqual(ev, ['reply', 'stage', 'release', 'kb_answer']);

// 8. a long history: one page per pass, the rest comes by backfill from the oldest chat we keep
const saved = chats.splice(0);
for (let i = 0; i < 120; i++) { chats.push({ id:'h' + i, clientId:'x' + i, clientName:'К' + i, status:1, type:2, lastMessageAt:T - 3600 - i * 600 }); msgs['h' + i] = [{ id:'hm' + i, side:'client', message:'слово ' + i, createdAt:T - 3600 - i * 600, mediaFiles:[] }]; }
chats.push({ id:'h-old', clientId:'xo', clientName:'Старый', status:1, type:2, lastMessageAt:T - 30 * 86400 }); msgs['h-old'] = [];
const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'dcrm-')), db2 = openDb(dir2);
const sync2 = createSync({ db:db2, cp, backfillDays:14, maxPages:1, backfillPages:1, pullsPerPass:40, log:() => {} });
const count = () => db2.prepare('SELECT COUNT(*) n FROM chats').get().n, nmsg = () => db2.prepare('SELECT COUNT(*) n FROM messages').get().n;
let p = await sync2.run(); assert.equal(count(), 100, 'first pass: one page + one backfill page'); assert.notEqual(p.backfill, 'done');
assert.equal(nmsg(), 40, 'messages of at most pullsPerPass chats per pass'); assert.equal(p.pending, 60);
p = await sync2.run(); assert.equal(count(), 120); assert.equal(p.backfill, 'done');
p = await sync2.run(); p = await sync2.run();
assert.equal(nmsg(), 120, 'the queue in the database brings every chat'); assert.equal(p.pending, 0);
assert.equal(db2.prepare("SELECT COUNT(*) n FROM chats WHERE id = 'h-old'").get().n, 0, 'older than BACKFILL_DAYS stays out');
p = await sync2.run(); assert.equal(p.chats, 0);

// 9. ChatPlace answers 429 (Cloudflare 1015): the pass stops at once with rateLimited, and goes on later
chats.push({ id:'h-new', clientId:'xn', clientName:'Новый', status:1, type:2, lastMessageAt:T + 10 }); msgs['h-new'] = [{ id:'hn', side:'client', message:'цена?', createdAt:T + 10, mediaFiles:[] }];
rateLimit = true; const before = calls.length;
await assert.rejects(sync2.run(), e => e.rateLimited === true);
assert.ok(calls.length - before <= 1, 'no more requests after a rate-limit answer');
rateLimit = false;
p = await sync2.run(); assert.equal(p.messages, 1);
db2.close(); fs.rmSync(dir2, { recursive:true, force:true });
chats.splice(0, chats.length, ...saved);

await call('/logout', {}); cookie = '';
assert.equal((await call('/me')).status, 401);
srv.close(); mcp.close(); db.close();
fs.rmSync(dir, { recursive:true, force:true });
console.log('direct-crm check: ok');
