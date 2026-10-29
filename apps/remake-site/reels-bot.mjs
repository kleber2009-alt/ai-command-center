/* Ветка «Instagram Reels» в Telegram — связка как у Threads: каждый день карточки залётов → ✅ Одобрено → готовый рилс файлом.

   Цепочка на каждый рилс (шаги — студии, studio.mjs):
     поиск залётов (Apify): конкуренты из списка, а пока его нет — свой аккаунт (instagram.username из config.json скилла);
     сила = просмотры / медиана просмотров автора (как xn в Threads), не младше REELS_MIN_AGE_DAYS дней, уже взятые — мимо
     → видео → расшифровка (мало речи — не говорящая голова, берём следующего) → «Сценарий 2.0» Claude с новым хуком
       по правилам скилла remake-top-reel и его проверкой → карточка в ветку
     → ✅ Одобрено → аватар HeyGen (образ, голос и движок — из config.json скилла) → монтаж стилем Кадрика
     → видео файлом в ветку (больше 49 МБ — пережимаем; не вышло — ссылка на remake.aicex.club).

   Кнопки карточки: ✅ Одобрено · 🔄 Другой хук · 🎨 Стиль · 🗑 Пропустить. Ответ на карточку текстом — Claude переписывает
   сценарий с этим пожеланием. Жать кнопки и писать команды могут REMAKE_TG_OWNER_IDS (а если их нет — тот, кто первым
   сделал /bind).

   Команды в ветке: /bind — эта ветка теперь «Instagram Reels» (бот переименует её; нужен админ с правом «Управление темами»)
     /scan — найти залёты сейчас · /competitors [add|del @ник …] — список конкурентов · /status · /help
     ссылка на рилс в ветке — сразу в работу, как карточка из поиска.

   Env: REMAKE_TG_BOT_TOKEN (свой бот: getUpdates не делят с другим процессом) · REMAKE_TG_OWNER_IDS (id через запятую)
     REMAKE_TG_CHAT_ID / REMAKE_TG_TOPIC_ID (иначе — из /bind) · REELS_TOPIC_NAME (Instagram Reels) · REELS_COMPETITORS
     (@ники через запятую, стартовый список) · REELS_PER_DAY (2) · REELS_HOUR (9, по REELS_TZ Europe/Moscow)
     REELS_DAYS (30 — окно поиска у конкурентов; свой аккаунт — scan.days скилла) · REELS_MIN_AGE_DAYS (2) · APIFY_TOKEN
     для заглушек — TELEGRAM_API_BASE, APIFY_API_BASE.
   Одна ветка — один бот (tg-branch.mjs): бот слышит только свою ветку, команды с @другим_ботом не его, занятую веткой
   «Instagram Карусели» ветку не привязать. После ✅ под карточкой — статус: что сделано, что идёт сейчас и сколько, что дальше.
   Состояние — DATA_DIR/reels/state.json. */
import fs from 'node:fs';
import path from 'node:path';
import { takenBy, parse, progressText, wrongBind, BRANCHES } from './tg-branch.mjs';

const env = (k, d = '') => (process.env[k] || d).trim();
const TOKEN = env('REMAKE_TG_BOT_TOKEN');
const TG = `${env('TELEGRAM_API_BASE', 'https://api.telegram.org')}/bot${TOKEN}`;
const APIFY_BASE = env('APIFY_API_BASE', 'https://api.apify.com');
const TOPIC_NAME = env('REELS_TOPIC_NAME', 'Instagram Reels');
const PER_DAY = Math.max(1, Math.min(5, Number(env('REELS_PER_DAY', '2')) || 2));
const HOUR = Number(env('REELS_HOUR', '9'));
const TZ = env('REELS_TZ', 'Europe/Moscow');
const DAYS = Number(env('REELS_DAYS', '30')) || 30;
const MIN_AGE = Number(env('REELS_MIN_AGE_DAYS', '2'));
const ACTOR = env('APIFY_INSTAGRAM_ACTOR', 'apify~instagram-scraper');
const TG_MAX = 49 * 1024 ** 2;
const MIN_WORDS = 30;
const NICK = /^[a-z0-9._]{1,30}$/;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (n) => n == null ? '—' : n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.0', '')} млн` : n >= 1e3 ? `${Math.round(n / 1e3)} тыс.` : String(Math.round(n));
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(new Date());
const hourNow = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(new Date())) % 24;
const nick = (s) => String(s || '').trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/\/.*$/, '').toLowerCase();
const shortcode = (url) => (String(url || '').match(/instagram\.com\/(?:[\w.]+\/)?(?:reels?|p|tv)\/([A-Za-z0-9_-]+)/) || [])[1] || '';

