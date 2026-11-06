/* «Разведка залётов» и «План дня» для бота @instaoo_bot (ветка «Instagram Reels», reels-bot.mjs).

   Задача: каждое утро Илья точно знает, что выложить сегодня — ровно 3 единицы контента: 1 рилс + 2 карусели или
   2 рилса + 1 карусель. Берём только настоящие залёты — жёсткие пороги, остальное не рассматривается вообще:
     просмотры ≥ 100 000 · комментарии ≥ 1 000 · репосты ≥ 1 000   (SCOUT_MIN_VIEWS / _COMMENTS / _SHARES)

   Три источника:
     fresh  🔥 «Летит сейчас» — конкуренты (и поиск рилсов по ключевым словам), опубликовано за последние SCOUT_FRESH_DAYS (3) дня;
     own    ♻️ «Ваш залёт» — всё, что когда-либо залетело у @ilia.paliy, — уникализировать (не младше SCOUT_OWN_MIN_AGE дней, 14);
     best   🏆 «Лучшее конкурентов» — их сильнейшее за всё время (библиотека копится от прогона к прогону) — адаптировать.

   Чего не видно в открытых данных — честно помечаем, а не придумываем:
     • у каруселей Instagram не показывает просмотры — для каруселей порог просмотров не применяется (comments + shares);
     • репосты отдаёт не каждый парсер: неизвестные репосты → «репосты не видны», такой залёт проходит по остальным порогам,
       но ранжируется ниже проверенных (SCOUT_SHARES_UNKNOWN=pass | fail — fail выкидывает такие совсем).

   Отбор (planDay): у каждого кандидата сила = среднее геометрическое (метрика / порог) по известным метрикам, плюс скорость
   для свежих (просмотры в час), минус за неизвестные репосты, бонус источнику «летит сейчас». Перебираем оба расклада
   (1R+2C, 2R+1C) и все тройки из лучших кандидатов: один автор — один раз в день, без повторов темы (похожие подписи),
   бонус за разные источники, штраф автору, которого брали вчера. Побеждает тройка с наибольшей суммой. Не набралось трёх —
   план так и говорит, чего не хватает (никаких «почти залётов»). Остальные прошедшие — запас для ♻️ «Другой».

   Только функции и данные — без Telegram; бот вызывает scout() и показывает план. Тесты — scout.test.mjs. */
import fs from 'node:fs';
import path from 'node:path';

const env = (k, d = '') => (process.env[k] || d).trim();
const num = (v) => { const n = Number(v); return v == null || v === '' || !Number.isFinite(n) || n < 0 ? null : n; };

export const LIMITS = () => ({
  views: Number(env('SCOUT_MIN_VIEWS', '100000')),
  comments: Number(env('SCOUT_MIN_COMMENTS', '1000')),
  shares: Number(env('SCOUT_MIN_SHARES', '1000')),
  sharesUnknown: env('SCOUT_SHARES_UNKNOWN', 'pass') === 'fail' ? 'fail' : 'pass',
});
export const SOURCES = {
  fresh: { icon: '🔥', label: 'Летит сейчас', verb: 'адаптировать под себя, пока тема горячая' },
  own: { icon: '♻️', label: 'Ваш залёт', verb: 'уникализировать: новый хук, новая подача, та же суть' },
  best: { icon: '🏆', label: 'Лучшее конкурентов', verb: 'адаптировать: их формат и механика, ваш текст и примеры' },
};
const KIND = { reel: 'рилс', carousel: 'карусель' };

/* ---------- 1. one post from any parser → one shape ---------- */
const sc = (url) => (String(url || '').match(/instagram\.com\/(?:[\w.]+\/)?(?:reels?|p|tv)\/([A-Za-z0-9_-]+)/) || [])[1] || '';
const first = (...v) => { for (const x of v) { const n = num(x); if (n != null) return n; } return null; };

