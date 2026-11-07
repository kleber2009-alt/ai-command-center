/* Интеграции личного кабинета: каждый человек офиса (владелец, руководитель, пользователь) подключает свои ключи сервисов —
   Apify, ElevenLabs, HeyGen, Claude, Instagram, Threads… — и его задачи идут на его ключах.

   Хранилище: DATA_DIR/integrations.json, значения зашифрованы (AES-256-GCM, ключ — из секрета сервера). Наружу ключи не отдаются
   никогда — только «подключено · …abcd», когда проверено и чей аккаунт.
   Использование: envFor(uid) → { APIFY_TOKEN, ELEVENLABS_API_KEY, … } — исполнитель кладёт это в окружение задачи этого человека
   (claim → env), скрипты скиллов берут ключ из окружения раньше общего keys.env; ChatPlace и HeyGen — ещё и в MCP задачи.
   Владелец без своих ключей работает на общих ключах офиса (секреты GitHub) — у его карточек видно «ключ офиса». */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const env = k => String(process.env[k] || '').trim();
const T = 20e3;

async function ask(fetchFn, url, init = {}) {
  const r = await fetchFn(url, { ...init, signal:AbortSignal.timeout(T) });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch {}
  if (!r.ok || j?.error) {
    const e = j?.error;
    throw new Error((typeof e === 'string' ? e : e?.message || e?.error_user_msg) || j?.detail?.message || j?.detail || j?.message || `HTTP ${r.status}`);
  }
  return j || {};
}

