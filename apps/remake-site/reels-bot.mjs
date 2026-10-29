/* Ветка «Instagram Reels» в Telegram — связка как у Threads: каждый день карточки залётов → ✅ Одобрено → готовый рилс файлом.

   Цепочка на каждый рилс (шаги — студии, studio.mjs):
     поиск залётов (Apify): конкуренты из списка, а пока его нет — свой аккаунт (instagram.username из config.json скилла);
     сила = просмотры / медиана просмотров автора (как xn в Threads), не младше REELS_MIN_AGE_DAYS дней, уже взятые — мимо
     → видео → расшифровка (мало речи — не говорящая голова, берём следующего) → «Сценарий 2.0» Claude с новым хуком
       по правилам скилла remake-top-reel и его проверкой → карточка в ветку
     → ✅ Одобрено → аватар HeyGen (образ, голос и движок — из config.json скилла) → монтаж стилем Кадрика
     → видео файлом в ветку (больше 49 МБ — пережимаем; не вышло — ссылка на remake.aicex.club).

   Кнопки карточки — как в ветке Threads: ✅ Одобрить · ✏️ Править / 🔄 Хук · ♻️ Другой · 📎 Материалы / ⏰ Слот · 🎨 Стиль ·
   🗑 Пропустить; под готовым видео — ✏️ Править и ⏰ Слот.
     ✏️ Править (кнопка → ответ текстом или голосом, или ответ на карточку/видео): до ✅ Claude правит сценарий; после
       готовности монтаж переделывается с правкой на том же аватаре, правка со слова «сценарий» — новый сценарий и после ✅
       новый аватар;
     🔄 Хук — несколько других хуков разными механиками, выбор кнопкой → сценарий под выбранный хук;
     ♻️ Другой — этот залёт в сторону, следующий из запаса поиска в тот же слот;
     📎 Материалы — ваша история, цифры, пример (текстом или голосом) вплетаются в сценарий;
     ⏰ Слот — время публикации (REELS_SLOTS); карточке слот ставится сам, в слот бот напоминает: готово — видео и подпись
       выше, не готово — что нажать. Жать кнопки и писать команды могут REMAKE_TG_OWNER_IDS (а если их нет — тот, кто первым
   сделал /bind).

   Команды в ветке: /bind — эта ветка теперь «Instagram Reels» (бот переименует её; нужен админ с правом «Управление темами»)
     /scan — найти залёты сейчас · /competitors [add|del @ник …] — список конкурентов · /status · /help
     ссылка на рилс в ветке — сразу в работу, как карточка из поиска.

   Env: REMAKE_TG_BOT_TOKEN (свой бот: getUpdates не делят с другим процессом) · REMAKE_TG_OWNER_IDS (id через запятую)
     REMAKE_TG_CHAT_ID / REMAKE_TG_TOPIC_ID (иначе — из /bind) · REELS_TOPIC_NAME (Instagram Reels) · REELS_COMPETITORS
     (@ники через запятую, стартовый список) · REELS_PER_DAY (2) · REELS_HOUR (9, по REELS_TZ Europe/Moscow)
     REELS_DAYS (30 — окно поиска у конкурентов; свой аккаунт — scan.days скилла) · REELS_MIN_AGE_DAYS (2) · APIFY_TOKEN
     REELS_SLOTS (12:00,19:00 — время публикаций по REELS_TZ) · ELEVENLABS_API_KEY / OPENAI_API_KEY — голосовые правки
     для заглушек — TELEGRAM_API_BASE, APIFY_API_BASE.
   Одна ветка — один бот (tg-branch.mjs): бот слышит только свою ветку, команды с @другим_ботом не его, занятую веткой
   «Instagram Карусели» ветку не привязать. После ✅ под карточкой — статус: что сделано, что идёт сейчас и сколько, что дальше.
   Состояние — DATA_DIR/reels/state.json. */