// apify~instagram-scraper (camelCase) and the reels-search actor (snake_case) both land here
export function normalize(p, { own = false } = {}) {
  if (!p || typeof p !== 'object') return null;
  const code = p.shortCode || p.code || sc(p.url) || '';
  if (!code) return null;
  const children = p.childPosts || p.carousel_media || [];
  const isCarousel = p.type === 'Sidecar' || p.media_type === 8 || p.product_type === 'carousel_container' || children.length > 1;
  const isReel = !isCarousel && Boolean(p.videoUrl || p.video_url || p.type === 'Video' || p.productType === 'clips' || p.product_type === 'clips' || p.media_type === 2);
  if (!isCarousel && !isReel) return null;  // a single photo is neither
  const author = String(p.ownerUsername || p.user?.username || p.owner?.username || '').toLowerCase();
  const caption = typeof p.caption === 'string' ? p.caption : p.caption?.text || '';
  const ts = p.timestamp || p.taken_at_date || p.taken_at;
  const date = typeof ts === 'number' ? new Date(ts * (ts < 1e12 ? 1000 : 1)).toISOString() : ts ? String(ts) : '';
  const images = isCarousel ? children.filter((c) => c.type !== 'Video' && (c.displayUrl || c.display_url)).map((c) => c.displayUrl || c.display_url) : [];
  return {
    code, kind: isCarousel ? 'carousel' : 'reel', own, author, caption: caption.slice(0, 2200), date,
    url: p.url || (isCarousel ? `https://www.instagram.com/p/${code}/` : `https://www.instagram.com/reel/${code}/`),
    views: isCarousel ? null : first(p.videoPlayCount, p.ig_play_count, p.play_count, p.videoViewCount, p.view_count),
    comments: first(p.commentsCount, p.comment_count),
    likes: first(p.likesCount, p.like_count),  // hidden likes come as -1 → null
    shares: first(p.reshareCount, p.resharesCount, p.sharesCount, p.shareCount, p.share_count, p.reshare_count, p.media_shares, p.shares),
    duration: first(p.videoDuration, p.video_duration),
    video_url: p.videoUrl || p.video_url || '', thumb: p.displayUrl || p.display_url || p.thumbnail_url || '',
    images, slides: isCarousel ? Math.max(children.length, images.length) : 0,
  };
}

/* ---------- 2. the hard gate ---------- */
// → { ok, checks: [{metric, value, need, state: 'ok'|'low'|'hidden'|'n/a'}], unknown: [...] }
export function gate(x, L = LIMITS()) {
  const checks = [];
  const add = (metric, value, need, na = false) => checks.push({ metric, value, need,
    state: na ? 'n/a' : value == null ? 'hidden' : value >= need ? 'ok' : 'low' });
  add('views', x.views, L.views, x.kind === 'carousel');  // Instagram does not show carousel views
  add('comments', x.comments, L.comments);
  add('shares', x.shares, L.shares);
  const low = checks.some((c) => c.state === 'low');
  const hidden = checks.filter((c) => c.state === 'hidden').map((c) => c.metric);
  // views and comments must be known (they are public); only shares may be hidden — and only with SHARES_UNKNOWN=pass
  const ok = !low && !hidden.includes('views') && !hidden.includes('comments') && (!hidden.includes('shares') || L.sharesUnknown === 'pass');
  return { ok, checks, unknown: hidden };
}

const ageH = (x, now) => x.date ? Math.max(1, (now - Date.parse(x.date)) / 3600e3) : null;

// strength: geometric mean of metric/threshold over what is known, + velocity for fresh posts
export function strength(x, source, { L = LIMITS(), now = Date.now() } = {}) {
  const ratios = [];
  if (x.views != null && x.kind === 'reel') ratios.push(x.views / L.views);
  if (x.comments != null) ratios.push(x.comments / L.comments);
  if (x.shares != null) ratios.push(x.shares / L.shares);
  if (!ratios.length) return 0;
  let s = Math.exp(ratios.reduce((a, r) => a + Math.log(Math.max(r, 1e-6)), 0) / ratios.length);
  if (x.shares == null) s *= 0.8;                     // not verified — below the verified ones
  if (source === 'fresh') {                           // what flies right now: the faster, the better
    const h = ageH(x, now);
    const base = x.kind === 'reel' ? x.views : (x.comments || 0) * 100;
    if (h && base) s *= 1 + Math.min(1, Math.log10(1 + base / h / 1000) / 2);
    s *= 1.15;
  }
  return Math.round(s * 100) / 100;
}

/* ---------- 3. candidates from the three sources ---------- */
const words = (t) => new Set(String(t || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 3).slice(0, 60));
const similar = (a, b) => {
  const A = words(a), B = words(b);
  if (A.size < 6 || B.size < 6) return false;  // short captions say too little to call two posts one topic
  let n = 0; for (const w of A) if (B.has(w)) n++;
  return n / Math.min(A.size, B.size) >= 0.5;
};