/* the catalogue: every link of the office. fields — env names the skills and the office read; test — a cheap read-only call */
export const CATALOG = [
  { id:'anthropic', name:'Claude (Anthropic)', group:'ИИ', site:'https://console.anthropic.com/settings/keys',
    about:'Claude для ваших задач: агенты, сценарии, разборы. Без ключа — на подписке офиса.',
    uses:['все агенты', 'Сценарий 2.0', 'разборы'], fields:[{ env:'ANTHROPIC_API_KEY', label:'API-ключ', hint:'sk-ant-…', secret:true }],
    test:async (f, F) => { const j = await ask(F, 'https://api.anthropic.com/v1/models?limit=1', { headers:{ 'x-api-key':f.ANTHROPIC_API_KEY, 'anthropic-version':'2023-06-01' } }); return { account:j.data?.[0] ? 'ключ рабочий' : '' }; } },
  { id:'openai', name:'OpenAI', group:'ИИ', site:'https://platform.openai.com/api-keys',
    about:'Запасная расшифровка (Whisper) и картинки.', uses:['Транскрибатор', 'Ремейк залёта'],
    fields:[{ env:'OPENAI_API_KEY', label:'API-ключ', hint:'sk-…', secret:true }],
    test:async (f, F) => { await ask(F, 'https://api.openai.com/v1/models', { headers:{ authorization:`Bearer ${f.OPENAI_API_KEY}` } }); return { account:'ключ рабочий' }; } },
  { id:'elevenlabs', name:'ElevenLabs', group:'Голос и видео', site:'https://elevenlabs.io/app/settings/api-keys',
    about:'Расшифровка роликов и озвучка голосом-клоном.', uses:['Транскрибатор', 'Ремейк залёта', 'Двойник'],
    fields:[{ env:'ELEVENLABS_API_KEY', label:'API-ключ', hint:'sk_…', secret:true }, { env:'ELEVENLABS_VOICE_ID', label:'ID голоса (по желанию)', optional:true }],
    test:async (f, F) => { const j = await ask(F, 'https://api.elevenlabs.io/v1/user/subscription', { headers:{ 'xi-api-key':f.ELEVENLABS_API_KEY } }); return { account:j.tier ? `тариф ${j.tier}` : 'ключ рабочий' }; } },
  { id:'heygen', name:'HeyGen', group:'Голос и видео', site:'https://app.heygen.com/settings?nav=API',
    about:'Цифровой двойник: ролики аватаром вашим голосом.', uses:['Видео с аватаром', 'Ремейк залёта', 'Рилс под ключ'], mcp:{ server:/heygen/i, env:'HEYGEN_API_KEY' },
    fields:[{ env:'HEYGEN_API_KEY', label:'API-ключ', secret:true }],
    test:async (f, F) => { const j = await ask(F, 'https://api.heygen.com/v2/user/remaining_quota', { headers:{ 'x-api-key':f.HEYGEN_API_KEY } }); const q = j.data?.remaining_quota; return { account:q != null ? `остаток ${Math.round(q / 60)} кредитов` : 'ключ рабочий' }; } },
  { id:'apify', name:'Apify', group:'Данные', site:'https://console.apify.com/settings/integrations',
    about:'Сбор рилсов, каруселей и цифр конкурентов из Instagram и TikTok.', uses:['Конкуренты', 'Поиск залётов', 'Статистика соцсетей', 'Транскрибатор'],
    fields:[{ env:'APIFY_TOKEN', label:'API-токен', hint:'apify_api_…', secret:true }],
    test:async (f, F) => { const j = await ask(F, `https://api.apify.com/v2/users/me?token=${encodeURIComponent(f.APIFY_TOKEN)}`); return { account:j.data?.username || 'ключ рабочий' }; } },
  { id:'deepgram', name:'Deepgram', group:'Голос и видео', site:'https://console.deepgram.com',
    about:'Быстрая расшифровка речи.', uses:['Транскрибация'], fields:[{ env:'DEEPGRAM_API_KEY', label:'API-ключ', secret:true }],
    test:async (f, F) => { const j = await ask(F, 'https://api.deepgram.com/v1/projects', { headers:{ authorization:`Token ${f.DEEPGRAM_API_KEY}` } }); return { account:j.projects?.[0]?.name || 'ключ рабочий' }; } },
  { id:'kie', name:'kie.ai', group:'ИИ', site:'https://kie.ai/api-key',
    about:'Генерация картинок и видео (Veo, Kling, Flux и др.).', uses:['Креативы', 'Карусели'], fields:[{ env:'KIE_API_KEY', label:'API-ключ', secret:true }],
    test:async (f, F) => { const j = await ask(F, 'https://api.kie.ai/api/v1/chat/credit', { headers:{ authorization:`Bearer ${f.KIE_API_KEY}` } }); return { account:j.data != null ? `кредитов ${j.data}` : 'ключ рабочий' }; } },
  { id:'instagram', name:'Instagram', group:'Соцсети', site:'https://developers.facebook.com/apps',
    about:'Публикация рилсов и каруселей из «Планера публикаций» и цифры для «Аналитики контента». Токен — Instagram → API setup with Unified login → «Сгенерировать маркер».',
    uses:['Планер публикаций', 'Аналитика контента', 'План дня'],
    fields:[{ env:'IG_ACCESS_TOKEN', label:'Токен доступа', hint:'EAA… или IG…', secret:true }, { env:'IG_USER_ID', label:'ID аккаунта Instagram (по желанию)', hint:'1784…', optional:true }],
    test:async (f, F) => {
      const t = f.IG_ACCESS_TOKEN;
      if (t.startsWith('IG')) { const j = await ask(F, `https://graph.instagram.com/v23.0/me?fields=user_id,username&access_token=${encodeURIComponent(t)}`); return { account:'@' + j.username }; }
      const { igAccount } = await import('./tokens.mjs');
      const a = await igAccount({ token:t, userId:f.IG_USER_ID || '', fetchFn:F });
      return { account:'@' + a.username, extra:{ IG_USER_ID:a.id } };
    } },
  { id:'threads', name:'Threads', group:'Соцсети', site:'https://developers.facebook.com/apps',
    about:'Публикация веток и постов из «Планера публикаций», цифры Threads в отчётах.', uses:['Планер публикаций', 'Threads-ветки', 'Аналитика контента'],
    fields:[{ env:'THREADS_ACCESS_TOKEN', label:'Токен доступа', hint:'TH…', secret:true }],
    test:async (f, F) => { const j = await ask(F, `https://graph.threads.net/v1.0/me?fields=id,username&access_token=${encodeURIComponent(f.THREADS_ACCESS_TOKEN)}`); return { account:'@' + j.username }; } },
  { id:'meta-ads', name:'Meta Ads', group:'Реклама', site:'https://business.facebook.com/settings/system-users',
    about:'Отчёты по рекламе и балансу рекламного кабинета.', uses:['Реклама Meta', 'Балансы и подписки', 'Аналитика'],
    fields:[{ env:'META_TOKEN', label:'Токен (system user)', secret:true }, { env:'META_AD_ACCOUNT', label:'Рекламный кабинет', hint:'act_123…', optional:true }],
    test:async (f, F) => { const j = await ask(F, `https://graph.facebook.com/v23.0/me?fields=id,name&access_token=${encodeURIComponent(f.META_TOKEN)}`); return { account:j.name || 'ключ рабочий' }; } },
  { id:'chatplace', name:'ChatPlace', group:'Воронки', site:'https://chatplace.io',
    about:'Цепочки и кодовые слова, переписки Директа, бот: агенты читают цепочки и сверяют кодовые слова.', uses:['Планер публикаций', 'Воронки', 'CRM Директа'], mcp:{ server:/chat.?place/i, header:'Authorization', prefix:'Bearer ' },
    fields:[{ env:'CHATPLACE_API_TOKEN', label:'Токен MCP', secret:true }],
    test:async () => ({ account:'сохранено — проверится в первой задаче' }) },
  { id:'youtube', name:'YouTube', group:'Соцсети', site:'https://console.cloud.google.com/apis/credentials',
    about:'Статистика канала YouTube в утреннем отчёте.', uses:['Статистика соцсетей'],
    fields:[{ env:'YOUTUBE_API_KEY', label:'API-ключ', secret:true }, { env:'SOCIAL_YT', label:'Канал (@handle или UC…)', optional:true }],
    test:async (f, F) => { const j = await ask(F, `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=@youtube&key=${encodeURIComponent(f.YOUTUBE_API_KEY)}`); return { account:j.items ? 'ключ рабочий' : '' }; } },
  { id:'telegram', name:'Telegram-канал', group:'Соцсети', site:'https://t.me/BotFather',
    about:'Подписчики и просмотры вашего канала в утреннем отчёте (бот — администратор канала).', uses:['Статистика соцсетей'],
    fields:[{ env:'SOCIAL_TG_BOT_TOKEN', label:'Токен бота', hint:'123456:AA…', secret:true }, { env:'SOCIAL_TG_CHANNEL', label:'Канал (@имя)', optional:true }],
    test:async (f, F) => { const j = await ask(F, `https://api.telegram.org/bot${f.SOCIAL_TG_BOT_TOKEN}/getMe`); return { account:j.result?.username ? '@' + j.result.username : 'бот рабочий' }; } },
];
const BY = Object.fromEntries(CATALOG.map(c => [c.id, c]));
// the office's own keys (GitHub secrets on the server) — for the owner's cards: «ключ офиса подключён»
const OFFICE_ENV = { anthropic:['ANTHROPIC_API_KEY'], elevenlabs:['ELEVENLABS_API_KEY'], heygen:['HEYGEN_API_KEY'], instagram:['HQ_IG_ACCESS_TOKEN', 'IG_ACCESS_TOKEN'], threads:['HQ_THREADS_ACCESS_TOKEN', 'THREADS_ACCESS_TOKEN'] };

