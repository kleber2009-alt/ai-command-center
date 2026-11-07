/* «Планер публикаций» — выход готового рилса или карусели в Instagram и Threads в назначенное время.

   Без зависимостей. Ссылки на файлы — подписанные адреса офиса (desk.signedUrl): Meta скачивает файл сама, в исходном качестве.
     Instagram  — Instagram Graph API (контейнер → ждём FINISHED → media_publish): рилс REELS (видео mp4, share_to_feed),
                  карусель CAROUSEL до 10 картинок JPEG, одна картинка IMAGE. Токен IG_ACCESS_TOKEN (Instagram Login, «IG…» —
                  graph.instagram.com/me; токен Facebook — graph.facebook.com/<IG_USER_ID>), право instagram_business_content_publish.
     Threads    — Threads API (graph.threads.net/v1.0/me): TEXT, IMAGE, VIDEO, CAROUSEL; THREADS_ACCESS_TOKEN, threads_content_publish.
   Нет ключа площадки — publishAll возвращает { manual:true } для неё: офис напомнит в Telegram и пришлёт файлы и подпись. */

const env = (k, d = '') => String(process.env[k] || d).trim();
import { sources, igAccount } from './tokens.mjs';
const VER = () => env('HQ_IG_GRAPH_VERSION', 'v23.0');
export const IMG = /\.(jpe?g|png|webp)$/i, JPG = /\.jpe?g$/i, VID = /\.(mp4|mov|m4v)$/i;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// tokens.mjs keeps the refreshed tokens; without it — the secrets as they are
let source = null;
export const useTokens = t => { source = t; };
export function keys() {
  const s = sources();
  return {
    ig:source?.get('ig') || s.ig, igUser:source?.igUser?.() || env('HQ_IG_USER_ID') || env('IG_USER_ID'),
    threads:source?.get('threads') || s.threads,
  };
}