/* posts: [{...normalize(), from:'competitors'|'own'|'keywords'}]
   used: {code: iso} — already taken; reuseDays — own hits come back after that */
export function candidates(posts, { used = {}, now = Date.now(), freshDays = Number(env('SCOUT_FRESH_DAYS', '3')),
  ownMinAge = Number(env('SCOUT_OWN_MIN_AGE', '14')), reuseDays = Number(env('SCOUT_REUSE_DAYS', '60')), L = LIMITS() } = {}) {
  const out = [], seen = new Set(), rejected = { low: 0, hidden: 0, used: 0, young: 0 };
  for (const x of posts) {
    if (!x?.code || seen.has(x.code)) continue;
    seen.add(x.code);
    const g = gate(x, L);
    if (!g.ok) { rejected[g.checks.some((c) => c.state === 'low') ? 'low' : 'hidden']++; continue; }
    const at = used[x.code] ? Date.parse(used[x.code]) : 0;
    if (at && (!x.own || now - at < reuseDays * 864e5)) { rejected.used++; continue; }  // competitors' — never twice
    const h = ageH(x, now);
    let source;
    if (x.own) {
      if (h != null && h < ownMinAge * 24) { rejected.young++; continue; }  // too fresh to remake
      source = 'own';
    } else source = h != null && h <= freshDays * 24 ? 'fresh' : 'best';
    if (x.kind === 'reel' && x.duration && (x.duration < 7 || x.duration > 180)) { rejected.low++; continue; }
    out.push({ ...x, source, gate: g, score: strength(x, source, { L, now }) });
  }
  out.sort((a, b) => b.score - a.score);
  return { list: out, rejected };
}

/* ---------- 4. the day's plan: exactly three, 1R+2C or 2R+1C ---------- */
export function planDay(cands, { yesterdayAuthors = [], top = 8, mixes = [[1, 2], [2, 1]] } = {}) {
  const reels = cands.filter((c) => c.kind === 'reel').slice(0, top);
  const cars = cands.filter((c) => c.kind === 'carousel').slice(0, top);
  const fits = (set) => {
    for (let i = 0; i < set.length; i++) for (let k = i + 1; k < set.length; k++) {
      if (set[i].author && set[i].author === set[k].author && !set[i].own) return false;  // one competitor once a day
      if (similar(set[i].caption, set[k].caption)) return false;                          // no same topic twice
    }
    return true;
  };
  const value = (set) => {
    let v = set.reduce((a, c) => a + c.score * (yesterdayAuthors.includes(c.author) && !c.own ? 0.85 : 1), 0);
    v *= 1 + 0.08 * (new Set(set.map((c) => c.source)).size - 1);  // a mix of sources: fresh + own + best
    return v;
  };
  const combos = (arr, k) => k === 0 ? [[]] : arr.flatMap((x, i) => combos(arr.slice(i + 1), k - 1).map((r) => [x, ...r]));
  let best = null;
  for (const [r, c] of mixes) {
    for (const R of combos(reels, r)) for (const C of combos(cars, c)) {
      const set = [...R, ...C];
      if (!fits(set)) continue;
      const v = value(set);
      if (!best || v > best.v) best = { v, set, mix: [r, c] };
    }
  }
  if (best) return { items: order(best.set), mix: best.mix, short: null };
  // fewer than three real hits: say so — what is there, and what is missing
  const pick = [];
  for (const c of cands) if (pick.length < 3 && fits([...pick, c]) && pick.filter((p) => p.kind === c.kind).length < 2) pick.push(c);
  const r = pick.filter((p) => p.kind === 'reel').length, k = pick.length - r;
  return { items: order(pick), mix: [r, k], short: { have: pick.length, reels: reels.length, carousels: cars.length,
    missing: r === 0 ? 'рилсов' : k === 0 ? 'каруселей' : 'третьей единицы' } };
}
// publishing order: the strongest goes to the evening slot, a carousel opens the day
function order(set) {
  const s = [...set].sort((a, b) => a.score - b.score);
  const car = s.findIndex((x) => x.kind === 'carousel');
  if (car > 0) s.unshift(...s.splice(car, 1));
  return s;
}

