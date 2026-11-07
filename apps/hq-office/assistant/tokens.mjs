/* Автопродление токенов Instagram и Threads («Планер публикаций», «Аналитика контента», «План дня»).

   Долгий токен живёт 60 дней. Раз в неделю офис продлевает его официальным запросом Meta — без секрета приложения:
     Instagram  GET graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token   (токены «IG…» — вход через Instagram)
     Threads    GET graph.threads.net/refresh_access_token?grant_type=th_refresh_token
   Продлённый токен — в DATA_DIR/tokens.json (600) и действует, пока в секретах GitHub тот же исходный токен (from — его хэш);
   новый токен в секретах — начинаем с него. Токен Facebook («EAA…») так не продлевается — только напоминание.
   Не продлился, а до конца меньше 7 дней (или продлить не удаётся 2 дня) — сообщение владельцу в Telegram, раз в сутки.
   Исполнителю токены уходят в ответе на claim (keys) — он пишет их в ~/hq-runner/keys.env для скриптов аналитики. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const env = k => String(process.env[k] || '').trim();
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 24);
const DAY = 864e5;
const NAME = { ig:'Instagram', threads:'Threads' };
/* A pasted secret often carries spaces, quotes, a line break or «Bearer»; and the two tokens get swapped. A token tells what it is by
   its start — IG… (Instagram login), TH… (Threads), EAA… (Facebook login with Instagram) — so it is used for its platform whatever
   secret it was put in. */
