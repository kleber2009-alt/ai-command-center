// Личный кабинет: интеграции (свои ключи сервисов) и регистрация пользователей
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initIntegrations, CATALOG } from './integrations.mjs';
import { initTeam } from './team.mjs';

const dirs = [];
after(() => { for (const d of dirs) fs.rmSync(d, { recursive:true, force:true }); });
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'integ-')); dirs.push(d); return d; };

test('каталог: все связки офиса с полями и проверкой', () => {
  const ids = CATALOG.map(c => c.id);
  for (const id of ['anthropic', 'openai', 'elevenlabs', 'heygen', 'apify', 'deepgram', 'kie', 'instagram', 'threads', 'meta-ads', 'chatplace', 'youtube', 'telegram'])
    assert.ok(ids.includes(id), id);
  for (const c of CATALOG) { assert.ok(c.fields.length && c.fields.some(f => !f.optional)); assert.equal(typeof c.test, 'function'); assert.ok(c.site.startsWith('https://')); }
});

test('ключ сохраняется зашифрованным, наружу — только маска; проверка у сервиса; у каждого свои; env и MCP задачи', async () => {
  const dataDir = tmp(), calls = [];
  const fetchFn = async (url, init = {}) => {
    calls.push({ url:String(url), headers:init.headers || {} });
    const bad = String(url).includes('token=BAD');
    return new Response(JSON.stringify(bad ? { error:{ message:'Unauthorized' } } : { data:{ username:'ilia' } }), { status:bad ? 401 : 200 });
  };
  const I = initIntegrations({ dataDir, secret:'s3cret', fetchFn });
  const r = await I.set('u-1', 'apify', { APIFY_TOKEN:'  apify_api_SECRET1234 \n' });
  assert.equal(r.ok, true); assert.equal(r.check.ok, true); assert.equal(r.check.account, 'ilia');
  assert.ok(calls[0].url.includes('token=apify_api_SECRET1234'));   // cleaned of spaces and the line break
  const raw = fs.readFileSync(path.join(dataDir, 'integrations.json'), 'utf8');
  assert.ok(!raw.includes('SECRET1234'));                           // encrypted at rest
  assert.equal((fs.statSync(path.join(dataDir, 'integrations.json')).mode & 0o777), 0o600);
  const card = I.list('u-1').find(c => c.id === 'apify');
  assert.equal(card.connected, true); assert.equal(card.fields[0].value, '•••• 1234');
  assert.ok(!JSON.stringify(I.list('u-1')).includes('SECRET1234'));
  // another person — nothing of the first one's
  assert.equal(I.list('u-2').find(c => c.id === 'apify').connected, false);
  assert.deepEqual(I.envFor('u-2'), {});
  assert.deepEqual(I.envFor('u-1'), { APIFY_TOKEN:'apify_api_SECRET1234' });
  // a broken key: saved, the check says what the service answered
  const b = await I.set('u-2', 'apify', { APIFY_TOKEN:'BAD' });
  assert.equal(b.check.ok, false); assert.match(b.check.error, /Unauthorized/);
  // required field missing
  assert.match((await I.set('u-1', 'meta-ads', { META_AD_ACCOUNT:'act_1' })).error, /Токен/);
  // MCP of the task: ChatPlace with the person's token
  await I.set('u-1', 'chatplace', { CHATPLACE_API_TOKEN:'cp-USER' });
  const m = I.mcpFor('u-1');
  assert.equal(m.length, 1); assert.equal(m[0].header, 'Authorization'); assert.equal(m[0].prefix, 'Bearer '); assert.equal(m[0].value, 'cp-USER');
  // an empty field on update keeps the old secret; remove deletes
  await I.set('u-1', 'apify', { APIFY_TOKEN:undefined });
  assert.equal(I.envFor('u-1').APIFY_TOKEN, 'apify_api_SECRET1234');
  I.remove('u-1', 'apify');
  assert.equal(I.envFor('u-1').APIFY_TOKEN, undefined);
  // after a restart with the same secret the keys read back; with another — not
  assert.equal(initIntegrations({ dataDir, secret:'s3cret', fetchFn }).envFor('u-1').CHATPLACE_API_TOKEN, 'cp-USER');
  assert.equal(initIntegrations({ dataDir, secret:'other', fetchFn }).envFor('u-1').CHATPLACE_API_TOKEN, '');
});

test('регистрация и вход по почте и паролю; руководитель задаёт пароль; без агентов — только кабинет', () => {
  const T = initTeam(tmp());
  const r = T.register({ name:'Анна', email:'Anna@Example.com ', password:'12345678' });
  assert.equal(r.user.role, 'user'); assert.deepEqual(r.user.agents, []); assert.equal(r.user.email, 'anna@example.com');
  assert.ok(!JSON.stringify(T.list()).includes(r.user.pass.hash));   // the owner's list shows no password hashes
  assert.throws(() => T.register({ email:'anna@example.com', password:'12345678' }), /уже зарегистрирована/);
  assert.throws(() => T.register({ email:'b@x.ru', password:'123' }), /от 8/);
  assert.equal(T.login({ email:'anna@example.com', password:'wrong-pass' }), null);
  const l = T.login({ email:'ANNA@example.com', password:'12345678' });
  assert.ok(l && T.check(l.value)?.id === r.user.id);
  // a head from an invite link sets a password
  const h = T.invite({ id:'firuza', name:'Фируза', dept:'marketing', agents:['scripts'] });
  assert.equal(h.user.role, 'head');
  T.setPassword('firuza', { email:'f@aicex.club', password:'qwertyui' });
  assert.equal(T.login({ email:'f@aicex.club', password:'qwertyui' }).user.id, 'firuza');
  // disabled — no login
  T.update(r.user.id, { disabled:true });
  assert.equal(T.login({ email:'anna@example.com', password:'12345678' }), null);
});