/* ---------- 5. plan text for Telegram (HTML) ---------- */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const fmt = (n) => n == null ? '—' : n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.0', '')} млн` : n >= 1e3 ? `${Math.round(n / 1e3)} тыс.` : String(Math.round(n));
export function metricsLine(x) {
  const m = { views: 'просм.', comments: 'комм.', shares: 'репостов' };
  return (x.gate?.checks || gate(x).checks).filter((c) => c.state !== 'n/a')
    .map((c) => c.state === 'hidden' ? `${m[c.metric]} не видны` : `${c.state === 'ok' ? '✓' : '✗'} ${fmt(c.value)} ${m[c.metric]}`).join(' · ');
}
export function planText(plan, { date, slots = [], competitors = 0, stats = {} } = {}) {
  const L = LIMITS();
  const head = `📋 <b>План на ${esc(date)}</b> — ${plan.items.length === 3 ? `3 единицы: ${plan.mix[0]} ${plan.mix[0] === 1 ? 'рилс' : 'рилса'} + ${plan.mix[1]} ${plan.mix[1] === 1 ? 'карусель' : 'карусели'}` : `только ${plan.items.length} из 3`}\n` +
    `<i>Только залёты: от ${L.views.toLocaleString('ru-RU')} просмотров, ${L.comments.toLocaleString('ru-RU')} комментариев и ${L.shares.toLocaleString('ru-RU')} репостов.</i>`;
  const rows = plan.items.map((x, i) => {
    const s = SOURCES[x.source];
    const when = slots[i] ? `<b>${esc(slots[i])}</b> · ` : '';
    const what = x.kind === 'reel' ? '🎬 Рилс' : `🎠 Карусель${x.slides ? `, ${x.slides} слайдов` : ''}`;
    const topic = (x.caption || '').split('\n').find((l) => l.trim())?.slice(0, 110) || '';
    const ok = x.approved ? '✅ ' : '';
    const link = String(x.url || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
    return `${ok}${i + 1}. ${when}${what} · ${s.icon} ${s.label}\n   🔗 <a href="${esc(x.url)}">${esc(link)}</a>\n   @${esc(x.author || '?')} — ${esc(metricsLine(x))}` +
      `${topic ? `\n   «${esc(topic)}»` : ''}\n   → ${esc(s.verb)}` + (x.approved ? `\n   <b>Одобрено</b> — ${x.kind === 'reel' ? 'аватар и монтаж после сценария' : 'карусель у агента «Карусели» офиса'}` : '');
  });
  const tail = [];
  if (plan.short) {
    tail.push(`⚠️ Настоящих залётов хватило только на ${plan.items.length}${plan.short.missing ? ` — не хватает ${plan.short.missing}` : ''}. ` +
      `Ниже порогов не беру. ${competitors < 10 ? `Конкурентов в списке ${competitors} — добавьте больше: /competitors add @ник @ник.` : 'Расширьте ключевые слова: /keywords add слово.'}`);
  }
  if (stats.scanned != null) tail.push(`🔎 Просмотрено постов: ${stats.scanned} · прошли пороги: ${stats.passed ?? '—'}${stats.hidden ? ` · без видимых метрик: ${stats.hidden}` : ''}`);
  tail.push(plan.items.every((x) => x.approved) ? 'Всё одобрено. Рилсы — карточками ниже, карусели — в пульте офиса.'
    : '✅ — одобрить: рилс уходит в аватар HeyGen и монтаж, карусель — агенту «Карусели» офиса (карточка придёт в пульт офиса).');
  return [head, rows.join('\n\n'), tail.join('\n')].join('\n\n');
}

/* ---------- 6. the library of hits: competitors' best accumulates between runs ---------- */
export function library(dir) {
  const file = path.join(dir, 'library.json');
  let lib = {};
  try { lib = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  return {
    // keep the freshest numbers; only posts that passed the gate stay (a hit stays a hit)
    add(posts) {
      for (const x of posts) {
        if (!x?.code) continue;
        // a hit stays a hit; a post seen again with fresh numbers below the gate (e.g. real reposts from the Graph API) goes out
        if (gate(x).ok) lib[x.code] = { ...(lib[x.code] || {}), ...x, seen: new Date().toISOString() };
        else delete lib[x.code];
      }
      const keep = Object.values(lib).sort((a, b) => (b.comments || 0) - (a.comments || 0)).slice(0, 2000);
      lib = Object.fromEntries(keep.map((x) => [x.code, x]));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file + '.part', JSON.stringify(lib));
      fs.renameSync(file + '.part', file);
    },
    all: () => Object.values(lib),
  };
}

export const kindRu = (k) => KIND[k] || k;

/* ---------- 8. the shared list of competitors (.claude/skills/competitors/competitors.json) ----------
   One list for every content project; in the image it is competitors.json next to the code (deploy/build.sh). */
export function sharedCompetitors(dirs = [process.env.COMPETITORS_FILE ? path.dirname(process.env.COMPETITORS_FILE) : '',
  path.join(path.dirname(new URL(import.meta.url).pathname), 'competitors'),
  path.join(path.dirname(new URL(import.meta.url).pathname), '../../.claude/skills/competitors')]) {
  for (const d of dirs.filter(Boolean)) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(d, 'competitors.json'), 'utf8'));
      const nicks = (j.accounts || []).map((a) => String(a.nick || '').replace(/^@/, '').toLowerCase()).filter((x) => /^[a-z0-9._]{1,30}$/.test(x));
      return { checked: j.checked || '', nicks, accounts: j.accounts || [] };
    } catch {}
  }
  return { checked: '', nicks: [], accounts: [] };
}