async function call(fetchFn, method, url, params) {
  const body = method === 'POST' ? new URLSearchParams(params) : undefined;
  const r = await fetchFn(method === 'GET' ? `${url}?${new URLSearchParams(params)}` : url, { method, body, signal:AbortSignal.timeout(90e3) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new Error(d.error?.error_user_msg || d.error?.message || `HTTP ${r.status}`);
  return d;
}
// a container is ready when Meta has downloaded and processed the file: first checks every 2 s, then up to every 10 s, 15 min at most
async function ready(fetchFn, url, token, field, { limit = 15 * 60e3, first = 2e3, every = 10e3, progress } = {}) {
  const t0 = Date.now();
  for (let i = 0; ; i++) {
    const d = await call(fetchFn, 'GET', url, { fields:field, access_token:token });
    const s = String(d[field] || '').toUpperCase();
    if (!s || s === 'FINISHED' || s === 'PUBLISHED') return;
    if (s === 'ERROR' || s === 'EXPIRED') throw new Error(`Meta не обработала файл (${s}${d.error_message ? ': ' + d.error_message : ''})`);
    if (Date.now() - t0 > limit) throw new Error(`Meta не обработала файл за ${Math.round(limit / 60e3)} мин`);
    progress?.(Date.now() - t0);
    await sleep(Math.min(every, first * 2 ** Math.min(i, 4)));
  }
}
// the same wait, with what is going on named for the office: progress(text, ms)
const say = (wait, text) => ({ ...wait, progress:wait.progress && (ms => wait.progress(text, ms)) });
// containers of a carousel: all created first, then Meta processes them at once
const readyAll = (fetchFn, root, ids, token, field, wait) => Promise.all(ids.map(id => ready(fetchFn, `${root}/${id}`, token, field, wait)));

// ссылка на вышедший пост: сразу после публикации Meta иногда отдаёт её не с первого раза — до 3 попыток
async function permalink(fetchFn, url, token, { linkTries = 3, linkEvery = 3e3 } = {}) {
  for (let i = 0; i < linkTries; i++) {
    const info = await call(fetchFn, 'GET', url, { fields:'permalink', access_token:token }).catch(() => ({}));
    if (info.permalink) return info.permalink;
    if (i < linkTries - 1) await sleep(linkEvery);
  }
  return '';
}

/* media: [{ url, kind:'video'|'image', name }] — в порядке слайдов */
export async function publishInstagram({ token, userId = '', caption = '', media, fetchFn = fetch, base = '', wait = {} }) {
  const ig = token.startsWith('IG');
  const root = (base || `https://graph.${ig ? 'instagram' : 'facebook'}.com`).replace(/\/$/, '') + '/' + VER();
  if (!ig && !userId) userId = (await igAccount({ token, root, fetchFn })).id;   // an EAA… token: its own account (Unified login) or its page's
  const me = ig ? 'me' : userId;
  const video = media.find(m => m.kind === 'video'), images = media.filter(m => m.kind === 'image');
  if (!video && !images.length) throw new Error('нет видео или картинок для Instagram');
  const nonJpg = images.filter(m => !JPG.test(m.name || m.url.split('?')[0]));
  if (!video && nonJpg.length) throw new Error(`Instagram принимает только JPEG — ${nonJpg.map(m => m.name).join(', ')}`);
  let id;
  if (video) {
    ({ id } = await call(fetchFn, 'POST', `${root}/${me}/media`, { media_type:'REELS', video_url:video.url, caption, share_to_feed:'true', access_token:token }));
    await ready(fetchFn, `${root}/${id}`, token, 'status_code', say(wait, 'Meta обрабатывает видео'));
  } else if (images.length === 1) {
    ({ id } = await call(fetchFn, 'POST', `${root}/${me}/media`, { image_url:images[0].url, caption, access_token:token }));
    await ready(fetchFn, `${root}/${id}`, token, 'status_code', say(wait, 'Meta обрабатывает картинку'));
  } else {
    const children = [];
    for (const m of images.slice(0, 10))
      children.push((await call(fetchFn, 'POST', `${root}/${me}/media`, { image_url:m.url, is_carousel_item:'true', access_token:token })).id);
    await readyAll(fetchFn, root, children, token, 'status_code', say(wait, `Meta обрабатывает ${children.length} слайдов`));
    ({ id } = await call(fetchFn, 'POST', `${root}/${me}/media`, { media_type:'CAROUSEL', children:children.join(','), caption, access_token:token }));
    await ready(fetchFn, `${root}/${id}`, token, 'status_code', say(wait, 'Meta собирает карусель'));
  }
  const pub = await call(fetchFn, 'POST', `${root}/${me}/media_publish`, { creation_id:id, access_token:token });
  return { id:pub.id, permalink:await permalink(fetchFn, `${root}/${pub.id}`, token, wait) };
}

export async function publishThreads({ token, text = '', media = [], fetchFn = fetch, base = '', wait = {} }) {
  const root = (base || 'https://graph.threads.net').replace(/\/$/, '') + '/v1.0';
  const video = media.find(m => m.kind === 'video'), images = media.filter(m => m.kind === 'image');
  const one = m => m.kind === 'video' ? { media_type:'VIDEO', video_url:m.url } : { media_type:'IMAGE', image_url:m.url };
  let id;
  if (video) ({ id } = await call(fetchFn, 'POST', `${root}/me/threads`, { ...one(video), text, access_token:token }));
  else if (images.length === 1) ({ id } = await call(fetchFn, 'POST', `${root}/me/threads`, { ...one(images[0]), text, access_token:token }));
  else if (images.length > 1) {
    const children = [];
    for (const m of images.slice(0, 20)) {
      const c = await call(fetchFn, 'POST', `${root}/me/threads`, { ...one(m), is_carousel_item:'true', access_token:token });
      children.push(c.id);
    }
    await readyAll(fetchFn, root, children, token, 'status', say(wait, `Meta обрабатывает ${children.length} слайдов`));
    ({ id } = await call(fetchFn, 'POST', `${root}/me/threads`, { media_type:'CAROUSEL', children:children.join(','), text, access_token:token }));
  } else ({ id } = await call(fetchFn, 'POST', `${root}/me/threads`, { media_type:'TEXT', text, access_token:token }));
  await ready(fetchFn, `${root}/${id}`, token, 'status', say(wait, video ? 'Meta обрабатывает видео' : 'Meta готовит пост'));
  const pub = await call(fetchFn, 'POST', `${root}/me/threads_publish`, { creation_id:id, access_token:token });
  return { id:pub.id, permalink:await permalink(fetchFn, `${root}/${pub.id}`, token, wait) };
}

/* p: { platforms, caption, threads, media:{ instagram:[…], threads:[…] } } → { instagram:{ok,permalink}|{manual}|{error}, threads:… } */
// площадки — параллельно: Threads не ждёт, пока Meta обработает видео для Instagram. progress(platform, text, ms) — что сейчас идёт
export async function publishAll(p, { fetchFn = fetch, k = keys(), base = { instagram:env('HQ_IG_GRAPH_BASE'), threads:env('HQ_THREADS_GRAPH_BASE') }, wait = {}, progress } = {}) {
  const w = pl => ({ ...wait, progress:progress && ((text, ms) => progress(pl, text, ms)) });
  const one = async pl => {
    try {
      if (pl === 'instagram') return k.ig ? { ok:true, ...(await publishInstagram({ token:k.ig, userId:k.igUser, caption:p.caption, media:p.media.instagram || [], fetchFn, base:base.instagram, wait:w(pl) })) }
        : { manual:true, why:'нет ключа Instagram (HQ_IG_ACCESS_TOKEN)' };
      if (pl === 'threads') return k.threads ? { ok:true, ...(await publishThreads({ token:k.threads, text:p.threads || p.caption, media:p.media.threads || [], fetchFn, base:base.threads, wait:w(pl) })) }
        : { manual:true, why:'нет ключа Threads (HQ_THREADS_ACCESS_TOKEN)' };
      return { error:'неизвестная площадка' };
    } catch (e) { return { error:String(e.message || e).slice(0, 400) }; }
  };
  const pls = p.platforms.filter(x => x === 'instagram' || x === 'threads');
  const res = await Promise.all(pls.map(one));
  return Object.fromEntries(pls.map((pl, i) => [pl, res[i]]));
}

/* ---------- time ---------- */
const MSK = 3 * 3600e3;
const mskParts = d => { const x = new Date(d.getTime() + MSK); return { y:x.getUTCFullYear(), m:x.getUTCMonth(), d:x.getUTCDate(), h:x.getUTCHours(), mi:x.getUTCMinutes() }; };
const fromMsk = (y, m, d, h, mi) => new Date(Date.UTC(y, m, d, h, mi) - MSK);
export const fmtMsk = iso => new Intl.DateTimeFormat('ru-RU', { timeZone:'Europe/Moscow', weekday:'short', day:'numeric', month:'long', hour:'2-digit', minute:'2-digit' }).format(new Date(iso));

/* «19:00», «в 19», «завтра 10:30», «сегодня в 21», «7.11 18:00», «пн 12:00», ISO → Date (МСК); в прошлом — следующий такой день */
export function parseWhen(text, now = new Date()) {
  const s = String(text || '').trim().toLowerCase();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}t\d{2}:\d{2}/.test(s)) { const d = new Date(s); return isNaN(d) ? null : d; }
  if (/^(сейчас|now|сразу)(?=\s|$|[.!,])/.test(s)) return new Date(now.getTime() + 60e3);
  const t = /(?:^|\s|в\s*)(\d{1,2})(?::|\.|\s*ч\s*)?(\d{2})?(?=\s*$|\s|ч|$)/.exec(s.replace(/(\d{1,2})\.(\d{1,2})(?:\.\d{2,4})?(?=\s)/, ''));
  const hh = t ? Number(t[1]) : NaN, mm = t?.[2] ? Number(t[2]) : 0;
  if (!(hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59)) return null;
  const n = mskParts(now);
  let base = { y:n.y, m:n.m, d:n.d }, explicit = false;
  const dm = /(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?(?=\s)/.exec(s);
  if (dm) { base = { y:dm[3] ? (dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3])) : n.y, m:Number(dm[2]) - 1, d:Number(dm[1]) }; explicit = true; }
  else if (/послезавтра/.test(s)) { const x = new Date(Date.UTC(n.y, n.m, n.d + 2)); base = { y:x.getUTCFullYear(), m:x.getUTCMonth(), d:x.getUTCDate() }; explicit = true; }
  else if (/завтра/.test(s)) { const x = new Date(Date.UTC(n.y, n.m, n.d + 1)); base = { y:x.getUTCFullYear(), m:x.getUTCMonth(), d:x.getUTCDate() }; explicit = true; }
  else if (/сегодня/.test(s)) explicit = true;
  else {
    const days = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'], w = days.findIndex(x => new RegExp(`(^|\\s)${x}`).test(s));
    if (w >= 0) { const cur = new Date(Date.UTC(n.y, n.m, n.d)).getUTCDay(); let add = (w - cur + 7) % 7; if (!add) add = 7; const x = new Date(Date.UTC(n.y, n.m, n.d + add)); base = { y:x.getUTCFullYear(), m:x.getUTCMonth(), d:x.getUTCDate() }; explicit = true; }
  }
  let d = fromMsk(base.y, base.m, base.d, hh, mm);
  if (d <= now) { if (explicit && dm) return null; d = new Date(d.getTime() + 864e5); }
  return d;
}

/* the agent's slots → the first three still ahead and not taken (±45 min of another scheduled publication); none — 10:00/14:00/19:00 */
export function freeSlots(proposed, taken = [], now = new Date()) {
  const busy = taken.map(x => Date.parse(x)).filter(Boolean), out = [];
  const ok = d => d > now.getTime() + 5 * 60e3 && !busy.some(b => Math.abs(b - d) < 45 * 60e3) && !out.some(o => Math.abs(o.at - d) < 45 * 60e3);
  for (const s of proposed || []) {
    const d = Date.parse(s?.at || s) || parseWhen(s?.at || s, now)?.getTime();
    if (d && ok(d)) out.push({ at:d, why:String(s?.why || '').slice(0, 120) });
    if (out.length >= 3) break;
  }
  for (let day = 0; out.length < 3 && day < 7; day++) for (const h of [10, 14, 19]) {
    if (out.length >= 3) break;
    const n = mskParts(new Date(now.getTime() + day * 864e5)), d = fromMsk(n.y, n.m, n.d, h, 0).getTime();
    if (ok(d)) out.push({ at:d, why:'обычное время выхода' });
  }
  return out.sort((a, b) => a.at - b.at).map(x => ({ at:new Date(x.at).toISOString(), why:x.why }));
}
