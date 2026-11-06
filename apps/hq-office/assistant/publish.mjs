/* «Планер публикаций» — выход готового рилса или карусели в Instagram и Threads в назначенное время.

   Без зависимостей. Ссылки на файлы — подписанные адреса офиса (desk.signedUrl): Meta скачивает файл сама, в исходном качестве.
     Instagram  — Instagram Graph API (контейнер → ждём FINISHED → media_publish): рилс REELS (видео mp4, share_to_feed),
                  карусель CAROUSEL до 10 картинок JPEG, одна картинка IMAGE. Токен IG_ACCESS_TOKEN (Instagram Login, «IG…» —
                  graph.instagram.com/me; токен Facebook — graph.facebook.com/<IG_USER_ID>), право instagram_business_content_publish.
     Threads    — Threads API (graph.threads.net/v1.0/me): TEXT, IMAGE, VIDEO, CAROUSEL; THREADS_ACCESS_TOKEN, threads_content_publish.
   Нет ключа площадки — publishAll возвращает { manual:true } для неё: офис напомнит в Telegram и пришлёт файлы и подпись. */

const env = (k, d = '') => String(process.env[k] || d).trim();
const VER = () => env('HQ_IG_GRAPH_VERSION', 'v23.0');
export const IMG = /\.(jpe?g|png|webp)$/i, JPG = /\.jpe?g$/i, VID = /\.(mp4|mov|m4v)$/i;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// tokens.mjs keeps the refreshed tokens; without it — the secrets as they are
let source = null;
export const useTokens = t => { source = t; };
export function keys() {
  return {
    ig:source?.get('ig') || env('HQ_IG_ACCESS_TOKEN') || env('IG_ACCESS_TOKEN'), igUser:env('HQ_IG_USER_ID') || env('IG_USER_ID'),
    threads:source?.get('threads') || env('HQ_THREADS_ACCESS_TOKEN') || env('THREADS_ACCESS_TOKEN'),
  };
}

async function call(fetchFn, method, url, params) {
  const body = method === 'POST' ? new URLSearchParams(params) : undefined;
  const r = await fetchFn(method === 'GET' ? `${url}?${new URLSearchParams(params)}` : url, { method, body, signal:AbortSignal.timeout(90e3) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new Error(d.error?.error_user_msg || d.error?.message || `HTTP ${r.status}`);
  return d;
}
// a container is ready when Meta has downloaded and processed the file
async function ready(fetchFn, url, token, field, { tries = 60, every = 10e3 } = {}) {
  for (let i = 0; i < tries; i++) {
    const d = await call(fetchFn, 'GET', url, { fields:field, access_token:token });
    const s = String(d[field] || '').toUpperCase();
    if (!s || s === 'FINISHED' || s === 'PUBLISHED') return;
    if (s === 'ERROR' || s === 'EXPIRED') throw new Error(`Meta не обработала файл (${s}${d.error_message ? ': ' + d.error_message : ''})`);
    await sleep(every);
  }
  throw new Error('Meta не обработала файл за 10 минут');
}

/* media: [{ url, kind:'video'|'image', name }] — в порядке слайдов */
export async function publishInstagram({ token, userId = '', caption = '', media, fetchFn = fetch, base = '', wait = {} }) {
  const ig = token.startsWith('IG');
  if (!ig && !userId) throw new Error('для токена Facebook нужен HQ_IG_USER_ID');
  const root = (base || `https://graph.${ig ? 'instagram' : 'facebook'}.com`).replace(/\/$/, '') + '/' + VER(), me = ig ? 'me' : userId;
  const video = media.find(m => m.kind === 'video'), images = media.filter(m => m.kind === 'image');
  if (!video && !images.length) throw new Error('нет видео или картинок для Instagram');
  const nonJpg = images.filter(m => !JPG.test(m.name || m.url.split('?')[0]));
  if (!video && nonJpg.length) throw new Error(`Instagram принимает только JPEG — ${nonJpg.map(m => m.name).join(', ')}`);
  let id;
  if (video) {
    ({ id } = await call(fetchFn, 'POST', `${root}/${me}/media`, { media_type:'REELS', video_url:video.url, caption, share_to_feed:'true', access_token:token }));
    await ready(fetchFn, `${root}/${id}`, token, 'status_code', wait);
  } else if (images.length === 1) {
    ({ id } = await call(fetchFn, 'POST', `${root}/${me}/media`, { image_url:images[0].url, caption, access_token:token }));
    await ready(fetchFn, `${root}/${id}`, token, 'status_code', wait);
  } else {
    const children = [];
    for (const m of images.slice(0, 10)) {
      const c = await call(fetchFn, 'POST', `${root}/${me}/media`, { image_url:m.url, is_carousel_item:'true', access_token:token });
      await ready(fetchFn, `${root}/${c.id}`, token, 'status_code', wait);
      children.push(c.id);
    }
    ({ id } = await call(fetchFn, 'POST', `${root}/${me}/media`, { media_type:'CAROUSEL', children:children.join(','), caption, access_token:token }));
    await ready(fetchFn, `${root}/${id}`, token, 'status_code', wait);
  }
  const pub = await call(fetchFn, 'POST', `${root}/${me}/media_publish`, { creation_id:id, access_token:token });
  const info = await call(fetchFn, 'GET', `${root}/${pub.id}`, { fields:'permalink', access_token:token }).catch(() => ({}));
  return { id:pub.id, permalink:info.permalink || '' };
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
    for (const c of children) await ready(fetchFn, `${root}/${c}`, token, 'status', wait);
    ({ id } = await call(fetchFn, 'POST', `${root}/me/threads`, { media_type:'CAROUSEL', children:children.join(','), text, access_token:token }));
  } else ({ id } = await call(fetchFn, 'POST', `${root}/me/threads`, { media_type:'TEXT', text, access_token:token }));
  await ready(fetchFn, `${root}/${id}`, token, 'status', wait);
  const pub = await call(fetchFn, 'POST', `${root}/me/threads_publish`, { creation_id:id, access_token:token });
  const info = await call(fetchFn, 'GET', `${root}/${pub.id}`, { fields:'permalink', access_token:token }).catch(() => ({}));
  return { id:pub.id, permalink:info.permalink || '' };
}

/* p: { platforms, caption, threads, media:{ instagram:[…], threads:[…] } } → { instagram:{ok,permalink}|{manual}|{error}, threads:… } */
export async function publishAll(p, { fetchFn = fetch, k = keys(), base = { instagram:env('HQ_IG_GRAPH_BASE'), threads:env('HQ_THREADS_GRAPH_BASE') }, wait } = {}) {
  const out = {};
  for (const pl of p.platforms) {
    try {
      if (pl === 'instagram') out.instagram = k.ig ? { ok:true, ...(await publishInstagram({ token:k.ig, userId:k.igUser, caption:p.caption, media:p.media.instagram || [], fetchFn, base:base.instagram, wait })) }
        : { manual:true, why:'нет ключа Instagram (HQ_IG_ACCESS_TOKEN)' };
      else if (pl === 'threads') out.threads = k.threads ? { ok:true, ...(await publishThreads({ token:k.threads, text:p.threads || p.caption, media:p.media.threads || [], fetchFn, base:base.threads, wait })) }
        : { manual:true, why:'нет ключа Threads (HQ_THREADS_ACCESS_TOKEN)' };
    } catch (e) { out[pl] = { error:String(e.message || e).slice(0, 400) }; }
  }
  return out;
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
