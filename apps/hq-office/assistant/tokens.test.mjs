// Автопродление токенов Instagram и Threads (tokens.mjs) — на заглушке Graph API
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTokens } from './tokens.mjs';
import { keys, useTokens } from './publish.mjs';

const servers = [], dirs = [];
after(() => { for (const s of servers) s.close(); for (const d of dirs) fs.rmSync(d, { recursive:true, force:true }); });

test('токены продлеваются раз в неделю, продлённый идёт в публикации и исполнителю; новый секрет — заново; сбой у конца срока — в Telegram', async () => {
  const calls = [];
  let fail = false;
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname !== '/refresh_access_token') { res.writeHead(200, { 'content-type':'application/json' }); return res.end(JSON.stringify({ id:'1', user_id:'1', username:'ilia.paliy' })); }
    calls.push({ p:u.pathname, grant:u.searchParams.get('grant_type'), tok:u.searchParams.get('access_token') });
    res.writeHead(fail ? 400 : 200, { 'content-type':'application/json' });
    res.end(JSON.stringify(fail ? { error:{ message:'Session has expired' } } : { access_token:u.searchParams.get('access_token') + '+r', expires_in:5184000 }));
  }).listen(0);
  servers.push(srv);
  const base = `http://127.0.0.1:${srv.address().port}`;
  process.env.HQ_IG_GRAPH_BASE = base; process.env.HQ_THREADS_GRAPH_BASE = base;
  process.env.HQ_IG_ACCESS_TOKEN = 'IGa'; process.env.HQ_THREADS_ACCESS_TOKEN = 'THa'; process.env.HQ_IG_USER_ID = '';
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tok-')); dirs.push(dataDir);
  let t = 1_000_000_000_000;
  const said = [];
  const tk = createTokens({ dataDir, notify:async m => said.push(m), now:() => t });
  useTokens(tk);
  await tk.tick();
  assert.deepEqual(calls.map(c => [c.p, c.grant, c.tok]), [['/refresh_access_token', 'ig_refresh_token', 'IGa'], ['/refresh_access_token', 'th_refresh_token', 'THa']]);
  assert.equal(keys().ig, 'IGa+r'); assert.equal(keys().threads, 'THa+r');
  assert.deepEqual(tk.runnerKeys(), { IG_ACCESS_TOKEN:'IGa+r', THREADS_ACCESS_TOKEN:'THa+r' });
  assert.equal((fs.statSync(path.join(dataDir, 'tokens.json')).mode & 0o777), 0o600);
  // a day later — too early; a week later — again, with the refreshed token
  t += 864e5; await tk.tick(); assert.equal(calls.length, 2);
  t += 7 * 864e5; await tk.tick(); assert.equal(calls.length, 4); assert.equal(calls[2].tok, 'IGa+r'); assert.equal(keys().ig, 'IGa+r+r');
  // after a restart the refreshed token is still there
  assert.equal(createTokens({ dataDir, now:() => t }).get('ig'), 'IGa+r+r');
  // a new secret wins over the refreshed old one
  process.env.HQ_IG_ACCESS_TOKEN = 'IGb';
  assert.equal(keys().ig, 'IGb');
  // refresh fails close to the end of the term — one message a day
  fail = true;
  t += 55 * 864e5; await tk.refresh('threads');
  assert.equal(said.length, 1); assert.match(said[0], /Threads не продлевается: Session has expired/); assert.match(said[0], /HQ_THREADS_ACCESS_TOKEN/);
  await tk.refresh('threads', { force:true }); assert.equal(said.length, 1);
  assert.equal(keys().threads, 'THa+r+r');   // the last good one still works until it expires
  // a Facebook token is not refreshed this way
  process.env.HQ_IG_ACCESS_TOKEN = 'EAAx';
  const n = calls.length;
  assert.match((await tk.refresh('ig', { force:true })).skipped, /Facebook/); assert.equal(calls.length, n);
  for (const k of ['HQ_IG_GRAPH_BASE', 'HQ_THREADS_GRAPH_BASE', 'HQ_IG_ACCESS_TOKEN', 'HQ_THREADS_ACCESS_TOKEN', 'HQ_IG_USER_ID']) delete process.env[k];
  useTokens(null);
});

test('токены: перепутанные секреты и мусор при вставке распознаются по виду; токен Facebook находит id Instagram; нерабочий токен — сообщение', async () => {
  const { sources } = await import('./tokens.mjs');
  const { publishInstagram } = await import('./publish.mjs');
  process.env.HQ_IG_ACCESS_TOKEN = ' "THabc" \n'; process.env.HQ_THREADS_ACCESS_TOKEN = 'Bearer IGxyz\n';
  assert.deepEqual(sources(), { ig:'IGxyz', threads:'THabc', swapped:true });
  process.env.HQ_IG_ACCESS_TOKEN = 'EAAfb'; process.env.HQ_THREADS_ACCESS_TOKEN = '';
  assert.equal(sources().ig, 'EAAfb');
  const calls = [];
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'); calls.push(u.pathname);
    const send = (c, j) => { res.writeHead(c, { 'content-type':'application/json' }); res.end(JSON.stringify(j)); };
    if (u.pathname.endsWith('/me/accounts')) return send(200, { data:[{ id:'page' }, { id:'p2', instagram_business_account:{ id:'1784', username:'ilia.paliy' } }] });
    if (u.pathname.endsWith('/v1.0/me')) return send(400, { error:{ message:'Invalid OAuth access token - Cannot parse access token' } });
    if (req.method === 'GET') return send(200, { status_code:'FINISHED', permalink:'https://www.instagram.com/reel/X/' });
    send(200, { id:u.pathname.endsWith('media_publish') ? 'PUB' : 'C1' });
  }).listen(0);
  servers.push(srv);
  const base = `http://127.0.0.1:${srv.address().port}`;
  // publishing with a Facebook token and no HQ_IG_USER_ID: the account is found through the page
  const r = await publishInstagram({ token:'EAAfb', caption:'x', media:[{ url:'https://x/v.mp4', kind:'video', name:'v.mp4' }], base, wait:{ every:1 } });
  assert.equal(r.id, 'PUB'); assert.ok(calls.some(p => p.endsWith('/1784/media')));
  // check(): Facebook token → the linked account; broken Threads token → one message with what to do
  process.env.HQ_FB_GRAPH_BASE = base; process.env.HQ_THREADS_GRAPH_BASE = base; process.env.HQ_THREADS_ACCESS_TOKEN = 'THbad';
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tok-')); dirs.push(dataDir);
  const said = [];
  const tk = createTokens({ dataDir, notify:async m => said.push(m) });
  assert.equal((await tk.check('ig')).account, 'ilia.paliy');
  assert.equal(tk.igUser(), '1784'); assert.equal(tk.runnerKeys().IG_USER_ID, '1784');
  assert.match((await tk.check('threads')).error, /Cannot parse/);
  await tk.check('threads');
  assert.equal(said.length, 1); assert.match(said[0], /Токен Threads не работает/); assert.match(said[0], /начинается с TH/);
  assert.equal(tk.status().threads.error.includes('Cannot parse'), true);
  for (const k of ['HQ_IG_ACCESS_TOKEN', 'HQ_THREADS_ACCESS_TOKEN', 'HQ_FB_GRAPH_BASE', 'HQ_THREADS_GRAPH_BASE']) delete process.env[k];
});