export function initIntegrations({ dataDir, secret, fetchFn = fetch, officeKeys = {} }) {
  const FILE = path.join(dataDir, 'integrations.json');
  const KEY = crypto.createHash('sha256').update('integrations|' + secret).digest();
  let db = {};
  try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {}
  const save = () => { fs.writeFileSync(FILE + '.tmp', JSON.stringify(db), { mode:0o600 }); fs.renameSync(FILE + '.tmp', FILE); };
  const enc = s => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', KEY, iv); const b = Buffer.concat([c.update(String(s), 'utf8'), c.final()]); return [iv, c.getAuthTag(), b].map(x => x.toString('base64')).join('.'); };
  const dec = s => { try { const [iv, tag, b] = String(s).split('.').map(x => Buffer.from(x, 'base64')); const d = crypto.createDecipheriv('aes-256-gcm', KEY, iv); d.setAuthTag(tag); return Buffer.concat([d.update(b), d.final()]).toString('utf8'); } catch { return ''; } };
  const clean = v => String(v || '').trim().replace(/^bearer\s+/i, '').replace(/^['"«]+|['"»]+$/g, '').replace(/\s+/g, '');
  const mask = v => v ? (v.length > 8 ? '•••• ' + v.slice(-4) : '••••') : '';
  const rec = (uid, id) => db[uid]?.[id] || null;
  const values = (uid, id) => Object.fromEntries(Object.entries(rec(uid, id)?.fields || {}).map(([k, v]) => [k, dec(v)]));
  const office = id => uid => uid === 'owner' && (OFFICE_ENV[id] || []).some(k => env(k) || officeKeys[k]);

  // the cards of a person's cabinet: what is connected, whose account, when checked — never the keys themselves
  function list(uid) {
    return CATALOG.map(c => {
      const r = rec(uid, c.id), v = r ? values(uid, c.id) : {};
      return { id:c.id, name:c.name, group:c.group, about:c.about, uses:c.uses, site:c.site,
        fields:c.fields.map(f => ({ env:f.env, label:f.label, hint:f.hint || '', optional:Boolean(f.optional), secret:Boolean(f.secret), value:v[f.env] ? (f.secret ? mask(v[f.env]) : v[f.env]) : '' })),
        connected:Boolean(r), savedAt:r?.savedAt || '', check:r?.check || null, office:office(c.id)(uid) };
    });
  }
  async function test(uid, id) {
    const c = BY[id], r = rec(uid, id);
    if (!c || !r) return { error:'Сначала сохраните ключ.' };
    try {
      const out = await c.test(values(uid, id), fetchFn);
      if (out.extra) for (const [k, v] of Object.entries(out.extra)) if (v && !r.fields[k]) r.fields[k] = enc(v);
      r.check = { ok:true, at:new Date().toISOString(), account:out.account || 'ключ рабочий', error:'' };
    } catch (e) { r.check = { ok:false, at:new Date().toISOString(), account:'', error:String(e.message || e).slice(0, 240) }; }
    save();
    return r.check;
  }
  // a new key: kept (encrypted) and checked at once; an empty secret field keeps the old value
  async function set(uid, id, fields = {}) {
    const c = BY[id];
    if (!c) return { error:'Нет такой интеграции.' };
    const old = rec(uid, id)?.fields || {}, next = {};
    for (const f of c.fields) {
      const v = clean(fields[f.env]);
      if (v) next[f.env] = enc(f.secret ? v : String(fields[f.env]).trim().slice(0, 120));
      else if (old[f.env] && fields[f.env] === undefined) next[f.env] = old[f.env];
    }
    const main = c.fields.filter(f => !f.optional);
    if (main.some(f => !next[f.env])) return { error:`Заполните: ${main.filter(f => !next[f.env]).map(f => f.label).join(', ')}.` };
    (db[uid] ||= {})[id] = { fields:next, savedAt:new Date().toISOString(), check:null };
    save();
    return { ok:true, check:await test(uid, id) };
  }
  function remove(uid, id) {
    if (!rec(uid, id)) return { ok:true };
    delete db[uid][id]; save();
    return { ok:true };
  }
  // the environment of a task of this person: every key they connected
  function envFor(uid) {
    const out = {};
    for (const id of Object.keys(db[uid] || {})) Object.assign(out, values(uid, id));
    return out;
  }
  // MCP of a task: whose ChatPlace / HeyGen to use (the runner puts them into the job's mcp config)
  function mcpFor(uid) {
    const out = [];
    for (const c of CATALOG) if (c.mcp && rec(uid, c.id)) {
      const v = values(uid, c.id)[c.fields[0].env];
      if (v) out.push({ server:c.mcp.server.source, header:c.mcp.header || '', prefix:c.mcp.prefix || '', env:c.mcp.env || '', value:v });
    }
    return out;
  }
  // a person's key for one thing (publishing: Instagram / Threads of the author of the task)
  const get = (uid, envName) => envFor(uid)[envName] || '';
  const forget = uid => { if (db[uid]) { delete db[uid]; save(); } };
  return { list, set, test, remove, envFor, mcpFor, get, forget };
}