export function createReelsBot({ studio, data }) {
  if (!TOKEN) return { enabled: false };
  const S = studio;
  const FILE = path.join(data, 'reels', 'state.json');
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  let st = {};
  try { st = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {}
  st = { chat_id: Number(env('REMAKE_TG_CHAT_ID')) || 0, topic_id: Number(env('REMAKE_TG_TOPIC_ID')) || 0, owners: [], offset: 0,
    competitors: env('REELS_COMPETITORS').split(/[\s,]+/).map(nick).filter((x) => NICK.test(x)), used: {}, pool: [], last_scan: '', styles_n: 0, ...st };
  const save = () => { fs.writeFileSync(FILE + '.part', JSON.stringify(st, null, 1)); fs.renameSync(FILE + '.part', FILE); };
  const owners = () => new Set([...env('REMAKE_TG_OWNER_IDS').split(/[\s,]+/).filter(Boolean).map(Number), ...(st.owners || [])]);

  // ---------- Telegram ----------
  async function tg(method, body, { timeout = 60e3 } = {}) {
    const isForm = body instanceof FormData;
    const r = await fetch(`${TG}/${method}`, { method: 'POST', body: isForm ? body : JSON.stringify(body || {}),
      headers: isForm ? {} : { 'content-type': 'application/json' }, signal: AbortSignal.timeout(timeout) });
    const d = await r.json().catch(() => ({}));
    if (!d.ok) throw Object.assign(new Error(`Telegram ${method}: ${d.description || r.status}`), { tg: d });
    return d.result;
  }
  const where = () => ({ chat_id: st.chat_id, ...(st.topic_id ? { message_thread_id: st.topic_id } : {}) });
  const say = (text, extra = {}) => st.chat_id
    ? tg('sendMessage', { ...where(), text: text.slice(0, 4096), parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra })
      .catch((e) => console.error('reels say:', e.message))
    : Promise.resolve(null);
  const quiet = (p) => p.catch((e) => { if (!/not modified/.test(e.message)) console.error('reels:', e.message); });
  let me = '';  // the bot's @username (getMe)

  // ---------- status after ✅: one message under the card, edited as the steps go ----------
  const STEPS = (j) => [
    { label: 'Аватар в HeyGen', eta: 'обычно 5–15 мин' },
    { label: `Монтаж «${styleOf(j).name}» в Студии Кадрика`, eta: 'обычно 5–15 мин' },
    { label: 'Видео, подпись и кодовое слово — сюда', eta: 'до 2 мин' },
  ];
  async function progress(j, cur, failed = '') {
    const p = j.reels.progress ||= { msg: 0, started: new Date().toISOString() };
    if (p.cur !== cur || p.failed !== failed) { if (p.cur !== cur) p.step_at = new Date().toISOString(); p.cur = cur; p.failed = failed; S.save(j); }
    const id = ['avatar', 'montage'][cur];
    const note = !failed && id && j.steps[id]?.state === 'run' ? j.steps[id].note || '' : '';
    const detail = /^монтаж: «/.test(note) ? '' : esc(note);  // the montage note only repeats the step's label
    const text = progressText({ title: `Рилс по залёту @${esc(j.reels.origin.author || '?')}`, steps: STEPS(j), cur, failed: esc(failed), detail, started: p.started, stepAt: p.step_at });
    if (p.msg) {
      try { await tg('editMessageText', { chat_id: st.chat_id, message_id: p.msg, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true } }); return; }
      catch (e) { if (/not modified/.test(e.message)) return; if (!/not found|can't be edited/i.test(e.message)) return console.error('reels progress:', e.message); }
    }
    const m = await say(text, j.reels.card ? { reply_parameters: { message_id: j.reels.card, allow_sending_without_reply: true } } : {});
    if (m) { p.msg = m.message_id; S.save(j); }
  }

  // ---------- 1. find the reels that took off ----------
  async function apify(input) {
    if (!S.apify) throw new Error('нет APIFY_TOKEN — искать залёты нечем');
    const r = await fetch(`${APIFY_BASE}/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(S.apify)}&timeout=280`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(300e3) });
    const d = await r.json().catch(() => null);
    if (!r.ok || !Array.isArray(d)) throw new Error(`Apify: ${r.status} ${JSON.stringify(d || {}).slice(0, 200)}`);
    return d;
  }

  async function scanAccounts(list, days) {
    const items = await apify({ directUrls: list.map((u) => `https://www.instagram.com/${u}/`), resultsType: 'posts', resultsLimit: 40, onlyPostsNewerThan: `${days} days` });
    const reels = items.filter((p) => p.videoUrl || p.type === 'Video' || p.productType === 'clips').map((p) => ({
      url: p.url || (p.shortCode ? `https://www.instagram.com/reel/${p.shortCode}/` : ''), code: p.shortCode || shortcode(p.url),
      author: (p.ownerUsername || '').toLowerCase(), caption: p.caption || '', video_url: p.videoUrl || '', thumb: p.displayUrl || '',
      views: p.videoPlayCount ?? p.videoViewCount ?? null, likes: p.likesCount ?? null, comments: p.commentsCount ?? null,
      duration: p.videoDuration ?? null, date: p.timestamp || '' })).filter((r) => r.code);
    // strength like Threads' xn: views over the author's median, so a small competitor's hit counts as much as a big one's
    const by = {};
    for (const r of reels) (by[r.author] ||= []).push(r.views ?? r.likes ?? 0);
    const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : 0; };
    const med = Object.fromEntries(Object.entries(by).map(([a, v]) => [a, median(v) || 1]));
    const minAge = Date.now() - MIN_AGE * 864e5;
    return reels.filter((r) => !r.date || Date.parse(r.date) <= minAge)
      .filter((r) => !r.duration || (r.duration >= 12 && r.duration <= 120))
      .map((r) => ({ ...r, xn: Math.round(((r.views ?? r.likes ?? 0) / med[r.author]) * 10) / 10, median: med[r.author] }))
      .sort((a, b) => b.xn - a.xn || (b.views || 0) - (a.views || 0));
  }

  async function scan(manual = false) {
    const cfg = S.skillConfig();
    const own = nick(cfg.instagram?.username || 'ilia.paliy');
    const mode = st.competitors.length ? 'competitors' : 'own';
    const accounts = mode === 'competitors' ? st.competitors : [own];
    const days = mode === 'competitors' ? DAYS : cfg.scan?.days || 180;
    const reuse = Date.now() - (cfg.scan?.reuse_after_days || 60) * 864e5;
    st.last_scan = today();
    save();
    let found;
    try { found = await scanAccounts(accounts, days); }
    catch (e) { await say(`⚠️ Поиск залётов не удался: ${esc(e.message)}`); return; }
    const fresh = found.filter((r) => !st.used[r.code] || Date.parse(st.used[r.code]) < reuse);
    if (mode === 'competitors' && fresh.length < PER_DAY) {  // competitors have nothing new — top up from the own account
      try { fresh.push(...(await scanAccounts([own], cfg.scan?.days || 180)).filter((r) => !st.used[r.code] || Date.parse(st.used[r.code]) < reuse)); } catch {}
    }
    st.pool = fresh.slice(0, 15);
    save();
    if (!st.pool.length) { await say(`Новых залётов не нашёл (${mode === 'competitors' ? 'конкуренты: ' + esc(accounts.map((a) => '@' + a).join(', ')) : '@' + esc(own)}).`); return; }
    await say(`🔎 ${manual ? 'Ищу' : 'Утренний поиск'}: ${mode === 'competitors' ? 'конкуренты ' + esc(accounts.map((a) => '@' + a).join(', ')) : 'конкурентов нет — беру свой @' + esc(own)} · ` +
      `найдено рилсов: ${found.length}, беру самых залетевших: ${Math.min(PER_DAY, st.pool.length)}. Карточки придут, как будут готовы сценарии.`);
    for (let i = 0; i < PER_DAY; i++) next();
  }

  function next() {
    const r = st.pool.shift();
    if (!r) return null;
    st.used[r.code] = new Date().toISOString();
    save();
    return start(r);
  }

  function start(r, { manual = false } = {}) {
    const j = S.newJob({ title: (r.caption || 'Залёт @' + r.author).split('\n')[0].slice(0, 80), source: { url: r.url } });
    j.reels = { origin: r, manual, card: 0, style: '', state: 'prep' };
    S.save(j);
    S.source(j, r.video_url, { url: r.url, via: r.video_url ? 'apify' : 'link', caption: r.caption, author: r.author, views: r.views, likes: r.likes, comments: r.comments });
    return j;
  }

  // ---------- 2. card ----------
  function styleOf(j) {
    const list = S.skillConfig().styles || [];
    if (!j.reels.style && list.length) { j.reels.style = list[(st.styles_n++) % list.length].id; save(); S.save(j); }
    return list.find((s) => s.id === j.reels.style) || { id: j.reels.style, name: j.reels.style || 'по умолчанию' };
  }

  function cardText(j) {
    const r = j.reels.origin, sc = j.script, c = j.check;
    const stats = [r.views != null && `${fmt(r.views)} просмотров`, r.comments != null && `${fmt(r.comments)} комм.`, r.likes != null && `${fmt(r.likes)} лайков`].filter(Boolean).join(' · ');
    const head = `🎬 <b>Залёт @${esc(r.author || '?')}</b>${r.xn ? ` · ×${r.xn} к медиане` : ''}\n${stats ? esc(stats) + '\n' : ''}<a href="${esc(r.url)}">оригинал</a>`;
    const why = (sc.analysis || []).slice(0, 4).map((x) => '• ' + esc(x)).join('\n');
    const hook = sc.hook_from || sc.hook_to ? `<b>Хук:</b> ${esc(sc.hook_from || '?')} → <b>${esc(sc.hook_to || '?')}</b>` : '';
    const check = c ? `Проверка скилла: <b>${c.result}</b>${c.overlap != null ? ` · совпадение с оригиналом ${Math.round(c.overlap * 100)}%` : ''}${c.est_sec ? ` · ≈${Math.round(c.est_sec)} с` : ''}` +
      (c.result === 'FAIL' ? '\n' + c.lines.filter((l) => l.kind === 'fail').slice(0, 3).map((l) => '⛔ ' + esc(l.text)).join('\n') : '') : '';
    const state = { prep: '', card: `Стиль монтажа: <b>${esc(styleOf(j).name)}</b>\n✅ — в HeyGen и монтаж · ответьте на карточку текстом — перепишу с пожеланием`,
      avatar: '⏳ <b>Одобрено.</b> HeyGen рендерит аватара…', montage: `⏳ <b>Одобрено.</b> Монтаж «${esc(styleOf(j).name)}» в Студии Кадрика…`,
      done: '✅ <b>Готово</b> — видео ниже', skip: '🗑 Пропущено', fail: '⚠️ Сорвалось — см. сообщение ниже' }[j.reels.state] || '';
    let script = sc.text || '';
    const top = [head, why && `<b>Почему залетел:</b>\n${why}`, hook].filter(Boolean).join('\n\n');
    const bottom = [check, j.code && `Кодовое слово: <b>${esc(j.code)}</b>`, state].filter(Boolean).join('\n');
    const room = 4000 - top.length - bottom.length - 80;
    if (esc(script).length > room) script = script.slice(0, Math.max(0, room - (esc(script).length - script.length))) + '…';
    return [top, script && `<b>Сценарий 2.0:</b>\n<blockquote expandable>${esc(script)}</blockquote>`, bottom].filter(Boolean).join('\n\n');
  }

  function buttons(j) {
    if (j.reels.state !== 'card') return { inline_keyboard: j.reels.state === 'fail' ? [[{ text: '🔁 Повторить', callback_data: `r:retry:${j.id}` }]] : [] };
    return { inline_keyboard: [
      [{ text: '✅ Одобрено', callback_data: `r:ok:${j.id}` }],
      [{ text: '🔄 Другой хук', callback_data: `r:hook:${j.id}` }, { text: '🎨 Стиль', callback_data: `r:style:${j.id}` }, { text: '🗑 Пропустить', callback_data: `r:skip:${j.id}` }],
    ] };
  }

  async function card(j) {
    const body = { text: cardText(j), parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: buttons(j) };
    if (j.reels.card) {
      try { await tg('editMessageText', { chat_id: st.chat_id, message_id: j.reels.card, ...body }); return; }
      catch (e) { if (/not modified/.test(e.message)) return; console.error('reels card edit:', e.message); }
    }
    if (!st.chat_id) return;
    const m = await tg('sendMessage', { ...where(), ...body }).catch((e) => { console.error('reels card:', e.message); return null; });
    if (m) { j.reels.card = m.message_id; S.save(j); }
  }

  async function fail(j, what, text) {
    const was = j.reels.state;
    j.reels.state = 'fail';
    j.reels.failed = what;
    S.save(j);
    await card(j);
    if (j.reels.progress && ['avatar', 'montage'].includes(was)) return progress(j, j.reels.progress.cur ?? 0, `${what}: ${text}`.slice(0, 300));
    await say(`⚠️ ${esc(what)}: ${esc(text)}`, j.reels.card ? { reply_parameters: { message_id: j.reels.card, allow_sending_without_reply: true } } : {});
  }

  // ---------- 3. after ✅: HeyGen → montage → file ----------
  async function approve(j) {
    const av = S.skillConfig().avatar || {};
    if (!S.ready.heygen) return fail(j, 'HeyGen', 'на сервере нет HEYGEN_API_KEY');
    if (!av.look_id || !av.voice_id) return fail(j, 'HeyGen', 'в config.json скилла не выбран образ или голос (avatar.look_id / voice_id)');
    j.reels.state = 'avatar';
    j.reels.approved_at = new Date().toISOString();
    if (j.reels.progress?.failed || !j.reels.progress) j.reels.progress = { msg: j.reels.progress?.msg || 0, started: j.reels.progress?.started || new Date().toISOString() };
    S.save(j);
    await card(j);
    await progress(j, 0);
    try { await S.avatar(j, { look_id: av.look_id, voice_id: av.voice_id, engine: S.engineToday(), speed: av.speed || 1 }); }
    catch (e) { await fail(j, 'HeyGen', e.message); }
  }

  async function montage(j) {
    j.reels.state = 'montage';
    S.save(j);
    await card(j);
    await progress(j, 1);
    const want = styleOf(j).id;
    const all = S.styles().styles;
    const style = all.find((s) => s.id === want) || all[0];
    if (!style) return fail(j, 'Монтаж', 'нет ни одного стиля Кадрика');
    try { await S.montage(j, { skill: style.id, wish: '' }); }
    catch (e) { await fail(j, 'Монтаж', e.message); }
  }

  async function shrink(src, duration) {
    const out = src.replace(/\.mp4$/, '') + '-tg.mp4';
    const kbps = Math.max(600, Math.floor((TG_MAX * 8) / 1024 / Math.max(duration || 60, 1)) - 160);
    const r = await S.run('ffmpeg', ['-v', 'error', '-y', '-i', src, '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', `${kbps}k`, '-maxrate', `${kbps}k`,
      '-bufsize', `${kbps * 2}k`, '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out], { timeout: 20 * 60e3 });
    return r.code === 0 && fs.existsSync(out) && fs.statSync(out).size <= TG_MAX ? out : '';
  }

  async function deliver(j) {
    await progress(j, 2);
    const m = j.montage, file = S.mpath(m.video.replace(/^media\//, ''));
    const link = `${S.publicUrl}/${m.video}`;
    const caption = [`🎬 Готово: «${m.style}» по залёту @${j.reels.origin.author || '?'}`, j.code ? `Кодовое слово: ${j.code}` : '', `Скачать в полном качестве: ${link}`]
      .filter(Boolean).join('\n').slice(0, 1024);
    let sent = false, tmp = '';
    try {
      let f = file;
      if (!m.zip && fs.statSync(f).size > TG_MAX) f = tmp = await shrink(f, m.duration);
      if (f && !m.zip) {
        const fd = new FormData();
        for (const [k, v] of Object.entries(where())) fd.append(k, String(v));
        fd.append('caption', caption);
        fd.append('supports_streaming', 'true');
        if (m.width) { fd.append('width', String(m.width)); fd.append('height', String(m.height)); }
        if (m.duration) fd.append('duration', String(Math.round(m.duration)));
        if (j.reels.card) fd.append('reply_parameters', JSON.stringify({ message_id: j.reels.card, allow_sending_without_reply: true }));
        fd.append('video', await fs.openAsBlob(f, { type: 'video/mp4' }), 'reel.mp4');
        await tg('sendVideo', fd, { timeout: 10 * 60e3 });
        sent = true;
      }
    } catch (e) { console.error('reels sendVideo:', e.message); }
    finally { if (tmp) fs.rmSync(tmp, { force: true }); }
    if (!sent) await say(`🎬 Готово: «${esc(m.style)}». Файл не пролез в Telegram — скачать: ${esc(link)}`);
    if (j.caption) await say(`<b>Подпись к посту:</b>\n${esc(j.caption).slice(0, 3800)}`);
    j.reels.state = 'done';
    S.save(j);
    await card(j);
    await progress(j, 3);
  }

  // the studio reports every step of the bot's clips
  S.on((j, id, state) => {
    if (!j.reels || ['skip', 'done'].includes(j.reels.state)) return;
    const go = (p) => Promise.resolve().then(p).catch((e) => console.error(`reels ${j.id}:`, e.message));
    const STEP = { source: 'Видео', transcribe: 'Расшифровка', script: 'Сценарий', avatar: 'HeyGen', montage: 'Монтаж' };
    if (state === 'fail') {
      // a found reel that won't download or transcribe is just replaced by the next one; anything later is reported
      if (['source', 'transcribe'].includes(id) && j.reels.state === 'prep' && !j.reels.manual) {
        j.reels.state = 'skip';
        S.save(j);
        return go(() => next());
      }
      return go(() => fail(j, STEP[id] || id, j.steps[id].note));
    }
    if (id === 'transcribe' && state === 'done') {
      if ((j.transcript.words || 0) < MIN_WORDS && !j.reels.manual) {  // not a talking head — the next one from the pool
        S.log(j, `мало речи (${j.transcript.words || 0} слов) — не говорящая голова, беру следующий залёт`);
        j.reels.state = 'skip';
        S.save(j);
        return go(() => next());
      }
      if (!S.ready.claude) return go(() => fail(j, 'Сценарий', 'нет ANTHROPIC_API_KEY'));
      return go(() => S.rewrite(j, ''));
    }
    if (id === 'script' && state === 'done' && j.script.origin === 'claude' && ['prep', 'card', 'fail'].includes(j.reels.state)) {
      j.reels.state = 'card';
      S.save(j);
      return go(() => card(j));
    }
    if (id === 'avatar' && state === 'done' && j.reels.state === 'avatar') return go(() => montage(j));
    if (id === 'montage' && state === 'done' && j.reels.state === 'montage' && j.montage.video) return go(() => deliver(j));
  });

  // ---------- 4. buttons, replies, commands ----------
  async function onCallback(q) {
    const [, act, id] = String(q.data || '').split(':');
    const answer = (text = '', alert = false) => quiet(tg('answerCallbackQuery', { callback_query_id: q.id, text, show_alert: alert }));
    if (!owners().has(q.from.id)) return answer('Кнопки — только у владельца', true);
    const j = S.get(id);
    if (!j?.reels) return answer('Этого ролика уже нет');
    if (act === 'ok') {
      if (j.reels.state !== 'card') return answer('Уже в работе — статус под карточкой');
      if (j.check?.result === 'FAIL') answer('Проверка скилла не прошла, но запускаю. Статус — под карточкой');
      else answer('Запускаю: аватар HeyGen → монтаж → видео сюда. Статус — под карточкой');
      return approve(j);
    }
    if (act === 'hook') {
      if (j.reels.state !== 'card' || S.busy(j, 'script')) return answer('Сценарий уже переписывается');
      answer('Пишу другой хук…');
      return S.rewrite(j, `Нужен другой хук, не «${j.script.hook_to || ''}» и не этот: «${(j.script.text || '').split('\n')[0].slice(0, 200)}». Возьми другой тип хука из банка.`);
    }
    if (act === 'style') {
      const list = S.skillConfig().styles || [];
      const i = list.findIndex((s) => s.id === j.reels.style);
      j.reels.style = list[(i + 1) % Math.max(list.length, 1)]?.id || '';
      S.save(j);
      answer(`Стиль: ${styleOf(j).name}`);
      return card(j);
    }
    if (act === 'skip') {
      j.reels.state = 'skip';
      S.save(j);
      answer('Пропустил');
      return card(j);
    }
    if (act === 'retry') {
      if (j.reels.state !== 'fail') return answer();
      answer('Повторяю');
      const what = j.reels.failed;
      if (what === 'Монтаж' && j.avatar.video) return montage(j);
      if (what === 'HeyGen' || (what === 'Монтаж' && !j.avatar.video)) return approve(j);
      j.reels.state = 'prep';
      S.save(j);
      if (!j.source.file) return S.source(j, j.reels.origin.video_url, { url: j.reels.origin.url, author: j.reels.origin.author, caption: j.reels.origin.caption });
      return S.rewrite(j, '');
    }
    return answer();
  }

  const HELP = `<b>Instagram Reels</b> — связка как у Threads.\nКаждый день в ${HOUR}:00 (${esc(TZ)}) ищу залёты у конкурентов (нет конкурентов — в вашем аккаунте), ` +
    `уникализирую хук и сценарий и присылаю карточки. ✅ Одобрено — аватар HeyGen, монтаж Кадрика и готовое видео файлом сюда.\n\n` +
    `/scan — найти залёты сейчас\n/competitors — список конкурентов\n/competitors add @ник @ник — добавить\n/competitors del @ник — убрать\n/status — что в работе\n` +
    `Ссылка на рилс сюда — сразу в работу. Ответ на карточку текстом — перепишу сценарий с пожеланием.`;

  async function onMessage(msg) {
    const { text, cmd, forMe, forOther, topic } = parse(msg, me);
    if (forOther) return;  // /scan@other_bot — not ours
    const isOwner = owners().has(msg.from?.id);
    if (cmd === 'bind') {
      if (!isOwner && owners().size) return;
      const here = st.chat_id === msg.chat.id && st.topic_id === topic;
      const reply = (t) => tg('sendMessage', { chat_id: msg.chat.id, ...(topic ? { message_thread_id: topic } : {}), text: t, parse_mode: 'HTML' }).catch(() => {});
      // a plain /bind is for a bot without a topic; moving this one — /bind@me
      if (st.chat_id && !here && !forMe) return me && wrongBind({ data, self: 'reels', me, chat: msg.chat.id, topic, reply });
      if (msg.chat.is_forum && !topic) return reply(`Привязать можно только ветку, не «Общий». Создайте ветку и напишите в ней /bind${me ? '@' + esc(me) : ''}.`);
      const other = takenBy(data, 'reels', msg.chat.id, topic);
      if (other) return forMe && reply(`Эта ветка уже за «${esc(BRANCHES[other])}». Для рилсов создайте свою ветку и напишите в ней /bind${me ? '@' + esc(me) : ''}.`);
      if (!owners().size) st.owners = [msg.from.id];
      st.chat_id = msg.chat.id;
      st.topic_id = topic;
      save();
      let renamed = '';
      if (st.topic_id) {
        try { await tg('editForumTopic', { chat_id: st.chat_id, message_thread_id: st.topic_id, name: TOPIC_NAME }); renamed = `Переименовал ветку в «${esc(TOPIC_NAME)}». `; }
        catch (e) { renamed = /NOT_MODIFIED/i.test(e.message) ? '' : `Переименовать ветку не смог (${esc(e.message)}) — дайте боту право «Управление темами». `; }
      }
      return say(`Готово: карточки рилсов теперь приходят сюда. ${renamed}\n\n${HELP}`);
    }
    if (!st.chat_id || msg.chat.id !== st.chat_id || topic !== (st.topic_id || 0)) return;  // only its own topic
    if (!isOwner) return;
    if (cmd === 'help' || cmd === 'start') return say(HELP);
    if (cmd === 'scan') { if (!S.apify) return say('⚠️ Нет APIFY_TOKEN — искать залёты нечем.'); return scan(true); }
    if (cmd === 'competitors') {
      const [, op, ...rest] = text.split(/\s+/);
      const names = rest.map(nick).filter((x) => NICK.test(x));
      if (op === 'add') st.competitors = [...new Set([...st.competitors, ...names])];
      if (op === 'del' || op === 'rm') st.competitors = st.competitors.filter((x) => !names.includes(x));
      save();
      return say(st.competitors.length ? `Конкуренты (${st.competitors.length}): ${st.competitors.map((x) => '@' + esc(x)).join(', ')}`
        : `Конкурентов нет — ищу залёты в вашем аккаунте @${esc(nick(S.skillConfig().instagram?.username))}.\nДобавить: /competitors add @ник @ник`);
    }
    if (cmd === 'status') {
      const mine = S.list().filter((j) => j.reels && !['skip', 'done'].includes(j.reels.state)).sort((a, b) => a.created_at.localeCompare(b.created_at));
      const ru = { prep: 'готовлю сценарий', card: 'ждёт ✅', avatar: 'HeyGen', montage: 'монтаж', fail: 'сорвалось' };
      return say(mine.length ? mine.map((j) => `• @${esc(j.reels.origin.author)} — ${ru[j.reels.state] || j.reels.state}`).join('\n') +
        `\n\nПоследний поиск: ${esc(st.last_scan || 'ещё не было')}` : `Сейчас ничего не в работе. Последний поиск: ${esc(st.last_scan || 'ещё не было')}`);
    }
    // a reply to a card — a wish for the script
    const reply = msg.reply_to_message?.message_id;
    const j = reply && S.list().find((x) => x.reels?.card === reply);
    if (j && text && !cmd) {
      if (j.reels.state !== 'card') return say('Эта карточка уже в работе или закрыта.');
      if (S.busy(j, 'script')) return say('Сценарий ещё переписывается — подождите карточку.');
      S.rewrite(j, text.slice(0, 1500));
      return say('✏️ Переписываю сценарий с пожеланием — карточка обновится.', { reply_parameters: { message_id: reply, allow_sending_without_reply: true } });
    }
    const url = (text.match(/https?:\/\/(?:www\.)?instagram\.com\/[^\s]+/i) || [])[0];
    if (url && shortcode(url)) {
      const code = shortcode(url);
      st.used[code] = new Date().toISOString();
      save();
      await say('Взял рилс в работу — пришлю карточку со сценарием.');
      let r = { url, code, author: nick(url.match(/instagram\.com\/([\w.]+)\/(?:reels?|p)\//)?.[1] || ''), caption: '', video_url: '' };
      if (S.apify) {  // metrics and a direct video link; without them the studio tries yt-dlp by the page link
        try {
          const p = (await apify({ directUrls: [url], resultsType: 'details', resultsLimit: 1 })).find((x) => (x.shortCode || shortcode(x.url)) === code);
          if (p) r = { ...r, author: (p.ownerUsername || r.author).toLowerCase(), caption: p.caption || '', video_url: p.videoUrl || '',
            views: p.videoPlayCount ?? p.videoViewCount ?? null, likes: p.likesCount ?? null, comments: p.commentsCount ?? null };
        } catch (e) { console.error('reels link:', e.message); }
      }
      start(r, { manual: true });
      return;
    }
  }

  // ---------- long polling + daily scan ----------
  let stopped = false;
  (async function poll() {
    try { await tg('deleteWebhook', {}); } catch {}
    try { me = (await tg('getMe', {})).username || ''; if (me && st.bot !== me) { st.bot = me; save(); } } catch (e) { console.error('reels getMe:', e.message); }
    while (!stopped) {
      try {
        const ups = await tg('getUpdates', { offset: st.offset, timeout: 50, allowed_updates: ['message', 'callback_query'] }, { timeout: 70e3 });
        for (const u of ups) {
          st.offset = u.update_id + 1;
          try { if (u.callback_query) await onCallback(u.callback_query); else if (u.message) await onMessage(u.message); }
          catch (e) { console.error('reels update:', e.message); }
        }
        if (ups.length) save();
      } catch (e) {
        console.error('reels poll:', e.message);
        await new Promise((r) => setTimeout(r, /Conflict/.test(e.message) ? 60e3 : 5e3));
      }
    }
  })();

  setInterval(() => {  // the status message shows how long the running step has been going
    for (const j of S.list()) if (j.reels?.progress?.msg && ['avatar', 'montage'].includes(j.reels.state)) progress(j, j.reels.progress.cur).catch(() => {});
  }, 60e3).unref();

  setInterval(() => {
    if (st.chat_id && S.apify && st.last_scan !== today() && hourNow() >= HOUR) scan(false).catch((e) => console.error('reels scan:', e.message));
  }, 5 * 60e3).unref();

  // after a restart: cards whose step finished while the process was down
  for (const j of S.list()) {
    if (!j.reels) continue;
    if (j.reels.state === 'prep' && j.steps.script?.state === 'done' && j.script.origin === 'claude') { j.reels.state = 'card'; S.save(j); card(j); }
    if (j.reels.state === 'avatar' && j.steps.avatar?.state === 'done') montage(j);
    if (j.reels.state === 'montage' && j.steps.montage?.state === 'done' && j.montage.video) deliver(j);
  }

  return { enabled: true, status: () => ({ bot: me ? '@' + me : '', bound: Boolean(st.chat_id), topic: st.topic_id || 0, competitors: st.competitors.length, last_scan: st.last_scan }), stop: () => { stopped = true; } };
}
