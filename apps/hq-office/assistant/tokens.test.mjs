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