/* ---------- 7. own posts: real numbers from the Instagram Graph API ----------
   The public scraper shows no reposts (and no carousel views); the owner's token does. IG_ACCESS_TOKEN — an Instagram
   token (IG…, graph.instagram.com, «me») or a Facebook one with IG_USER_ID. → Map shortcode → { views, shares, comments, likes }:
   shares = «Поделиться» + reposts (the new metric is asked separately — an unknown metric fails the whole request). */
export async function graphOwn({ token, userId = '', version = 'v23.0', limit = 400, base = '', fetchFn = fetch } = {}) {
  if (!token) return new Map();
  const ig = token.startsWith('IG');
  if (!ig && !userId) throw new Error('для токена Facebook нужен IG_USER_ID');
  const root = (base || `https://graph.${ig ? 'instagram' : 'facebook'}.com`).replace(/\/$/, '') + '/' + version;
  const get = async (url) => {
    const r = await fetchFn(url, { signal: AbortSignal.timeout(60e3) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) throw new Error(`Graph API: ${d.error?.message || r.status}`);
    return d;
  };
  const media = [];
  let url = `${root}/${ig ? 'me' : userId}/media?` + new URLSearchParams({ fields: 'id,shortcode,permalink,media_type,comments_count,like_count', limit: '50', access_token: token });
  while (url && media.length < limit) { const d = await get(url); media.push(...(d.data || [])); url = d.paging?.next || ''; }
  const one = async (id, metric) => {
    try {
      const d = await get(`${root}/${id}/insights?` + new URLSearchParams({ metric, access_token: token }));
      return Object.fromEntries((d.data || []).map((x) => [x.name, num(x.values?.[0]?.value ?? x.total_value?.value)]));
    } catch { return null; }
  };
  const out = new Map();
  const queue = media.slice(0, limit);
  await Promise.all(Array.from({ length: 6 }, async () => {
    for (let m; (m = queue.shift());) {
      const code = m.shortcode || sc(m.permalink);
      if (!code) continue;
      const ins = (await one(m.id, 'views,shares,saved')) || (await one(m.id, 'shares,saved')) || {};
      const rep = (await one(m.id, 'reposts')) || {};
      const shares = ins.shares == null && rep.reposts == null ? null : (ins.shares || 0) + (rep.reposts || 0);
      out.set(code, { views: ins.views ?? null, shares, comments: num(m.comments_count), likes: num(m.like_count) });
    }
  }));
  return out;
}
// the scraped own posts with the Graph numbers on top (a known number wins over an unknown one)
export function withGraph(posts, g) {
  if (!g?.size) return posts;
  return posts.map((x) => {
    const n = g.get(x.code);
    if (!n) return x;
    return { ...x, graph: true, shares: n.shares ?? x.shares, comments: n.comments ?? x.comments, likes: n.likes ?? x.likes,
      views: x.kind === 'reel' ? n.views ?? x.views : x.views };
  });
}