export const cleanToken = s => String(s || '').trim().replace(/^bearer\s+/i, '').replace(/^['"«]+|['"»]+$/g, '').replace(/\s+/g, '');
export const tokenKind = t => /^TH/.test(t) ? 'threads' : /^IG/.test(t) ? 'ig' : /^EAA/.test(t) ? 'fb' : '';
export function sources() {
  const a = cleanToken(env('HQ_IG_ACCESS_TOKEN') || env('IG_ACCESS_TOKEN')), b = cleanToken(env('HQ_THREADS_ACCESS_TOKEN') || env('THREADS_ACCESS_TOKEN'));
  const all = [a, b].filter(Boolean);
  const ig = all.find(t => tokenKind(t) === 'ig') || all.find(t => tokenKind(t) === 'fb') || (a && !tokenKind(a) ? a : '');
  const threads = all.find(t => tokenKind(t) === 'threads') || (b && !tokenKind(b) ? b : '');
  return { ig, threads, swapped:Boolean(a && tokenKind(a) === 'threads') || Boolean(b && ['ig', 'fb'].includes(tokenKind(b))) };
}
const SRC = { ig:() => sources().ig, threads:() => sources().threads };

/* The Instagram account of an EAA… token (graph.facebook.com). New Meta apps give it by «API setup with Unified login» — a token of the
   Instagram account itself, no Facebook page: /me answers with its username. An old Facebook-login token — through the page
   (me/accounts → instagram_business_account). With a known id (HQ_IG_USER_ID) — just that account. → { id, username } */
export async function igAccount({ token, userId = '', root = '', fetchFn = fetch }) {
  root = (root || `${env('HQ_FB_GRAPH_BASE') || 'https://graph.facebook.com'}/${env('HQ_IG_GRAPH_VERSION') || 'v23.0'}`).replace(/\/$/, '');
  const get = async (p, fields) => {
    const r = await fetchFn(`${root}/${p}?` + new URLSearchParams({ fields, access_token:token }), { signal:AbortSignal.timeout(30e3) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error?.error_user_msg || j.error?.message || `HTTP ${r.status}`);
    return j;
  };
  if (userId) { const j = await get(userId, 'id,username'); return { id:String(j.id || userId), username:j.username || '' }; }
  let me = null, err = null;
  try { me = await get('me', 'id,user_id,username'); } catch (e) { err = e; }
  if (me?.username) return { id:String(me.user_id || me.id), username:me.username };
  try {
    const d = await get('me/accounts', 'instagram_business_account{id,username}');
    const acc = (d.data || []).map(x => x.instagram_business_account).find(Boolean);
    if (acc) return { id:String(acc.id), username:acc.username || '' };
  } catch (e) { err ||= e; }
  throw err || new Error('по токену не найден аккаунт Instagram — задайте переменную HQ_IG_USER_ID (id аккаунта, виден в Meta под ником)');
}

export function createTokens({ dataDir, notify = async () => {}, fetchFn = fetch, now = () => Date.now(), every = 7 * DAY } = {}) {
  const FILE = path.join(dataDir, 'tokens.json');
  let st = {};
  try { st = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {}
  const save = () => { try { fs.writeFileSync(FILE + '.tmp', JSON.stringify(st, null, 1), { mode:0o600 }); fs.renameSync(FILE + '.tmp', FILE); } catch (e) { console.error('tokens save:', e.message); } };

  // the token to use now: the refreshed one while the secret is the same, else the secret itself
  function get(k) {
    const src = SRC[k]();
    if (!src) return '';
    const s = st[k];
    return s?.from === sha(src) && s.token ? s.token : src;
  }
  const base = k => (k === 'ig' ? env('HQ_IG_GRAPH_BASE') || 'https://graph.instagram.com' : env('HQ_THREADS_GRAPH_BASE') || 'https://graph.threads.net').replace(/\/$/, '');

  async function refresh(k, { force = false } = {}) {
    const src = SRC[k]();
    if (!src) return { skipped:'нет токена' };
    let s = st[k];
    if (!s || s.from !== sha(src)) s = st[k] = { from:sha(src), token:'', refreshedAt:0, expiresAt:0, error:'', failingSince:0, warnedAt:0 };
    if (k === 'ig' && tokenKind(src) === 'fb') {
      // an EAA… token is not refreshed by a request: it is issued again by the same button in Meta — remind from day 50
      s.firstSeen ||= now(); save();
      if (now() - s.firstSeen > 50 * DAY && now() - (s.warnedAt || 0) > DAY) {
        s.warnedAt = now(); save();
        await notify('⏰ Токену Instagram (EAA…) уже около 50 дней, он живёт 60. Выпустите новый: developers.facebook.com → ваше приложение → Instagram → API setup with Unified login → «Сгенерировать маркер», и обновите секрет HQ_IG_ACCESS_TOKEN в GitHub, затем Run workflow deploy-hq-office.').catch(() => {});
      }
      return { skipped:'токен EAA… продлевается перевыпуском в Meta — напомню за 10 дней' };
    }
    if (!force && s.refreshedAt && now() - s.refreshedAt < every) return { skipped:'рано' };
    const grant = k === 'ig' ? 'ig_refresh_token' : 'th_refresh_token';
    try {
      const r = await fetchFn(`${base(k)}/refresh_access_token?` + new URLSearchParams({ grant_type:grant, access_token:get(k) }), { signal:AbortSignal.timeout(30e3) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.access_token) throw new Error(j.error?.message || `HTTP ${r.status}`);
      Object.assign(s, { token:j.access_token, refreshedAt:now(), expiresAt:j.expires_in ? now() + Number(j.expires_in) * 1000 : 0, error:'', failingSince:0 });
      save();
      return { ok:true, expiresAt:s.expiresAt };
    } catch (e) {
      s.error = String(e.message || e).slice(0, 300); s.failingSince ||= now();
      save();
      const soon = s.expiresAt && s.expiresAt - now() < 7 * DAY, long = now() - s.failingSince > 2 * DAY;
      if ((soon || long) && now() - (s.warnedAt || 0) > DAY) {
        s.warnedAt = now(); save();
        await notify(`⚠️ Токен ${NAME[k]} не продлевается: ${s.error}.${s.expiresAt ? ` Действует до ${new Date(s.expiresAt).toLocaleDateString('ru-RU')}.` : ''} ` +
          `Без него офис не сможет публиковать в ${NAME[k]} — выпустите новый токен и обновите секрет ${k === 'ig' ? 'HQ_IG_ACCESS_TOKEN' : 'HQ_THREADS_ACCESS_TOKEN'} в GitHub.`).catch(() => {});
      }
      return { error:s.error };
    }
  }
  /* does the token work, and for which account: on start and with every tick; a broken one — one message a day with what to do */
  async function check(k) {
    const tok = get(k);
    if (!tok) return null;
    const s = st[k] ||= { from:sha(SRC[k]()) };
    const url = k === 'threads' ? `${base('threads')}/v1.0/me?` + new URLSearchParams({ fields:'id,username', access_token:tok })
      : `${base('ig')}/v23.0/me?` + new URLSearchParams({ fields:'user_id,username', access_token:tok });
    try {
      let acc;
      if (k === 'ig' && tokenKind(tok) === 'fb') acc = await igAccount({ token:tok, userId:env('HQ_IG_USER_ID'), fetchFn });
      else {
        const r = await fetchFn(url, { signal:AbortSignal.timeout(30e3) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.error) throw new Error(j.error?.message || `HTTP ${r.status}`);
        acc = j;
      }
      Object.assign(s, { account:acc.username || '', accountId:String(acc.user_id || acc.id || ''), checkError:'', checkedAt:now() });
      save();
      return { ok:true, account:s.account };
    } catch (e) {
      s.checkError = String(e.message || e).slice(0, 300); s.checkedAt = now(); save();
      if (now() - (s.checkWarnedAt || 0) > DAY) {
        s.checkWarnedAt = now(); save();
        const sec = k === 'ig' ? 'HQ_IG_ACCESS_TOKEN' : 'HQ_THREADS_ACCESS_TOKEN';
        await notify(`⚠️ Токен ${NAME[k]} не работает: ${s.checkError}. Публикации в ${NAME[k]} не выйдут. Проверьте секрет ${sec} в GitHub: ` +
          `${k === 'ig' ? 'токен Instagram начинается с EAA… (Instagram → API setup with Unified login → «Сгенерировать маркер») или IG…' : 'токен Threads начинается с TH…'}, вставлен целиком, без пробелов и кавычек; после замены — Run workflow deploy-hq-office.`).catch(() => {});
      }
      return { error:s.checkError };
    }
  }
  // a token issued less than a day ago cannot be refreshed yet — the next tick tries again
  async function tick() { for (const k of ['ig', 'threads']) { await check(k); await refresh(k); } }
  function status() {
    return Object.fromEntries(['ig', 'threads'].map(k => [k, { has:Boolean(SRC[k]()), kind:tokenKind(SRC[k]()), account:st[k]?.account || '', accountId:st[k]?.accountId || '',
      refreshedAt:st[k]?.refreshedAt || 0, expiresAt:st[k]?.expiresAt || 0, error:st[k]?.checkError || st[k]?.error || '' }]));
  }
  // what the runner puts into ~/hq-runner/keys.env for the analytics script
  function runnerKeys() {
    const out = {};
    if (get('ig')) out.IG_ACCESS_TOKEN = get('ig');
    const uid = env('HQ_IG_USER_ID') || (tokenKind(get('ig')) === 'fb' ? st.ig?.accountId || '' : '');
    if (uid) out.IG_USER_ID = uid;
    if (get('threads')) out.THREADS_ACCESS_TOKEN = get('threads');
    return out;
  }
  // the Instagram account id for a Facebook token: the secret, else the one found by check()
  const igUser = () => env('HQ_IG_USER_ID') || (tokenKind(get('ig')) === 'fb' ? st.ig?.accountId || '' : '');
  return { get, refresh, check, tick, status, runnerKeys, igUser };
}