import fs from 'node:fs';
import path from 'node:path';
import { takenBy, parse, progressText, wrongBind, laneOf, topicName, BRANCHES, parseSlots, slotChoices, fmtSlot, hookVariants, voiceToText } from './tg-branch.mjs';

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
const SLOTS = parseSlots(env('REELS_SLOTS', '12:00,19:00')).length ? parseSlots(env('REELS_SLOTS', '12:00,19:00')) : [[12, 0], [19, 0]];

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
    const slot = j.reels.slot ? `⏰ Публикация: <b>${esc(fmtSlot(j.reels.slot, TZ))}</b>` : '';
    const notes = (j.reels.notes || []).length ? `📎 Материалов вплетено: ${j.reels.notes.length}` : '';
    const state = { prep: '', card: `Стиль монтажа: <b>${esc(styleOf(j).name)}</b>\n✅ — в HeyGen и монтаж · ✏️ — правка сценария текстом или голосом`,
      avatar: '⏳ <b>Одобрено.</b> HeyGen рендерит аватара…', montage: `⏳ <b>Одобрено.</b> Монтаж «${esc(styleOf(j).name)}» в Студии Кадрика…`,
      done: '✅ <b>Готово</b> — видео ниже · ✏️ Править — переделаю монтаж с вашей правкой', skip: j.reels.replaced ? '♻️ Заменён другим залётом' : '🗑 Пропущено', fail: '⚠️ Сорвалось — см. сообщение ниже' }[j.reels.state] || '';
    let script = sc.text || '';
    const top = [head, why && `<b>Почему залетел:</b>\n${why}`, hook].filter(Boolean).join('\n\n');
    const bottom = [check, j.code && `Кодовое слово: <b>${esc(j.code)}</b>`, notes, j.reels.state !== 'skip' && slot, state].filter(Boolean).join('\n');
    const room = 4000 - top.length - bottom.length - 80;
    if (esc(script).length > room) script = script.slice(0, Math.max(0, room - (esc(script).length - script.length))) + '…';
    return [top, script && `<b>Сценарий 2.0:</b>\n<blockquote expandable>${esc(script)}</blockquote>`, bottom].filter(Boolean).join('\n\n');
  }

  // the same layout as the Threads topic: approve/edit · hook/other/materials · slot/style/skip
  function buttons(j) {
    const b = (text, act) => ({ text, callback_data: `r:${act}:${j.id}` });
    if (j.reels.state === 'done') return { inline_keyboard: [[b('✏️ Править', 'ed'), b('⏰ Слот', 'sl')]] };
    if (j.reels.state === 'fail') return { inline_keyboard: [[b('🔁 Повторить', 'retry')], [b('♻️ Другой', 'ot'), b('🗑 Пропустить', 'skip')]] };
    if (j.reels.state !== 'card') return { inline_keyboard: [] };
    return { inline_keyboard: [
      [b('✅ Одобрить', 'ok'), b('✏️ Править', 'ed')],
      [b('🔄 Хук', 'hk'), b('♻️ Другой', 'ot'), b('📎 Материалы', 'mt')],
      [b('⏰ Слот', 'sl'), b('🎨 Стиль', 'style'), b('🗑 Пропустить', 'skip')],
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
    j.reels.wish = '';  // a new avatar starts the montage clean
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
    try { await S.montage(j, { skill: style.id, wish: j.reels.wish || '' }); }
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
        const v = await tg('sendVideo', fd, { timeout: 10 * 60e3 });
        if (v) j.reels.video_msg = v.message_id;  // a reply to the video is a правка too
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
      if (!j.reels.slot) j.reels.slot = freeSlots(j)[0] || 0;
      S.save(j);
      return go(() => card(j));
    }
    if (id === 'avatar' && state === 'done' && j.reels.state === 'avatar') return go(() => montage(j));
    if (id === 'montage' && state === 'done' && j.reels.state === 'montage' && j.montage.video) return go(() => deliver(j));
  });

  // ---------- ✏️ Править · 📎 Материалы: the button asks, the answer (text or voice) is a reply ----------
  const ASK = {
    ed: (j) => j.reels.state === 'done'
      ? 'Что поправить в видео? Ответьте на это сообщение текстом или голосом — переделаю монтаж с правкой на том же аватаре (HeyGen не тратится).\n' +
        'Поменять сам текст — начните со слова «сценарий»: перепишу сценарий, а после ✅ аватар запишется заново.'
      : 'Что поправить в сценарии? Ответьте на это сообщение текстом или голосом — инструкцией («короче, хук жёстче») или своей версией куска. Меняю только это.',
    mt: () => 'Пришлите ответом на это сообщение текст или голос: свою историю, цифры, пример из практики — вплету в сценарий от первого лица, не ломая хук.',
  };
  async function ask(j, mode) {
    const title = mode === 'mt' ? '📎 <b>Материалы</b>' : '✏️ <b>Править</b>';
    const m = await say(`${title} · рилс по залёту @${esc(j.reels.origin.author || '?')}\n${esc(ASK[mode](j))}`, {
      reply_parameters: { message_id: (j.reels.state === 'done' && j.reels.video_msg) || j.reels.card, allow_sending_without_reply: true },
      reply_markup: { force_reply: true, input_field_placeholder: mode === 'mt' ? 'Ваша история или факт' : 'Что поправить?' } });
    if (m) { j.reels.ask = m.message_id; j.reels.ask_mode = mode; S.save(j); }
  }
  const scriptEdit = (j, text) => `Это правка к готовому сценарию: внеси её и не меняй остальное без нужды.\nПравка: ${text}\n\nТекущий сценарий:\n${j.script.text || ''}`;
  async function edit(j, text, where) {
    const re = { reply_parameters: { message_id: where, allow_sending_without_reply: true } };
    if (j.reels.state === 'card') {
      if (S.busy(j, 'script')) return say('Сценарий ещё переписывается — подождите карточку.', re);
      S.rewrite(j, scriptEdit(j, text));
      return say('✏️ Вношу правку в сценарий — карточка обновится.', re);
    }
    if (j.reels.state !== 'done') return say('Этот рилс сейчас в работе — править можно на карточке до ✅ или под готовым видео.', re);
    const m = text.match(/^\s*сценари[йяю]\s*[:,.—-]?\s*/i);
    if (m) {
      if (!S.ready.claude) return say('⚠️ Нет ANTHROPIC_API_KEY — сценарий править некому.', re);
      j.reels.state = 'prep';
      j.reels.progress = null;
      S.save(j);
      await card(j);
      S.rewrite(j, scriptEdit(j, text.slice(m[0].length) || text));
      return say('✏️ Переписываю сценарий с правкой — придёт карточка, после ✅ запишу аватара заново.', re);
    }
    if (!j.avatar?.video) return say('⚠️ Видео аватара не нашлось — правку монтажа не сделать.', re);
    j.reels.wish = text;
    j.reels.progress = { msg: 0, started: new Date().toISOString() };
    S.save(j);
    await say('✏️ Переделываю монтаж с правкой — новое видео придёт сюда, статус ниже.', re);
    return montage(j);
  }
  async function materials(j, text, where) {
    const re = { reply_parameters: { message_id: where, allow_sending_without_reply: true } };
    if (j.reels.state !== 'card') return say('Материалы вплетаются до ✅. Для готового видео — ✏️ Править со слова «сценарий».', re);
    if (S.busy(j, 'script')) return say('Сценарий ещё переписывается — подождите карточку.', re);
    (j.reels.notes ||= []).push(text);
    S.save(j);
    S.rewrite(j, `Вплети в сценарий материал владельца — от первого лица, коротко и конкретно, не ломая хук и структуру. Остальное оставь.\n` +
      `Материал: ${text}\n\nТекущий сценарий:\n${j.script.text || ''}`);
    return say('📎 Вплетаю ваш материал в сценарий — карточка обновится.', re);
  }

  // ---------- 🔄 Хук: other hooks with their mechanics, picked with a button ----------
  async function hooks(j, more = false) {
    if (!j.reels.hooks?.length || more) {
      let rules = '';
      try { rules = fs.readFileSync(path.join(S.skillDir, 'references/script-rules.md'), 'utf8'); } catch {}
      j.reels.hooks = await hookVariants({ apiKey: S.anthropic, model: S.model, rules, what: 'сценарий рилса — говорящая голова, хук — первая фраза',
        current: j.script.hook_to || (j.script.text || '').split('\n')[0], context: `Оригинал (расшифровка):\n${j.transcript?.text || ''}\n\nНаш сценарий:\n${j.script.text || ''}` });
      S.save(j);
    }
    const lines = [`🔄 <b>Хуки рилса по залёту @${esc(j.reels.origin.author || '?')}</b> — выберите кнопкой:`, `\n<b>★ сейчас:</b> ${esc(j.script.hook_to || '—')}`];
    j.reels.hooks.forEach((h, i) => lines.push(`\n<b>${i + 1}.</b>${h.mechanic ? ` <i>(${esc(h.mechanic)})</i>` : ''}\n${esc(h.text.slice(0, 600))}`));
    return say(lines.join('\n'), { reply_parameters: { message_id: j.reels.card, allow_sending_without_reply: true }, reply_markup: { inline_keyboard: [
      j.reels.hooks.map((_, i) => ({ text: String(i + 1), callback_data: `r:hs:${j.id}:${i}` })),
      [{ text: '🔄 Ещё варианты', callback_data: `r:hm:${j.id}` }]] } });
  }

  // ---------- ⏰ Слот: when to publish; a reminder comes at that time ----------
  function freeSlots(j, n = 8) {
    const taken = S.list().filter((x) => x.reels && x.id !== j.id && !['skip'].includes(x.reels.state) && !x.reels.slot_sent).map((x) => x.reels.slot);
    return slotChoices({ slots: SLOTS, tz: TZ, taken, n });
  }
  async function remind(j) {
    j.reels.slot_sent = true;
    S.save(j);
    if (Date.now() - j.reels.slot > 6 * 3600e3) return;  // the box was down through the slot — no late reminders
    const re = { reply_parameters: { message_id: j.reels.video_msg || j.reels.card, allow_sending_without_reply: true } };
    if (j.reels.state === 'done') {
      await say(`⏰ <b>Время публиковать</b> рилс по залёту @${esc(j.reels.origin.author || '?')} — видео выше.${j.code ? ` Кодовое слово: <b>${esc(j.code)}</b>.` : ''}`, re);
      if (j.caption) await say(esc(j.caption).slice(0, 3800));
      return;
    }
    const ru = { prep: 'сценарий ещё пишется', card: 'ещё не одобрен', avatar: 'аватар рендерится', montage: 'идёт монтаж', fail: 'сорвался' };
    await say(`⏰ Слот рилса по залёту @${esc(j.reels.origin.author || '?')} наступил, а он ${ru[j.reels.state] || j.reels.state}. ` +
      `${j.reels.state === 'card' ? '✅ — запущу, ⏰ Слот — перенести.' : 'Пришлю, как будет готов; ⏰ Слот — перенести.'}`, re);
  }

  // ---------- 4. buttons, replies, commands ----------
  async function onCallback(q) {
    const [, act, id, arg] = String(q.data || '').split(':');
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
    if (act === 'ed' || act === 'edit') {
      if (!['card', 'done'].includes(j.reels.state)) return answer('Сейчас в работе — править можно после готовности');
      answer('Напишите правку ответом на сообщение — текстом или голосом');
      return ask(j, 'ed');
    }
    if (act === 'mt') {
      if (j.reels.state !== 'card') return answer('Материалы — до ✅');
      answer('Пришлите материал ответом на сообщение');
      return ask(j, 'mt');
    }
    if (act === 'hk' || act === 'hm' || act === 'hook') {
      if (j.reels.state !== 'card' || S.busy(j, 'script')) return answer('Сценарий сейчас переписывается — подождите карточку');
      if (!S.ready.claude) return answer('Нет ANTHROPIC_API_KEY', true);
      answer(act === 'hm' ? 'Пишу ещё варианты…' : 'Подбираю хуки…');
      return hooks(j, act === 'hm').catch((e) => say(`⚠️ Хуки не написались: ${esc(e.message)}`));
    }
    if (act === 'hs') {
      const h = j.reels.hooks?.[Number(arg)];
      if (!h) return answer('Этого варианта уже нет — нажмите 🔄 Хук ещё раз');
      if (j.reels.state !== 'card' || S.busy(j, 'script')) return answer('Сценарий сейчас переписывается — подождите карточку');
      answer(`Хук ${Number(arg) + 1}: переписываю сценарий…`);
      j.reels.hooks = [];
      S.save(j);
      quiet(tg('editMessageReplyMarkup', { chat_id: st.chat_id, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } }));
      return S.rewrite(j, `Поставь первой фразой этот хук: «${h.text}» (механика: ${h.mechanic || '—'}). Остальной сценарий сохрани, подгони связку после хука.\n\nТекущий сценарий:\n${j.script.text || ''}`);
    }
    if (act === 'ot') {
      if (!['card', 'fail'].includes(j.reels.state)) return answer('Этот рилс уже в работе');
      if (!st.pool.length) return answer('Запас пуст — /scan найдёт новые залёты', true);
      j.reels.state = 'skip';
      j.reels.replaced = true;
      S.save(j);
      answer('Беру следующий залёт из запаса…');
      await card(j);
      const n = next();
      if (n) { n.reels.slot = j.reels.slot; S.save(n); }
      return say(`♻️ Беру другой залёт${n ? ` @${esc(n.reels.origin.author || '?')}` : ''} в тот же слот — карточка придёт, как будет готов сценарий.`);
    }
    if (act === 'sl') {
      const ch = freeSlots(j);
      if (!ch.length) return answer('Свободных слотов в ближайшие дни нет', true);
      answer();
      return say(`⏰ Рилс по залёту @${esc(j.reels.origin.author || '?')}: на какое время поставить публикацию?`, {
        reply_parameters: { message_id: j.reels.card, allow_sending_without_reply: true },
        reply_markup: { inline_keyboard: ch.map((t) => [{ text: fmtSlot(t, TZ), callback_data: `r:ss:${j.id}:${Math.round(t / 60e3)}` }]) } });
    }
    if (act === 'ss') {
      j.reels.slot = Number(arg) * 60e3;
      j.reels.slot_sent = false;
      S.save(j);
      answer(`Слот: ${fmtSlot(j.reels.slot, TZ)}`);
      quiet(tg('editMessageText', { chat_id: st.chat_id, message_id: q.message.message_id, text: `⏰ Публикация рилса — ${fmtSlot(j.reels.slot, TZ)}.` }));
      return card(j);
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
    `Ссылка на рилс сюда — сразу в работу.\n\nКнопки карточки — как в ветке Threads:\n✅ Одобрить — аватар, монтаж и видео сюда\n` +
    `✏️ Править — правка текстом или голосом: до ✅ — сценарий, под готовым видео — монтаж (со слова «сценарий» — новый текст и новый аватар)\n` +
    `🔄 Хук — другие хуки на выбор · ♻️ Другой — следующий залёт в тот же слот · 📎 Материалы — ваша история или цифры в сценарий\n` +
    `⏰ Слот — время публикации (в слот напомню) · 🎨 Стиль монтажа · 🗑 Пропустить\nОтвет на карточку или видео текстом — тоже правка.`;

  async function onMessage(msg) {
    const { text, cmd, forMe, forOther, topic } = parse(msg, me);
    if (forOther) return;  // /scan@other_bot — not ours
    const isOwner = owners().has(msg.from?.id);
    if (cmd === 'bind') {
      if (!isOwner && owners().size) return;
      const here = st.chat_id === msg.chat.id && st.topic_id === topic;
      const reply = (t) => tg('sendMessage', { chat_id: msg.chat.id, ...(topic ? { message_thread_id: topic } : {}), text: t, parse_mode: 'HTML' }).catch(() => {});
      // a plain /bind is for a bot without a topic; moving this one — /bind@me
      if (st.chat_id && !here && !forMe) return me && wrongBind({ data, self: 'reels', me, chat: msg.chat.id, topic, name: topicName(msg), reply });
      if (msg.chat.is_forum && !topic) return reply(`Привязать можно только ветку, не «Общий». Создайте ветку и напишите в ней /bind${me ? '@' + esc(me) : ''}.`);
      const other = takenBy(data, 'reels', msg.chat.id, topic);
      if (other) return forMe && reply(`Эта ветка уже за «${esc(BRANCHES[other])}». Для рилсов создайте свою ветку и напишите в ней /bind${me ? '@' + esc(me) : ''}.`);
      const lane = laneOf(topicName(msg));  // the topic's name says whose it is
      if (lane && lane.key !== 'reels') return reply(`Это ветка «${esc(topicName(msg))}» — она для другого. Я @${esc(me)}, бот рилсов: напишите /bind@${esc(me)} в ветке ${esc(BRANCHES['reels'])}.`);
      if (!owners().size) st.owners = [msg.from.id];
      st.chat_id = msg.chat.id;
      st.topic_id = topic;
      save();
      let renamed = '';
      if (st.topic_id && !lane) {  // the topic's name already fits — keep it
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
    // a reply to a card, the finished video or a ✏️/📎 question — a правка or a material, text or voice
    const reply = msg.reply_to_message?.message_id;
    const j = reply && S.list().find((x) => x.reels && [x.reels.card, x.reels.ask, x.reels.video_msg].includes(reply));
    const voice = msg.voice || msg.audio;
    if (j && !cmd && (text || voice)) {
      if (['skip', 'fail'].includes(j.reels.state)) return say('Эта карточка закрыта.');
      let said = text;
      if (voice) {
        try { said = await voiceToText({ tg, api: `${env('TELEGRAM_API_BASE', 'https://api.telegram.org')}/file/bot${TOKEN}`, file_id: voice.file_id }); }
        catch (e) { return say(`⚠️ Голос не распознан: ${esc(e.message)}`); }
        await say(`🎙 Распознал: «${esc(said.slice(0, 500))}»`, { reply_parameters: { message_id: msg.message_id, allow_sending_without_reply: true } });
      }
      const mode = reply === j.reels.ask ? j.reels.ask_mode : 'ed';
      return (mode === 'mt' ? materials : edit)(j, said.slice(0, 1500), msg.message_id);
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
    // the bound topic carries the branch's name (an old «Instagram контент» becomes «Instagram Reels»)
    if (st.chat_id && st.topic_id) await tg('editForumTopic', { chat_id: st.chat_id, message_thread_id: st.topic_id, name: TOPIC_NAME })
      .catch((e) => { if (!/NOT_MODIFIED/i.test(e.message)) console.error('reels topic name:', e.message); });
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

  setInterval(() => {  // ⏰ the publication slots
    for (const j of S.list()) if (j.reels?.slot && !j.reels.slot_sent && j.reels.state !== 'skip' && j.reels.slot <= Date.now()) remind(j).catch((e) => console.error('reels slot:', e.message));
  }, 60e3).unref();

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
