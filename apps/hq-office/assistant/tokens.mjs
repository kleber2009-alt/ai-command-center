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
const SRC = { ig:() => env('HQ_IG_ACCESS_TOKEN') || env('IG_ACCESS_TOKEN'), threads:() => env('HQ_THREADS_ACCESS_TOKEN') || env('THREADS_ACCESS_TOKEN') };

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
    if (k === 'ig' && !src.startsWith('IG')) {
      s.error = 'токен Facebook (EAA…) продлевается через приложение Meta — автопродление только для токена входа через Instagram (IG…)';
      save(); return { skipped:s.error };
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
  // a token issued less than a day ago cannot be refreshed yet — the next tick tries again
  async function tick() { for (const k of ['ig', 'threads']) await refresh(k); }
  function status() {
    return Object.fromEntries(['ig', 'threads'].map(k => [k, { has:Boolean(SRC[k]()), refreshedAt:st[k]?.refreshedAt || 0, expiresAt:st[k]?.expiresAt || 0, error:st[k]?.error || '' }]));
  }
  // what the runner puts into ~/hq-runner/keys.env for the analytics script
  function runnerKeys() {
    const out = {};
    if (get('ig')) out.IG_ACCESS_TOKEN = get('ig');
    if (env('HQ_IG_USER_ID')) out.IG_USER_ID = env('HQ_IG_USER_ID');
    if (get('threads')) out.THREADS_ACCESS_TOKEN = get('threads');
    return out;
  }
  return { get, refresh, tick, status, runnerKeys };
}
