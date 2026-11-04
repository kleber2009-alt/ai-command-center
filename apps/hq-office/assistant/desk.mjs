/* Working desk of the office — the owner sets tasks for agents: /api/assistant/desk/*.

   The owner writes (or tells the assistant) what is needed. The dispatcher — Claude over the agent
   catalog of the site (who does what, skills, examples) — picks the agent and the skill, writes the
   brief, or asks one question when the result would be wrong without the answer. The runner on the
   server (apps/hq-office/runner, Claude Code with the team's skills, the same login as the bots)
   takes queued tasks, reports steps, uploads the result and either brings it for review or asks.
   The owner looks at the result in the office: «ок» publishes it to the task history, or a revision
   goes back to the same agent and session.

     owner:  PUT upload?name=  · POST tasks {text, agent, uploads} · POST tasks/<id>/{answer,revise} {text, uploads} · GET tasks · GET events (SSE)
             POST tasks/<id>/answer {text} · /approve {publish} · /revise {text} · /retry · /cancel
     runner: POST runner/hello · POST runner/claim · GET runner/<id>/input/<name>
             POST runner/<id>/step {text} · PUT runner/<id>/file?path= · POST runner/<id>/finish
     public: GET history.js | history.json (accepted and published tasks, in the format of tasks.js)
             GET files/<id>/v<n>/<path> — the owner always, everyone once published

   Statuses: routing → question | queued → work → review → done, plus cancelled and error.

   Style first: a task on video montage, reels or carousels does not go to the agent until the owner
   picks the style — after the dispatcher, the task stops with a question {from:'style', options}
   (the office shows the options as buttons; a free answer is taken as the style too).

   Reference chain: when the owner brings a link to a video (a competitor's reel, a YouTube clip) or a video
   file and the result is built on what is said in it, the dispatcher sets transcribe — the task first goes
   to the «Транскрибатор» (pending kind 'transcribe', the runner runs the transcribe-reference skill without
   Claude), its transcripts land in the task's in/ as in/transcript-<n>.md, and the task is handed on to the
   chosen agent (kind 'run'). A task for the transcriber himself is just the transcript, as a page.

   Routines: every morning (Moscow time) the desk sets the daily tasks itself, without the dispatcher —
   «Балансы и подписки» (agent billing, the runner checks the APIs by a script) and «Статистика соцсетей»
   (agent socialstats, Claude Code with the social-daily-stats skill). A balance check with nothing to warn
   about closes itself quietly; everything else comes for review and, with HQ_NOTIFY_TG_TOKEN + HQ_NOTIFY_TG_CHAT,
   to the owner's Telegram. HQ_ROUTINES=off switches them off; HQ_BILLING_AT / HQ_SOCIAL_AT — the time, HH:MM. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import Anthropic from '@anthropic-ai/sdk';
import { officeWindow, moscowDate } from './office.mjs';
import { metaNote } from './meta.mjs';

const FILE_LIMIT = 300e6;
const STEPS_KEPT = 80;
const KIND = { slides:'Презентация', document:'Документ', landing:'Сайт', script:'Сценарии', carousel:'Дизайн', video:'Видео', image:'Дизайн', research:'Исследование', other:'Разработка' };
const STATUS = { routing:'диспетчер разбирает', question:'нужен ваш ответ', queued:'в очереди', work:'в работе', review:'на проверке', done:'готово', cancelled:'отменена', error:'ошибка' };
const OPEN = ['routing', 'question', 'queued', 'work', 'review'];
const TRANSCRIBER = 'transcriber';
// «Контролёр качества»: проверяет первую сдачу результата до владельца и один раз возвращает агенту на доработку
const QA = 'qa';
const QA_ON = !/^(off|0|false)$/i.test(process.env.HQ_QA || '');
const LESSONS_KEEP = 24, LESSONS_SHOW = 10;
/* Pipelines: one task through several agents in a row. Each stage gets the previous stages' files in in/
   (in/etap<n>-<file>) and their reports; only the last stage's result comes to the owner (through the QA). */
const PIPELINES = {
  reel:{ label:'Рилс под ключ', about:'референс → сценарий → аватар HeyGen → монтаж → подпись', visual:'video', stages:[
    { agent:'scripts', title:'Сценарий', brief:'Напиши сценарий рилса для говорящей головы (до 60 секунд): хук в первые 2 секунды, кодовое слово, CTA. Если есть расшифровка референса — бери структуру и приёмы, текст пиши свой. Главный файл — out/scenariy.md (только текст для озвучки — отдельным блоком «Текст для аватара»), плюс out/index.html.' },
    { agent:'avatar', title:'Аватар HeyGen', brief:'Озвучь сценарий из in/etap1-* цифровым двойником Ильи в HeyGen (его аватар и клон голоса), вертикально 9:16. Сдай ролик out/avatar.mp4.' },
    { agent:'montage', title:'Монтаж', visual:true, brief:'Смонтируй готовый рилс 9:16 из ролика аватара (in/etap2-*.mp4) по сценарию (in/etap1-*): титры, графика, хук на первом кадре — в выбранном стиле. Сдай out/rils.mp4.' },
    { agent:'publish', title:'Подпись', brief:'Напиши подпись к рилсу (хук первой строкой, польза, кодовое слово, CTA, 3–5 хештегов) и обложку-заголовок. В out/ положи сам ролик (скопируй из in/etap3-*.mp4 как out/rils.mp4) и out/index.html с роликом и подписью — это главный файл.' },
  ] },
  'offer-landing':{ label:'Оффер → лендинг', about:'оффер → совет легенд → лендинг', stages:[
    { agent:'hormozi', title:'Оффер', brief:'Собери оффер по уравнению ценности: для кого, результат, сроки, усилия, бонусы, гарантия, цена и якорь. Главный файл out/offer.md, плюс out/index.html.' },
    { agent:'legends', title:'Совет легенд', brief:'Проведи оффер из in/etap1-* через совет легенд: оценка каждого, спорные места, общий вердикт и исправленная финальная версия оффера в out/offer-final.md.' },
    { agent:'landings', title:'Лендинг', brief:'Сделай продающий лендинг по финальному офферу из in/etap2-* (в стиле AICEX, адаптив под телефон, блок оплаты/заявки). Главный файл out/index.html.' },
  ] },
};
const ROUTINES = [
  { id:'billing-daily', agent:'billing', at:process.env.HQ_BILLING_AT || '08:50', skill:'service-balances', deliverable:'research', quiet:true,
    title:d => `Балансы и подписки на ${d}`, text:'Ежедневная проверка: балансы, лимиты и подписки сервисов офиса — что скоро кончится и что продлить, чтобы работа офиса не прекращалась.' },
  { id:'social-daily', agent:'socialstats', at:process.env.HQ_SOCIAL_AT || '09:10', skill:'social-daily-stats', deliverable:'research',
    title:(d, y) => `Статистика соцсетей за ${y}`, text:'Ежедневный отчёт за вчера по всем соцсетям: охваты, просмотры, вовлечения, прирост подписчиков, какой контент сработал лучше всего и какой нет, и что делать сегодня.' },
];
const PUBLIC_URL = (process.env.HQ_PUBLIC_URL || 'https://hq2.aicex.club').replace(/\/$/, '');
const ruDate = iso => iso.split('-').reverse().join('.');
// links to videos that the transcriber can download (yt-dlp; Instagram also through Apify)
const VIDEO_HOSTS = /(^|\.)(instagram\.com|youtube\.com|youtu\.be|tiktok\.com|vk\.com|vkvideo\.ru|rutube\.ru|dzen\.ru|facebook\.com|fb\.watch|x\.com|twitter\.com|threads\.net|t\.me|loom\.com|vimeo\.com)$/i;
const MEDIA_EXT = /\.(mp4|mov|webm|mkv|m4v|mp3|m4a|wav|ogg|oga|opus|aac|flac)$/i;
function videoLinks(text) {
  const out = [];
  for (const m of String(text || '').matchAll(/https?:\/\/[^\s<>"'«»)\]]+/g)) {
    const u = m[0].replace(/[.,;:!?]+$/, '');
    try { if (VIDEO_HOSTS.test(new URL(u).hostname) && !out.includes(u)) out.push(u); } catch {}
  }
  return out.slice(0, 5);
}
const MIME = { '.html':'text/html; charset=utf-8', '.htm':'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript', '.json':'application/json', '.md':'text/markdown; charset=utf-8',
  '.txt':'text/plain; charset=utf-8', '.pdf':'application/pdf', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.webp':'image/webp', '.gif':'image/gif', '.svg':'image/svg+xml',
  '.mp4':'video/mp4', '.webm':'video/webm', '.mov':'video/quicktime', '.mp3':'audio/mpeg', '.wav':'audio/wav', '.woff2':'font/woff2', '.ttf':'font/ttf', '.zip':'application/zip', '.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation' };

const ROUTER_PROMPT = `Ты — диспетчер живого офиса агентов AICEX (hq2.aicex.club). Владелец, Илья Палий, ставит задачу своими словами. Ты решаешь, кто из агентов офиса её сделает, каким скиллом, и пишешь агенту ТЗ. Агенты — Claude Code со скиллами команды на сервере: делают презентации, сайты, документы, сценарии, карусели, монтаж видео и т. п. и сдают готовые файлы.

Как решать:
- agent — один агент из каталога ниже, чья это работа. Если владелец сам выбрал агента, оставь его, если задача ему хоть как-то по силам.
- skill — имя скилла этого агента из каталога (например sprint-slides, montazh-rils-kobalt, karusel) или пустая строка, если подходящего нет.
- title — короткое название задачи для доски, до 70 знаков, по-русски.
- brief — ТЗ агенту: что сделать, для кого и зачем, что должно получиться (формат, объём, стиль бренда AICEX), из каких материалов. Подставь разумные значения по умолчанию вместо вопросов.
- deliverable — тип результата.
- why — одной фразой, почему этот агент.
- visual — video, если задача про монтаж, видео, рилс, шортс или ролик; carousel — если про карусель; иначе none.
- style_named — стиль, который владелец УЖЕ явно назвал в задаче или ответах («стекло», «бизнес-рилс», «светлая карусель», «как у Нейта»), иначе пустая строка. Не выбирай стиль за владельца — его спросят отдельно.
- transcribe — true, если в просьбе есть ссылка на ролик или видео/аудиофайл (референс конкурента, свой рилс, YouTube) и результат строится на том, что в нём говорят: сценарий «как у конкурента», карусель или пост по ролику, разбор, текст для аватара. Тогда сначала Транскрибатор (transcriber) расшифрует ролик и сам передаст текст выбранному агенту — в agent укажи агента, который сделает итоговую работу, а не транскрибатора. Если владельцу нужна только сама расшифровка — agent = transcriber, transcribe = false. Без ссылки на видео и без медиафайла — false.
- action = ask и question — только если без ответа результат точно выйдет не тем: нет видео для монтажа, неясно, о каком продукте или эфире речь, и т. п. Один конкретный вопрос. Иначе action = assign и question пустой.
- pipeline — конвейер из нескольких агентов подряд, только если владелец просит работу целиком, от начала до конца:
  reel — «рилс под ключ»: сценарий → аватар HeyGen → монтаж → подпись (готовый ролик аватаром, «сделай рилс целиком», по референсу или по теме);
  offer-landing — «оффер → совет легенд → лендинг» (упаковать продукт и сразу сделать продающую страницу).
  Если нужен только один шаг (только сценарий, только монтаж готового видео, только лендинг) — none. При конвейере в agent укажи агента первого этапа.
Пиши по-русски.`;

/* Styles the owner picks from before a montage / reels / carousel task goes to work. The montage styles are the
   Creator Pack skills of «Студия Кадрика» (.claude/skills/remake-top-reel/references/styles.md) plus the reels
   skills on the runner's server; the carousel styles are the ones of carousel-pro (config.json → styles). */
const STYLE_MENU = {
  video:[
    { label:'Стеклянная объяснялка', skill:'glass-explainer-reel', about:'крупные планы и панель снизу, сверху бизнес-графика на стеклянных карточках, уведомления, счётчики' },
    { label:'Панель-объяснялка', skill:'explainer-panel-reel', about:'та же панель, графика чище: заголовки, нумерованные пункты, схемы — для пошаговых роликов' },
    { label:'Бизнес-рилс', skill:'business-short-form-reels', about:'текстовый хук, ротация «ты на весь экран / сплит / анимация», стеклянные плашки, окна Docs и Notion' },
    { label:'Как у Nate Herk', skill:'reels-herk', about:'сплит, тёмные боксовые титры, логотипы-плитки, 3D-скрины, терминал-карточки' },
    { label:'Промо-история с лицом', skill:'reels-promo-face', about:'кинетический хук, поиск с шайбой, светлый iOS-интерфейс, 3D-эмодзи, кодовое слово' },
  ],
  carousel:[
    { label:'Тёмный @ilia.paliy', skill:'carousel-pro', about:'основной формат: чёрный фон, тёплое свечение, Jost, оранжевый курсив, капсулы' },
    { label:'Светлый @ilia.paliy', skill:'carousel-pro', about:'тёмный текст на светлом фоне, белые карточки, капс-обложка' },
    { label:'Обложка с вашим фото', skill:'carousel-pro', about:'обложка на вашем фото (или образ двойника HeyGen), дальше — тёмный формат' },
  ],
};
const STYLE_ANY = { label:'Выбери сам', skill:'', about:'агент выберет стиль под сценарий' };
// skills that run the whole job and take the montage style as a parameter — the chosen style does not replace them
const ORCHESTRATORS = new Set(['remake-top-reel', 'carousel-pro', 'ilia-carousel-style']);
const STYLE_SKILL_RE = { video:/reel|rils|montazh|montage|монтаж|рилс/i, carousel:/carousel|karusel|карусел/i };

const RULES = `Как работать:
- Сначала проверь, твоя ли это задача и хватает ли материалов. Если задача не по твоему профилю или без ответа владельца результат выйдет не тем — ничего не делай, коротко объясни почему и последней строкой ответа напиши: NEED: <один конкретный вопрос владельцу>.
- Работаешь без окна: ничего не спрашивай по ходу и не жди подтверждений — делай результат целиком, в стиле бренда AICEX, по-русски.
- Память сервера общая с ботами и сайтами, исполнителю дано до 4.5 ГБ. Тяжёлое (рендер видео, Remotion, ffmpeg, браузер) запускай строго по одному: несколько роликов — один за другим, не параллельно; Remotion — с --concurrency=1. Если процесс убит (код 137, Killed) — не хватило памяти: не повторяй то же самое, уменьши нагрузку (по одному ролику, меньше потоков) или сдай то, что уже готово.
- Всё, что сдаёшь, положи в папку out/ — только готовые файлы, без черновиков и исходников. Главный файл для просмотра: для презентации, сайта, документа или текста — out/index.html (одна страница, открывается в браузере, картинки и стили рядом в out/); для видео — out/<имя>.mp4; для картинок — out/<имя>.jpg или .png. Если по скиллу получается PDF или PPTX — положи их в out/ рядом с index.html. Страница out/index.html — чистовик для владельца в стиле AICEX: заголовок, короткое вступление, разделы с подзаголовками, крупный читаемый текст, картинки и видео встроены; не список файлов и не черновые заметки. Файлы называй по-русски понятно или латиницей по смыслу (scenariy-rilsa.md, karusel-01.png), без tmp/final2.
- В конце — отчёт владельцу в markdown, по-русски, без воды и без технических подробностей, ровно с такими разделами:
  ## Что сделано
  2–4 предложения: что получилось и для чего.
  ## Главное
  3–7 пунктов: ключевые решения и содержание (хук, структура, тексты, цифры, стиль), то, что владельцу важно знать без открытия файлов. Таблица — если сравниваешь варианты.
  ## Материалы
  Каждый файл из out/ отдельной строкой: - out/<путь> — что это и зачем (главный файл первым).
  ## Что дальше
  1–3 пункта: что проверить или какой следующий шаг (если нечего — раздел не пиши).
  Предпоследней строкой: SUMMARY: <одно предложение для истории офиса — что получилось и зачем, без имён файлов>. Последней строкой: RESULT: out/<главный файл>.`;

export function createDesk({ claude, model, fallback, dataDir, officeDir, runnerToken }) {
  const DIR = path.join(dataDir, 'desk');
  fs.mkdirSync(path.join(DIR, 'uploads'), { recursive:true });
  const STORE = path.join(DIR, 'tasks.json');
  let tasks = [];
  try { tasks = JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch {}
  const clients = new Set();
  const RUNNER_FILE = path.join(DIR, 'runner.json');
  let runner = { seenAt:0, version:'', claude:null, mcp:[] };
  // what the runner reported on start (its systems): kept across restarts of this server, which happen on every deploy
  try { runner = { ...runner, ...JSON.parse(fs.readFileSync(RUNNER_FILE, 'utf8')), seenAt:0 }; } catch {}

  const save = () => { fs.writeFileSync(STORE + '.tmp', JSON.stringify(tasks)); fs.renameSync(STORE + '.tmp', STORE); };
  const now = () => new Date().toISOString();
  const byId = id => tasks.find(t => t.id === id);
  const taskDir = id => path.join(DIR, 'tasks', id);

  /* ---------- the catalog: agents of the office, their skills and example tasks ---------- */

  // the catalog is rebuilt only when the office files or the runner's systems change (views ask it for every task)
  let catMemo = { W:null, key:'', v:null };
  function catalog() {
    const W = officeWindow(officeDir) || {}, key = JSON.stringify(runner.mcp || []) + serverSkills.length;
    if (catMemo.W === W && catMemo.key === key) return catMemo.v;
    catMemo = { W, key, v:buildCatalog(W) };
    return catMemo.v;
  }
  function buildCatalog(W) {
    const CFG = W.OFFICE_CONFIG || { depts:[] }, CAT = W.AGENT_CATALOG || {}, AC = W.AGENT_CONTENT || {};
    const WS = W.OFFICE_WORKS?.skills || {}, EXTRA = W.OFFICE_SKILLS_LIBRARY?.extra || [];
    const agents = [], lines = ['# Агенты офиса (id в скобках)'];
    // the meeting room of legends: the whole council first, then each advisor (office.config.js → council)
    const groups = [...CFG.depts, ...(CFG.council?.agents?.length ? [{ ...CFG.council, agents:[CFG.council.board, ...CFG.council.agents].filter(Boolean),
      name:`${CFG.council.name} — ИИ-советники по методам легенд бизнеса: сюда задачи «на собеседование» (оценить оффер, воронку, запуск, тексты, продажи, план) и «на исправление деталей» по их методу; «Совет легенд» — когда нужен взгляд всех восьми` }] : [])];
    for (const d of groups) {
      lines.push('', `## ${d.name}`);
      for (const id of d.agents) {
        const c = AC[id] || {}, seen = new Set();
        const skills = [...(c.skills || []), ...(WS[id] || []), ...EXTRA.filter(s => (s.agents || []).includes(id))]
          .filter(s => s?.name && !seen.has(s.name) && seen.add(s.name));
        const a = { id, name:CAT[id]?.name || id, role:CAT[id]?.role || '', dept:d.id, deptName:d.name, lead:c.lead || '' };
        agents.push(a);
        lines.push(`- ${a.name} (${id}): ${a.role}. ${a.lead}`,
          skills.length ? `  Скиллы: ${skills.map(s => `${s.name} — ${s.title}`).join('; ')}` : '  Скиллы: нет',
          ...[(c.results || []).filter(r => r.type === 'links' && /^Продукт/.test(r.title)).flatMap(r => r.items)].filter(x => x.length)
            .map(items => `  Продукты и боты: ${items.map(x => `${x.title}${x.url ? ' (' + x.url + ')' : ''}`).join('; ')}`),
          ...(c.templates || []).slice(0, 2).map(x => `  Пример задачи: «${x.prompt}»`));
      }
    }
    const sys = (runner.mcp || []).filter(s => s.read || s.write);
    lines.push('', '# Подключённые системы исполнителя', sys.length
      ? sys.map(s => `- ${s.name}: чтение данных — сразу (${s.read}), действия (${s.write}) — только после разрешения владельца`).join('\n')
      : 'Нет: агенты не могут сами действовать в ChatPlace, рекламном кабинете и т. п. — готовят тексты, планы и файлы.');
    return { agents, text:lines.join('\n') };
  }
  // Claude Code itself: the runner with every skill of the team, for tasks the twin sends directly (no dispatcher)
  const CC = { id:'claude-code', name:'Claude Code', role:'универсальный исполнитель: все скиллы команды, код, файлы, интернет', dept:'ceo', deptName:'Штаб', lead:'' };
  const agentOf = id => id === CC.id ? CC : catalog().agents.find(a => a.id === id);

  /* ---------- skills installed on the runner's server (it reports them on start) ---------- */
  const SKILLS_FILE = path.join(DIR, 'skills.json');
  let serverSkills = [];
  try { serverSkills = JSON.parse(fs.readFileSync(SKILLS_FILE, 'utf8')); } catch {}

  /* ---------- views and events ---------- */

  const fileUrl = (t, p) => `/api/assistant/desk/files/${t.id}/v${t.result.version}/${p.split('/').map(encodeURIComponent).join('/')}`;
  // the transcriber holds the task while its transcription stage is queued or in work
  const onStage = t => t.pending?.kind === 'transcribe' && ['queued', 'work'].includes(t.status);
  const onQA = t => t.pending?.kind === 'qa' && ['queued', 'work'].includes(t.status);
  function view(t) {
    const a = t.route ? agentOf(onStage(t) ? TRANSCRIBER : onQA(t) ? QA : t.route.agent) : t.agent ? agentOf(t.agent) : null;
    const pl = t.pipeline;
    const tr = agentOf(TRANSCRIBER), to = t.route ? agentOf(t.route.agent) : null;
    const waiting = tasks.filter(x => x.status === 'queued').sort((x, y) => x.queuedAt.localeCompare(y.queuedAt));
    return {
      id:t.id, created:t.created, updated:t.updated, text:t.text, files:t.files.map(f => f.name), askedAgent:t.agent || '',
      status:t.status, statusText:STATUS[t.status] || t.status, routine:t.routine || '', source:t.source || '', alerts:t.alerts || null, queuePos:t.status === 'queued' ? waiting.indexOf(t) + 1 : 0,
      agent:a ? { id:a.id, name:a.name, dept:a.dept } : null, route:t.route || null,
      chain:t.chain && tr && to && to.id !== TRANSCRIBER ? { from:{ id:tr.id, name:tr.name }, to:{ id:to.id, name:to.name }, sources:t.chain.sources, done:Boolean(t.transcribed), note:t.transcribed?.summary || '' } : null, question:t.question || null, style:t.style?.label || '', answers:t.answers,
      steps:t.steps.slice(-40), error:t.error || '', log:t.status === 'error' ? t.log || '' : '', published:Boolean(t.published), versions:t.versions || 0,
      result:t.result ? { version:t.result.version, summary:t.result.summary, note:t.result.note || '', main:t.result.main, mainUrl:t.result.main ? fileUrl(t, t.result.main) : '',
        files:t.result.files.map(f => ({ path:f.path, size:f.size, url:fileUrl(t, f.path) })) } : null,
      usage:t.usage || null, runs:(t.runs || []).slice(-20).map(r => ({ ...r, name:agentOf(r.agent)?.name || r.agent })),
      qa:t.qa ? { verdict:t.qa.verdict || '', notes:t.qa.notes || '', status:t.qa.status || '' } : qaPlanned(t) ? { status:'planned' } : null,
      pipeline:pl ? { id:pl.id, label:pl.label, idx:pl.idx, stages:pl.stages.map(s => ({ agent:s.agent, name:agentOf(s.agent)?.name || s.agent, title:s.title, status:s.status,
        summary:s.summary || '', files:s.files || [] })) } : null,
      approval:t.approval ? { actions:t.approval.actions, status:t.approval.status } : null, rating:t.rating || null, lessons:t.lessonsUsed || 0,
    };
  }
  function emit(t) {
    t.updated = now(); save();
    const line = `data: ${JSON.stringify({ t:'task', task:view(t) })}\n\n`;
    for (const res of clients) res.write(line);
  }
  function step(t, text) {
    t.steps.push({ at:now(), text:String(text).slice(0, 300) });
    if (t.steps.length > STEPS_KEPT) t.steps.splice(0, t.steps.length - STEPS_KEPT);
  }
  const runnerView = () => ({ online:Date.now() - runner.seenAt < 90e3, seenAt:runner.seenAt ? new Date(runner.seenAt).toISOString() : '', claude:runner.claude, mcp:runner.mcp || [] });

  /* ---------- cost and time: every run of the runner reports its usage ---------- */

  function addRun(t, agent, kind, u) {
    if (!u || typeof u !== 'object') return;
    const r = { at:now(), agent, kind:String(kind || 'run'), cost:Math.max(0, Number(u.cost) || 0), ms:Math.max(0, Math.round(Number(u.ms) || 0)),
      turns:Math.max(0, Math.round(Number(u.turns) || 0)), tin:Math.max(0, Math.round(Number(u.tin) || 0)), tout:Math.max(0, Math.round(Number(u.tout) || 0)) };
    (t.runs ||= []).push(r);
    if (t.runs.length > 60) t.runs.splice(0, t.runs.length - 60);
    const s = t.usage ||= { cost:0, ms:0, turns:0, runs:0 };
    s.cost = Math.round((s.cost + r.cost) * 1e4) / 1e4; s.ms += r.ms; s.turns += r.turns; s.runs += 1;
  }
  // totals of a month (Moscow date of each run) by agent: for the office panel and the assistant
  function stats(month = moscowDate().slice(0, 7)) {
    const by = new Map(), months = new Set(), total = { cost:0, ms:0, runs:0, tasks:0, done:0 };
    for (const t of tasks) {
      let touched = false;
      for (const r of t.runs || []) {
        const m = moscowDate(new Date(r.at)).slice(0, 7); months.add(m);
        if (m !== month) continue;
        touched = true;
        const a = by.get(r.agent) || { id:r.agent, name:agentOf(r.agent)?.name || r.agent, cost:0, ms:0, runs:0, tasks:new Set() };
        a.cost += r.cost; a.ms += r.ms; a.runs += 1; a.tasks.add(t.id); by.set(r.agent, a);
        total.cost += r.cost; total.ms += r.ms; total.runs += 1;
      }
      if (touched) { total.tasks += 1; if (t.status === 'done') total.done += 1; }
    }
    const L = lessonsAll();
    return { month, months:[...months].sort().reverse(), total:{ ...total, cost:Math.round(total.cost * 100) / 100 },
      agents:[...by.values()].map(a => ({ ...a, cost:Math.round(a.cost * 100) / 100, tasks:a.tasks.size, lessons:(L[a.id]?.rules.length || 0) + (L[a.id]?.items.length || 0) }))
        .sort((x, y) => y.cost - x.cost || y.ms - x.ms) };
  }

  /* ---------- lessons: what the owner corrected and how he rated, per agent — goes into its next tasks ---------- */

  const LDIR = path.join(DIR, 'lessons');
  fs.mkdirSync(LDIR, { recursive:true });
  const lfile = id => path.join(LDIR, String(id).replace(/[^\w-]/g, '_') + '.json');
  const lessonsOf = id => { try { const j = JSON.parse(fs.readFileSync(lfile(id), 'utf8')); return { rules:j.rules || [], items:j.items || [] }; } catch { return { rules:[], items:[] }; } };
  function lessonsAll() {
    const out = {};
    for (const f of fs.readdirSync(LDIR)) if (f.endsWith('.json')) out[f.slice(0, -5)] = lessonsOf(f.slice(0, -5));
    return out;
  }
  const compacting = new Set();
  function learn(agent, kind, title, text) {
    text = String(text || '').trim();
    if (!agent || !text || agent === TRANSCRIBER || agent === QA) return;
    const L = lessonsOf(agent);
    L.items.push({ at:now(), kind, task:String(title || '').slice(0, 90), text:text.slice(0, 600) });
    fs.writeFileSync(lfile(agent), JSON.stringify(L));
    if (L.items.length > LESSONS_KEEP) compactLessons(agent);
  }
  // many raw lessons → up to 12 short rules (Claude), the raw ones are folded in; without Claude — only the latest are kept
  async function compactLessons(agent) {
    if (compacting.has(agent)) return;
    compacting.add(agent);
    const L = lessonsOf(agent), take = L.items.slice(0, -6);
    try {
      if (!claude) throw new Error('no claude');
      const msg = await claude.messages.create({ model, max_tokens:2000,
        system:'Ты ведёшь «уроки» ИИ-агента офиса: что владелец (Илья Палий) правил в его работах и как оценивал. Объедини текущие правила и новые записи в не больше чем 12 коротких правил на будущее — конкретно, по-русски, по одному в строке, начиная с «- ». Положительные оценки — что повторять. Не добавляй ничего, чего нет в записях. Выведи только правила.',
        messages:[{ role:'user', content:`Агент: ${agentOf(agent)?.name || agent}\n\nТекущие правила:\n${L.rules.map(r => '- ' + r).join('\n') || 'нет'}\n\nНовые записи:\n${take.map(x => `- [${x.kind === 'revise' ? 'правка' : x.kind === 'down' ? 'не понравилось' : 'понравилось'}] «${x.task}»: ${x.text}`).join('\n')}` }] });
      const rules = msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n').split('\n').map(x => x.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean).slice(0, 12);
      if (!rules.length) throw new Error('empty');
      const cur = lessonsOf(agent);
      fs.writeFileSync(lfile(agent), JSON.stringify({ rules, items:cur.items.slice(take.length) }));
    } catch (e) {
      if (e.message !== 'no claude') console.error('desk lessons:', e.message);
      const cur = lessonsOf(agent);
      fs.writeFileSync(lfile(agent), JSON.stringify({ rules:cur.rules, items:cur.items.slice(-LESSONS_KEEP) }));
    } finally { compacting.delete(agent); }
  }
  function lessonsNote(agent) {
    const L = lessonsOf(agent), items = L.items.slice(-LESSONS_SHOW);
    if (!L.rules.length && !items.length) return { text:'', n:0 };
    const kind = { revise:'правка', down:'не понравилось', up:'понравилось' };
    return { n:L.rules.length + items.length, text:['Уроки из прошлых задач этого агента — что владелец правил и как оценивал. Учитывай их с самого начала, чтобы не повторять тех же правок:',
      ...L.rules.map(r => '- ' + r), ...items.map(x => `- [${kind[x.kind] || x.kind}] «${x.task}»: ${x.text}`)].join('\n') };
  }

  /* ---------- quality control and pipelines ---------- */

  const qaPlanned = t => QA_ON && Boolean(agentOf(QA)) && !t.qa && !t.routine && t.route && ![TRANSCRIBER, QA, 'billing'].includes(t.route.agent)
    && ['routing', 'question', 'queued', 'work'].includes(t.status) && t.pending?.kind !== 'revise';
  // the first delivery of a task goes to the controller; its rework and the owner's revisions do not
  const needsQA = t => qaPlanned(t) && ['run', 'answer', 'execute'].includes(t.pending?.kind) && (!t.pipeline || t.pipeline.idx === t.pipeline.stages.length - 1);
  const curStage = t => t.pipeline ? t.pipeline.stages[t.pipeline.idx] : null;
  function setPipeline(t, id) {
    const P = PIPELINES[id];
    if (!P) return false;
    const stages = P.stages.filter(s => agentOf(s.agent)).map(s => ({ agent:s.agent, title:s.title, brief:s.brief, visual:Boolean(s.visual), status:'wait' }));
    if (stages.length < 2) return false;
    stages[0].status = 'now';
    t.pipeline = { id, label:P.label, about:P.about, idx:0, stages };
    t.route.agent = stages[0].agent; t.route.skill = '';
    if (P.visual) t.route.visual = P.visual;
    return true;
  }
  // a stage is done: its files go to in/ as etap<n>-<name>, and the next agent starts in a new session
  function nextStage(t, b) {
    const pl = t.pipeline, st = pl.stages[pl.idx], n = pl.idx + 1;
    const root = path.join(taskDir(t.id), 'v' + t.workVersion), inDir = path.join(taskDir(t.id), 'in'), names = [];
    fs.mkdirSync(inDir, { recursive:true });
    const walk = (d, pre) => { for (const e of fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes:true }) : []) {
      const rel = pre ? pre + '/' + e.name : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), rel);
      else { const name = safeName(`etap${n}-${rel.replace(/\//g, '-')}`); fs.renameSync(path.join(d, e.name), path.join(inDir, name)); names.push(name); if (!t.files.some(f => f.name === name)) t.files.push({ name, size:fs.statSync(path.join(inDir, name)).size }); }
    } };
    walk(root, '');
    fs.rmSync(root, { recursive:true, force:true });
    Object.assign(st, { status:'done', summary:String(b.summary || '').slice(0, 4000), history:String(b.history || '').slice(0, 400), files:names, main:b.main ? `etap${n}-${safeRel(b.main).replace(/\//g, '-')}` : '' });
    pl.idx = n;
    const next = pl.stages[n];
    next.status = 'now';
    t.route.agent = next.agent;
    t.route.skill = next.visual && t.style?.skill ? t.style.skill : '';
    t.session = '';
    queue(t, { kind:'run' });
    step(t, `«${agentOf(st.agent)?.name}» закончил этап «${st.title}» (${names.length} ${names.length === 1 ? 'файл' : 'файлов'}) и передал работу агенту «${agentOf(next.agent)?.name}» — этап «${next.title}».`);
  }
  function pipelineNote(t) {
    const pl = t.pipeline;
    if (!pl) return [];
    const st = pl.stages[pl.idx], prev = pl.stages.slice(0, pl.idx), next = pl.stages[pl.idx + 1];
    return [`Это конвейер «${pl.label}» (${pl.stages.map((s, i) => `${i + 1}. ${s.title} — ${agentOf(s.agent)?.name}${i < pl.idx ? ' ✓' : i === pl.idx ? ' ← ты' : ''}`).join('; ')}).`,
      `Твой этап ${pl.idx + 1} из ${pl.stages.length} — «${st.title}»: ${st.brief}`,
      ...prev.map((s, i) => `Этап ${i + 1} «${s.title}» сдал «${agentOf(s.agent)?.name}»: файлы ${s.files.map(f => 'in/' + f).join(', ') || 'нет'}${s.main ? ` (главный — in/${s.main})` : ''}. Его отчёт: ${s.summary.replace(/\s+/g, ' ').slice(0, 1200)}`),
      next ? `Делай только свой этап. Следующим работу возьмёт «${agentOf(next.agent)?.name}» (этап «${next.title}») — сдай в out/ всё, что ему нужно, чтобы продолжить без вопросов.`
        : 'Это последний этап — твой результат увидит владелец: собери итог всей цепочки.'];
  }
  function qaPrompt(t) {
    const a = agentOf(t.route.agent), r = t.result, les = lessonsNote(t.route.agent);
    return [`Ты — «Контролёр качества» живого офиса AICEX. Агент «${a?.name}» (${a?.role || ''}) сдал результат задачи. Прежде чем его увидит владелец, Илья Палий, ты проверяешь работу. Файлы не меняй — только читай и проверяй (видео — ffprobe: длительность, размер кадра; страницы — читай HTML).`,
      '', `Задача: ${t.route.title}`, `Слова владельца: «${t.text}»`, t.route.brief ? `ТЗ от диспетчера: ${t.route.brief}` : '',
      ...t.answers.map(x => `Уточнение. Вопрос: ${x.q} Ответ: ${x.a}`),
      t.style ? `Стиль, который выбрал владелец: «${t.style.label}».` : '',
      t.pipeline ? `Это итог конвейера «${t.pipeline.label}»: ${t.pipeline.stages.map(s => s.title).join(' → ')}.` : '',
      `Результат лежит в out/ (главный файл — out/${r?.main || 'index.html'}), файлы: ${(r?.files || []).map(f => 'out/' + f.path).slice(0, 40).join(', ')}.`,
      '', 'Отчёт агента:', '<<<', String(r?.summary || '').slice(0, 6000), '>>>', les.text ? '\n' + les.text : '',
      '', `Проверь:
1. Сделано ли то, что просил владелец, целиком — без подмены задачи и без пропущенных частей ТЗ.
2. Главный файл открывается и это чистовик: страница оформлена, видео нужного формата и не пустое, все файлы из раздела «Материалы» существуют.
3. По-русски, в стиле бренда AICEX, без заглушек (lorem, TODO, [вставить], XXX), без выдуманных фактов и цифр о владельце и его продуктах.
4. Отчёт по формату: Что сделано / Главное / Материалы / Что дальше.
5. Уроки агента (если есть выше) соблюдены.
Будь практичен: вкусовые мелочи — не повод возвращать. Возвращай, только если владелец точно попросил бы правку.

Ответ коротко по-русски: что проверил и что нашёл. Если правки нужны — нумерованный список конкретных правок (что и где исправить). Последней строкой: QA: ok — можно показывать владельцу, или QA: fix — нужна доработка.`].filter((x, i, arr) => x || arr[i - 1]).join('\n');
  }
  function mcpNote() {
    const sys = (runner.mcp || []).filter(s => s.read || s.write);
    if (!sys.length) return '';
    return `Подключённые системы: ${sys.map(s => s.name).join(', ')} — их инструменты у тебя есть (mcp__…). Читать данные можешь сразу. Всё, что меняет данные или что-то отправляет людям (рассылка, ответ клиенту, публикация, запуск/остановка рекламы, бюджет, теги, автоматизации), без разрешения владельца НЕ выполняй — такие инструменты сейчас заблокированы. Подготовь всё до последнего шага, опиши в отчёте и для каждого действия напиши отдельную строку APPROVE: <что именно сделаешь, где и с какими параметрами — аудитория, текст, сумма>. После «Выполнить» владельца ты продолжишь эту же сессию и выполнишь их.`;
  }
  // keeps the stream open through proxies and tells the office whether the runner is alive
  setInterval(() => { const line = `data: ${JSON.stringify({ t:'runner', runner:runnerView() })}\n\n`; for (const res of clients) res.write(line); }, 25e3).unref();
  // uploads of a form that was never sent
  const sweep = () => {
    const root = path.join(DIR, 'uploads');
    for (const d of fs.readdirSync(root)) try { if (Date.now() - fs.statSync(path.join(root, d)).mtimeMs > 864e5) fs.rmSync(path.join(root, d), { recursive:true, force:true }); } catch {}
  };
  sweep(); setInterval(sweep, 3600e3).unref();

  /* ---------- the dispatcher ---------- */

  async function route(t) {
    if (!claude) { t.status = 'error'; t.error = 'Диспетчер не подключён к Claude (нет ключа).'; return emit(t); }
    const cat = catalog(), ids = cat.agents.map(a => a.id);
    const asked = t.agent && ids.includes(t.agent) ? agentOf(t.agent) : null;
    const links = videoLinks([t.text, ...t.answers.map(x => x.a)].join(' ')), media = t.files.filter(f => MEDIA_EXT.test(f.name));
    const request = [`Просьба владельца: «${t.text}»`,
      links.length ? `Ссылки на видео в просьбе: ${links.join(', ')}.` : 'Ссылок на видео в просьбе нет.',
      asked ? `Владелец сам выбрал агента: ${asked.name} (${asked.id}).` : 'Агента владелец не выбирал — выбери сам.',
      PIPELINES[t.pipelinePick] ? `Владелец сам выбрал конвейер: ${t.pipelinePick} («${PIPELINES[t.pipelinePick].label}»).` : '',
      `Материалы от владельца: ${t.files.length ? t.files.map(f => f.name).join(', ') : 'нет'}.`,
      ...t.answers.map(x => `Уточнение. Вопрос: ${x.q} Ответ владельца: ${x.a}`)].filter(Boolean).join('\n');
    const schema = { type:'object', additionalProperties:false, required:['action', 'agent', 'skill', 'title', 'brief', 'deliverable', 'why', 'question', 'visual', 'style_named', 'transcribe', 'pipeline'], properties:{
      pipeline:{ type:'string', enum:['none', ...Object.keys(PIPELINES)] },
      visual:{ type:'string', enum:['video', 'carousel', 'none'] }, style_named:{ type:'string' }, transcribe:{ type:'boolean' },
      action:{ type:'string', enum:['assign', 'ask'] }, agent:{ type:'string', enum:ids }, skill:{ type:'string' }, title:{ type:'string' }, brief:{ type:'string' },
      deliverable:{ type:'string', enum:Object.keys(KIND) }, why:{ type:'string' }, question:{ type:'string' } } };
    try {
      const msg = await claude.beta.messages.create({
        model, max_tokens:16000, ...fallback, output_config:{ effort:'low', format:{ type:'json_schema', schema } },
        system:[{ type:'text', text:ROUTER_PROMPT }, { type:'text', text:cat.text, cache_control:{ type:'ephemeral' } }],
        messages:[{ role:'user', content:request }],
      });
      if (msg.stop_reason !== 'end_turn') throw new Error('stop_reason ' + msg.stop_reason);
      const r = JSON.parse(msg.content.filter(b => b.type === 'text').map(b => b.text).join(''));
      if (!ids.includes(r.agent)) throw new Error('unknown agent ' + r.agent);
      let a = agentOf(r.agent);
      t.route = { agent:a.id, skill:String(r.skill || '').trim(), title:String(r.title || t.text).slice(0, 90), brief:String(r.brief || ''), deliverable:KIND[r.deliverable] ? r.deliverable : 'other', why:String(r.why || ''),
        visual:visualOf(r), style:t.style || null, transcribe:Boolean(r.transcribe) };
      // a pipeline: the owner's pick wins, else the dispatcher's
      const pid = PIPELINES[t.pipelinePick] ? t.pipelinePick : !asked && PIPELINES[r.pipeline] ? r.pipeline : '';
      if (pid && !t.pipeline) setPipeline(t, pid);
      else if (t.pipeline) { t.route.agent = curStage(t).agent; t.route.skill = ''; t.route.visual = PIPELINES[t.pipeline.id]?.visual || t.route.visual; }
      a = agentOf(t.route.agent);
      const named = String(r.style_named || '').trim();
      if (t.route.visual && !t.style && named) t.style = pickStyle(t.route.visual, named) || { label:named.slice(0, 120), skill:'', about:'' };
      if (t.style) applyStyle(t);
      if (r.action === 'ask' && String(r.question || '').trim()) {
        t.status = 'question'; t.question = { from:'dispatcher', text:r.question.trim() };
        step(t, `Диспетчер: задачу возьмёт «${a.name}», но сначала нужен ответ — ${r.question.trim()}`);
      } else if (t.route.visual && !t.style) {
        // montage, reels and carousels: the owner picks the style before the agent starts
        const options = styleOptions(t.route.visual);
        t.status = 'question';
        t.question = { from:'style', text:t.route.visual === 'carousel' ? 'В каком стиле сделать карусель?' : 'В каком стиле смонтировать ролик?', options };
        step(t, `Диспетчер: задачу возьмёт «${a.name}». Сначала выберите стиль — ${options.map(o => o.label).join(', ')}.`);
      } else if (a.id === TRANSCRIBER && !links.length && !media.length) {
        t.status = 'question'; t.question = { from:'dispatcher', text:'Пришлите ссылку на ролик или само видео — что расшифровать?' };
        step(t, `Диспетчер: задачу возьмёт «${a.name}», но нужна ссылка на ролик или видеофайл.`);
      } else startWork(t, t.pipeline ? `Диспетчер запустил конвейер «${t.pipeline.label}»: ${t.pipeline.stages.map(s => `${s.title} — «${agentOf(s.agent)?.name}»`).join(' → ')}${t.style ? ` · стиль «${t.style.label}»` : ''}. ${t.route.why}`
        : `Диспетчер передал задачу агенту «${a.name}»${t.route.skill ? ` · скилл ${t.route.skill}` : ''}${t.style ? ` · стиль «${t.style.label}»` : ''}. ${t.route.why}`);
    } catch (e) {
      console.error('desk route:', e.message);
      t.status = 'error';
      t.error = e instanceof Anthropic.APIError ? `Диспетчер: Claude ответил ошибкой${e.status ? ' ' + e.status : ''} — поставьте задачу ещё раз.` : 'Диспетчер не смог разобрать задачу — поставьте её ещё раз.';
    }
    emit(t);
  }
  // the task goes to work: through the transcriber first when it carries a video the result is built on
  function startWork(t, how) {
    const a = agentOf(t.route.agent), tr = agentOf(TRANSCRIBER);
    const links = videoLinks([t.text, ...t.answers.map(x => x.a)].join(' ')), media = t.files.filter(f => MEDIA_EXT.test(f.name));
    if (a.id === TRANSCRIBER) t.chain = { sources:links, media:media.map(f => f.name) };
    if (a.id !== TRANSCRIBER && t.route.transcribe && (links.length || media.length) && !t.transcribed && tr) {
      t.chain = { sources:links, media:media.map(f => f.name) };
      queue(t, { kind:'transcribe' });
      step(t, `${how} Сначала «${tr.name}» расшифрует ${links.length + media.length > 1 ? 'ролики' : 'ролик'} и сам передаст текст агенту «${a.name}».`);
    } else {
      queue(t, { kind:'run' });
      step(t, how);
    }
  }
  /* ---------- the style question ---------- */

  const visualOf = r => r.visual === 'video' || r.visual === 'carousel' ? r.visual
    : r.deliverable === 'video' ? 'video' : r.deliverable === 'carousel' && STYLE_SKILL_RE.carousel.test(String(r.skill || '') + ' ' + String(r.title || '')) ? 'carousel' : '';
  function styleOptions(visual) {
    const list = [...STYLE_MENU[visual]], have = new Set(list.map(o => o.skill));
    // the rest of the montage / carousel skills installed on the runner's server
    for (const x of serverSkills) {
      if (list.length >= 8) break;
      if (have.has(x.name) || ORCHESTRATORS.has(x.name) || !STYLE_SKILL_RE[visual].test(x.name + ' ' + x.description.slice(0, 120))) continue;
      if (visual === 'video' && /long|dlinn|youtube/i.test(x.name)) continue;
      have.add(x.name);
      list.push({ label:x.name, skill:x.name, about:x.description.replace(/\s+/g, ' ').slice(0, 140) });
    }
    return [...list, STYLE_ANY].map((o, i) => ({ id:String(i + 1), ...o }));
  }
  // the owner's answer: a button (its label), its number, or own words
  function pickStyle(visual, text) {
    const s = String(text).trim().toLowerCase().replace(/[«»"]/g, ''), opts = styleOptions(visual);
    return opts.find(o => o.id === s || o.label.toLowerCase() === s || o.skill && o.skill === s)
      || opts.find(o => o.label !== STYLE_ANY.label && s.includes(o.label.toLowerCase()))
      || (/(стекл|glass)/.test(s) && opts.find(o => o.skill === 'glass-explainer-reel'))
      || (/(панел|panel)/.test(s) && opts.find(o => o.skill === 'explainer-panel-reel'))
      || (/(бизнес|business)/.test(s) && opts.find(o => o.skill === 'business-short-form-reels'))
      || (/(нейт|herk)/.test(s) && opts.find(o => o.skill === 'reels-herk'))
      || (/(тёмн|темн|dark)/.test(s) && opts.find(o => o.label.startsWith('Тёмный')))
      || (/(светл|light)/.test(s) && opts.find(o => o.label.startsWith('Светлый')))
      || (/фото/.test(s) && visual === 'carousel' && opts.find(o => o.label.startsWith('Обложка')))
      || (/^(выбери сам|сам|сами|любой|без разницы|на твой|на ваш|на усмотрение)/.test(s) && opts.find(o => o.label === STYLE_ANY.label))
      || null;
  }
  // the chosen style goes to the route: a style skill replaces a plain skill, an orchestrator (remake, carousel) keeps its own
  function applyStyle(t) {
    t.route.style = t.style;
    const st = curStage(t);
    if (st && !st.visual) return;
    if (t.style.skill && !ORCHESTRATORS.has(t.route.skill)) t.route.skill = t.style.skill;
  }
  function answerTask(t, text, files = []) {
    t.answers.push({ q:t.question.text, a:text + (files.length ? ` (приложил файлы: ${files.map(f => 'in/' + f).join(', ')})` : '') });
    if (t.question.from === 'style') {
      t.style = pickStyle(t.route.visual, text) || { label:text.slice(0, 120), skill:'', about:'' };
      applyStyle(t);
      startWork(t, `Стиль: «${t.style.label}». Диспетчер передал задачу агенту «${agentOf(t.route.agent)?.name}»${t.route.skill ? ` · скилл ${t.route.skill}` : ''}.`);
      emit(t);
    } else if (t.question.from === 'approval') {
      const yes = /^(1|выполн|да\b|ок\b|ok\b|го\b|разреш|подтвер|запуск)/i.test(text.trim());
      t.approval.status = yes ? 'yes' : 'no';
      if (yes) { queue(t, { kind:'execute', text }); step(t, `Ваш ответ: выполнить (${t.approval.actions.length} ${t.approval.actions.length === 1 ? 'действие' : 'действия'}).`); }
      else { queue(t, { kind:'answer', text:`Владелец НЕ разрешил действия во внешних системах${/^(2|не выполн|нет)/i.test(text.trim()) ? '' : `: «${text}»`}. Ничего не выполняй; сдай результат без этих действий (подготовленные материалы — в out/), в отчёте скажи, что действия не выполнены.`, files });
        step(t, `Ваш ответ: не выполнять${/^(2|не выполн|нет)/i.test(text.trim()) ? '' : ` — ${text}`}.`); }
      emit(t);
    } else if (t.question.from === 'agent') { queue(t, { kind:'answer', text, files }); step(t, `Ваш ответ: ${text}${filesStep(files)}`); emit(t); }
    else { t.status = 'routing'; t.question = null; step(t, `Ваш ответ: ${text}${filesStep(files)}`); emit(t); route(t); }
  }
  const styleLine = t => {
    const s = t.style || t.route?.style, st = curStage(t);
    if (!s || (st && !st.visual)) return '';
    if (s.label === STYLE_ANY.label) return 'Стиль: владелец оставил выбор тебе — выбери подходящий под сценарий и назови его в отчёте.';
    return `Стиль, который выбрал владелец: «${s.label}»${s.about ? ` (${s.about})` : ''}${s.skill && s.skill !== t.route.skill ? `. Для монтажа вызови скилл ${s.skill} инструментом Skill` : ''}. Делай строго в этом стиле, не спрашивай его заново и не меняй на ротацию.`;
  };

  function queue(t, pending) {
    t.status = 'queued'; t.pending = pending; t.queuedAt = now(); t.question = null;
  }
  // a task «in work» that the runner is no longer doing (it restarted, or lost us while this server
  // restarted): back to the queue once, an error the second time
  function orphan(t, why) {
    t.lost = (t.lost || 0) + 1;
    if (t.lost > 1) { t.status = 'error'; t.error = 'Исполнитель дважды перезапускался посреди задачи и не закончил её — нажмите «Повторить». Если задача тяжёлая (несколько видео), лучше разбить её на части.'; step(t, t.error); }
    else { queue(t, t.pending || { kind:'run' }); step(t, why); }
    emit(t);
  }

  /* ---------- prompts for the runner ---------- */

  function jobPrompt(t) {
    const a = agentOf(t.route.agent), p = t.pending;
    if (p.kind === 'run' && a.id === CC.id) return [`Ты — Claude Code на сервере офиса AICEX: универсальный исполнитель Ильи Палия. Задачу поставил сам Илья через своего цифрового двойника (hq2.aicex.club).`,
      '', `Задача: ${t.route.title}`, `Слова Ильи: «${t.text}»`,
      ...t.answers.map(x => `Уточнение. Вопрос: ${x.q} Ответ: ${x.a}`),
      styleLine(t),
      `У тебя все скиллы команды (${serverSkills.length || 'список'} в ~/.claude/skills) — сам выбери подходящие и вызывай их инструментом Skill; без подходящего делай сам.`,
      `Материалы от Ильи: ${t.files.length ? t.files.map(f => 'in/' + f.name).join(', ') : 'нет'}.`, ...transcriptNote(t),
      'Если результат — ответ, исследование, план или текст, оформи его страницей out/index.html (аккуратно, по-русски) и коротко перескажи суть в отчёте.', mcpNote(), lessonsNote(CC.id).text, '', RULES].filter((x, i, a) => x || a[i - 1]).join('\n');
    if (p.kind === 'revise' && !t.session) return `Задача: ${t.route.title}. Слова владельца: «${t.text}». Результат лежит в out/ (главный файл ${t.result?.main || 'out/index.html'}).\n\n` + jobPrompt({ ...t, session:'x' });
    if (p.kind === 'revise' && p.from === 'qa') return `«Контролёр качества» проверил твой результат до показа владельцу и просит доработать:\n${p.text}\n\nИсправь это в файлах out/ (главный файл — тот же). Отчёт сдай целиком в том же формате (Что сделано / Главное / Материалы / Что дальше), первым добавь раздел «## Что изменено» — что исправил по замечаниям. Предпоследней строкой SUMMARY: <одно предложение для истории офиса>, последней строкой RESULT: out/<главный файл>.`;
    if (p.kind === 'execute') return `Владелец разрешил действия во внешних системах:\n${(t.approval?.actions || []).map((x, i) => `${i + 1}. ${x}`).join('\n')}\n\nВыполни ровно их инструментами подключённых систем — ничего сверх и ничего не меняя в параметрах. Если какое-то действие не получилось — не повторяй вслепую, опиши ошибку. Затем отчёт целиком в том же формате; в «Главное» — что выполнено, с id, ссылками и цифрами из ответов систем. Обнови out/index.html под итог. Предпоследней строкой SUMMARY: <одно предложение для истории офиса>, последней строкой RESULT: out/<главный файл>.`;
    if (p.kind === 'revise') return `Владелец посмотрел результат и просит правку: «${p.text}»\n\nОтчёт сдай целиком в том же формате (Что сделано / Главное / Материалы / Что дальше) и первым добавь раздел «## Что изменено» — 1–3 пункта о правке.${filesNote(p.files)}\n\nВнеси правку в файлы out/ (главный файл — тот же), коротко скажи, что изменил. Правила те же: если суть результата изменилась — строка SUMMARY: <одно предложение для истории офиса>; последней строкой RESULT: out/<главный файл>, или NEED: <вопрос>, если без ответа владельца правку не сделать.`;
    if (p.kind === 'answer') return `Ответ владельца на твой вопрос: «${p.text}»${filesNote(p.files)}\n\nПродолжай задачу по тем же правилам: предпоследней строкой SUMMARY: <одно предложение для истории офиса>, последней строкой RESULT: out/<главный файл>, или NEED: <вопрос>, если всё ещё не хватает.`;
    if (a.dept === 'council') return [a.id === 'legends'
        ? 'Ты — «Совет легенд» в переговорной живого офиса AICEX: восемь ИИ-советников по методам Алекса Хормози (оффер), Гэри Вайнерчука (контент), Сета Година (бренд), Рассела Брансона (воронки), Джеффа Уокера (запуски), Дэна Кеннеди (прямой отклик), Гранта Кардона (продажи) и Ричарда Брэнсона (стратегия, 90 дней).'
        : `Ты — «${a.name}» из переговорной легенд живого офиса AICEX: ИИ-советник, работающий по методам этого человека (${a.role}).`,
      'Ты не сам этот человек и не говоришь от его имени: опираешься на его опубликованные принципы и книги, называешь, какой принцип применяешь. Если на сервере есть скилл «Команда 8 легенд» (ищи по названию или по словам legends / легенды в ~/.claude/skills) — открой его инструментом Skill и работай по нему.',
      '', `Задача: ${t.route.title}`, `Слова Ильи: «${t.text}»`, `ТЗ от диспетчера: ${t.route.brief}`,
      ...t.answers.map(x => `Уточнение. Вопрос: ${x.q} Ответ: ${x.a}`),
      `Материалы от Ильи: ${t.files.length ? t.files.map(f => 'in/' + f.name).join(', ') : 'нет'}.`, ...transcriptNote(t),
      'Это собеседование или исправление: сначала честная оценка (что сильно, что слабо, оценка по 10-балльной шкале по каждому критерию метода), затем исправленная версия — готовая к использованию, а не советы в общем.' + (a.id === 'legends' ? ' Каждый из восьми говорит отдельным разделом коротко; где расходятся — покажи спор; в конце общий вердикт и 3–5 правок по приоритету, с тем, кто из агентов офиса их делает.' : ''),
      ...pipelineNote(t), lessonsNote(a.id).text,
      'Оформи out/index.html: оценка, разбор по критериям, исправленная версия, следующий шаг.', '', RULES].filter((x, i, arr) => x || arr[i - 1]).join('\n');
    return [`Ты — агент «${a.name}» (${a.role}) живого офиса AICEX, отдел «${a.deptName}». Задачу поставил владелец, Илья Палий, прямо в офисе hq2.aicex.club.`,
      '', `Задача: ${t.route.title}`, `Слова владельца: «${t.text}»`, `ТЗ от диспетчера: ${t.route.brief}`,
      ...t.answers.map(x => `Уточнение. Вопрос: ${x.q} Ответ: ${x.a}`),
      t.route.skill ? `Скилл: ${t.route.skill} — вызови его инструментом Skill и работай по нему.` : 'Если среди твоих скиллов есть подходящий — работай по нему.',
      styleLine(t),
      `Материалы от владельца: ${t.files.length ? t.files.map(f => 'in/' + f.name).join(', ') : 'нет'}.`, ...transcriptNote(t), ...pipelineNote(t), mcpNote(), ...adsNote(a), lessonsNote(a.id).text, '', RULES].filter((x, i, arr) => x || arr[i - 1]).join('\n');
  }
  // the advertising department (Nurken) gets the real numbers of the Meta account from the agent «Цифры Meta» (assistant/meta.mjs, cache)
  function adsNote(a) {
    const note = a.dept === 'traffic' ? metaNote().trim() : '';
    return note ? [note + ' Это настоящие цифры кабинета — опирайся на них, не выдумывай другие; если нужно больше разрезов — бери их из подключённой системы Meta (Windsor) или попроси владельца.'] : [];
  }
  function transcriptNote(t) {
    if (!t.transcribed) return [];
    return [`Референс уже расшифровал агент «Транскрибатор»: ${t.transcribed.files.map(f => 'in/' + f).join(', ')} (${t.transcribed.summary}). Прочитай расшифровку первой и строй работу на ней: бери структуру, хук, аргументы и приёмы, но пиши своё — в стиле и для аудитории Ильи, без копирования чужого текста.`];
  }

  /* ---------- files ---------- */

  const safeName = n => path.basename(String(n || 'file')).replace(/[^\p{L}\p{N}._ -]+/gu, '_').slice(0, 120) || 'file';
  function safeRel(p) {
    const rel = path.posix.normalize(String(p || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/^out\//, ''));
    if (!rel || rel === '.' || rel.startsWith('..') || rel.split('/').some(x => x.startsWith('.'))) return '';
    return rel;
  }
  async function saveBody(req, file) {
    fs.mkdirSync(path.dirname(file), { recursive:true });
    let size = 0;
    const cap = new Transform({ transform(chunk, enc, cb) { size += chunk.length; cb(size > FILE_LIMIT ? Object.assign(new Error('too large'), { code:413 }) : null, chunk); } });
    try { await pipeline(req, cap, fs.createWriteStream(file)); } catch (e) { fs.rmSync(file, { force:true }); throw e; }
    return size;
  }
  function sendFile(req, res, file) {
    let st;
    try { st = fs.statSync(file); } catch { return notFound(res); }
    if (!st.isFile()) return notFound(res);
    const ext = path.extname(file).toLowerCase(), type = MIME[ext] || 'application/octet-stream';
    const head = { 'content-type':type, 'cache-control':'private, no-cache', 'accept-ranges':'bytes', 'x-content-type-options':'nosniff' };
    // results are pages written by an agent: an opaque origin, so they cannot act as the owner on this site
    if (ext === '.html' || ext === '.htm' || ext === '.svg') head['content-security-policy'] = 'sandbox allow-scripts allow-popups allow-forms allow-downloads';
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (m && (m[1] || m[2])) {
      let start = m[1] ? Number(m[1]) : st.size - Number(m[2]), end = m[1] && m[2] ? Number(m[2]) : st.size - 1;
      start = Math.max(0, start); end = Math.min(end, st.size - 1);
      if (start > end) { res.writeHead(416, { 'content-range':`bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, { ...head, 'content-range':`bytes ${start}-${end}/${st.size}`, 'content-length':end - start + 1 });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...head, 'content-length':st.size });
    fs.createReadStream(file).pipe(res);
  }
  const notFound = res => json(res, 404, { error:'Не найдено.' });
  const json = (res, code, body) => { res.writeHead(code, { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' }); res.end(JSON.stringify(body)); };
  async function readJson(req) {
    const parts = []; let size = 0;
    for await (const c of req) { size += c.length; if (size > 64e3) throw Object.assign(new Error('too large'), { code:413 }); parts.push(c); }
    try { return JSON.parse(Buffer.concat(parts).toString('utf8') || '{}'); } catch { return {}; }
  }

  const pipelinesView = () => Object.entries(PIPELINES).map(([id, P]) => ({ id, label:P.label, about:P.about,
    stages:P.stages.filter(s => agentOf(s.agent)).map(s => ({ agent:s.agent, name:agentOf(s.agent)?.name || s.agent, title:s.title })) }));

  /* ---------- history: what the owner accepted ---------- */

  function historyTask(t) {
    const a = agentOf(t.route.agent), main = t.result.main, url = main ? fileUrl(t, main) : '';
    const ext = path.extname(main || '').toLowerCase(), title = t.route.title;
    const media = !url ? [] : ext === '.mp4' || ext === '.webm' ? [{ type:'video', src:url, title, poster:'' }]
      : ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? [{ type:'img', src:url, title }]
      : ext === '.html' ? [{ type:'page', src:url, title }] : [];
    return { id:'desk-' + t.id, date:moscowDate(new Date(t.doneAt)), dateNote:'задачу поставили и приняли прямо в офисе', kind:KIND[t.route.deliverable] || 'Разработка',
      dept:a?.dept || 'ceo', people:['ilia'], agents:[...new Set([...(t.transcribed && t.route.agent !== TRANSCRIBER ? [TRANSCRIBER] : []), ...(t.pipeline ? t.pipeline.stages.map(s => s.agent) : [t.route.agent])])], title, summary:t.result.history || t.result.summary || '',
      proof:[{ kind:'file', label:`Результат агента «${a?.name || t.route.agent}»`, url }], media, desk:true };
  }

  /* ---------- create, used by the routes and by the assistant's tool ---------- */

  // files the owner uploaded (PUT upload) → the task's in/; a name already taken gets a suffix. Returns the new names.
  function takeUploads(t, uploads = []) {
    const added = [];
    for (const u of (Array.isArray(uploads) ? uploads : []).slice(0, 20)) {
      const src = path.join(DIR, 'uploads', safeName(u));
      if (!fs.existsSync(src)) continue;
      const orig = fs.readdirSync(src)[0];
      if (!orig) continue;
      const dir = path.join(taskDir(t.id), 'in'), ext = path.extname(orig), base = orig.slice(0, orig.length - ext.length);
      fs.mkdirSync(dir, { recursive:true });
      let name = orig;
      for (let i = 2; fs.existsSync(path.join(dir, name)) || t.files.some(f => f.name === name); i++) name = `${base}-${i}${ext}`;
      fs.renameSync(path.join(src, orig), path.join(dir, name));
      fs.rmSync(src, { recursive:true, force:true });
      t.files.push({ name, size:fs.statSync(path.join(dir, name)).size });
      added.push(name);
    }
    return added;
  }
  const filesNote = files => files?.length ? `\n\nНовые материалы от владельца к этому сообщению: ${files.map(f => 'in/' + f).join(', ')} — изучи их и используй.` : '';
  const filesStep = files => files?.length ? ` · файлы: ${files.join(', ')}` : '';
  function reviseTask(t, text, files = []) {
    learn(t.route?.agent, 'revise', t.route?.title, text);
    queue(t, { kind:'revise', text, files }); t.published = false; step(t, `Правка: ${text}${filesStep(files)}`); emit(t);
  }
  // accept: the rating (up / down) and its comment become the agent's lessons
  function approveTask(t, publish = true, rating = '', comment = '') {
    rating = rating === 'up' || rating === 'down' ? rating : ''; comment = String(comment || '').trim().slice(0, 600);
    t.status = 'done'; t.doneAt = now(); t.published = publish !== false;
    if (rating) {
      t.rating = { value:rating, comment };
      const what = t.result?.history || t.result?.summary?.replace(/\s+/g, ' ').slice(0, 200) || '';
      learn(t.route?.agent, rating, t.route?.title, comment || (rating === 'up' ? `Принято без правок${what ? ': ' + what : ''} — так и делать.` : ''));
    }
    step(t, (t.published ? 'Принято — задача добавлена в историю офиса.' : 'Принято без публикации в истории.') + (rating ? ` Оценка: ${rating === 'up' ? 'хорошо' : 'есть замечания'}${comment ? ' — ' + comment : ''}.` : ''));
    emit(t);
  }

  function createTask({ text, agent = '', uploads = [], direct = false, title = '', routine = null, source = '', pipeline = '' }) {
    const t = { id:crypto.randomBytes(4).toString('hex'), created:now(), updated:now(), text:String(text).trim().slice(0, 4000), agent:String(agent || ''),
      files:[], status:'routing', answers:[], steps:[], route:null, question:null, result:null, versions:0, published:false,
      source:routine ? 'routine' : direct ? 'twin' : ['office', 'assistant', 'twin'].includes(source) ? source : 'office',
      ...(PIPELINES[pipeline] ? { pipelinePick:pipeline } : {}) };
    takeUploads(t, uploads);
    tasks.unshift(t);
    if (routine) {
      const today = moscowDate(), yesterday = moscowDate(new Date(Date.now() - 864e5));
      t.routine = routine.id;
      t.route = { agent:routine.agent, skill:routine.skill, title:routine.title(ruDate(today), ruDate(yesterday)), brief:routine.text, deliverable:routine.deliverable, why:'ежедневная задача по расписанию' };
      queue(t, { kind:'run' });
      step(t, `Утренняя задача по расписанию — «${agentOf(routine.agent)?.name}» взялся за неё сам.`);
      emit(t);
      return { task:t, routed:Promise.resolve() };
    }
    if (direct) {
      t.route = { agent:CC.id, skill:'', title:String(title || t.text).trim().slice(0, 90), brief:t.text, deliverable:'other', why:'прямая задача Claude Code от двойника' };
      queue(t, { kind:'run' });
      step(t, 'Задача ушла напрямую Claude Code — со всеми скиллами команды.');
      emit(t);
      return { task:t, routed:Promise.resolve() };
    }
    step(t, 'Задача поставлена — диспетчер разбирает, кому её отдать.');
    emit(t);
    return { task:t, routed:route(t) };
  }

  // the same actions the owner has in the office, for the twin's tool
  function act(id, action, text = '', rating = '') {
    const t = byId(id); text = String(text || '').trim().slice(0, 4000);
    if (!t) return { error:'Нет такой задачи.' };
    if (action === 'answer') {
      if (t.status !== 'question' || !text) return { error:'Сейчас у задачи нет вопроса (или пустой ответ).' };
      answerTask(t, text);
    } else if (action === 'revise') {
      if (!['review', 'done'].includes(t.status) || !text) return { error:'Правку можно дать только к готовому результату и с текстом правки.' };
      reviseTask(t, text);
    } else if (action === 'approve') {
      if (t.status !== 'review') return { error:'Принять можно только результат на проверке.' };
      approveTask(t, true, rating, text);
    } else if (action === 'retry') {
      if (t.status !== 'error') return { error:'Повторить можно только задачу с ошибкой.' };
      t.error = ''; t.lost = 0;
      if (t.route) { queue(t, t.pending || { kind:'run' }); step(t, 'Повтор — задача снова в очереди.'); emit(t); }
      else { t.status = 'routing'; step(t, 'Повтор — диспетчер разбирает задачу заново.'); emit(t); route(t); }
    } else if (action === 'cancel') {
      if (!OPEN.includes(t.status)) return { error:'Задача уже закрыта.' };
      t.status = 'cancelled'; t.pending = null; step(t, 'Задача отменена.'); emit(t);
    } else return { error:'Неизвестное действие.' };
    return { task:view(t) };
  }

  // a short status block for the assistant: what is on the desk right now
  function summary() {
    const open = tasks.filter(t => OPEN.includes(t.status)).slice(0, 8), st = stats();
    const month = st.total.runs ? ` За этот месяц: ${st.total.tasks} задач, работа агентов ${Math.round(st.total.ms / 60000)} мин, $${st.total.cost}${st.agents[0] ? `; дороже всех — «${st.agents[0].name}» ($${st.agents[0].cost})` : ''}.` : '';
    if (!open.length) return 'Задач в работе у агентов сейчас нет.' + month;
    return 'Задачи на рабочем столе офиса: ' + open.map(t => `«${t.route?.title || t.text.slice(0, 60)}» — ${t.route ? (agentOf(t.route.agent)?.name || '') + ', ' : ''}${STATUS[t.status]}${t.question ? ` (вопрос: ${t.question.text}${t.question.options ? ' Варианты: ' + t.question.options.map(o => o.label).join(', ') : ''})` : ''}`).join('; ') + '.' + month;
  }

  // restart: interrupted routing is redone
  for (const t of tasks) if (t.status === 'routing') route(t);

  /* ---------- routines: the daily tasks the desk sets itself ---------- */

  const ROUT_FILE = path.join(DIR, 'routines.json');
  let routRuns = {};
  try { routRuns = JSON.parse(fs.readFileSync(ROUT_FILE, 'utf8')); } catch {}
  function tickRoutines(now = new Date()) {
    if (/^(off|0|false)$/i.test(process.env.HQ_ROUTINES || '')) return [];
    const today = moscowDate(now), hhmm = new Intl.DateTimeFormat('en-GB', { timeZone:'Europe/Moscow', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).format(now);
    const made = [];
    for (const r of ROUTINES) {
      if (routRuns[r.id] === today || hhmm < r.at || !agentOf(r.agent)) continue;
      routRuns[r.id] = today;
      fs.writeFileSync(ROUT_FILE, JSON.stringify(routRuns));
      if (tasks.some(t => t.routine === r.id && OPEN.includes(t.status))) continue;  // yesterday's is still open — no second one
      made.push(createTask({ text:r.text, routine:r }).task);
    }
    return made;
  }
  setInterval(() => { try { tickRoutines(); } catch (e) { console.error('desk routines:', e.message); } }, 60e3).unref();

  // the owner's Telegram (the Office Worker bot): daily results, warnings and errors of routines
  async function notify(t) {
    const tok = process.env.HQ_NOTIFY_TG_TOKEN, chat = process.env.HQ_NOTIFY_TG_CHAT;
    if (!tok || !chat || !t.routine) return;
    const a = agentOf(t.route.agent), crit = t.alerts?.critical?.length;
    const head = t.status === 'error' ? `⚠️ ${a?.name}: не получилось` : crit ? `🔴 ${a?.name}: срочно` : t.alerts?.warn?.length ? `🟡 ${a?.name}: скоро продлить` : `📊 ${a?.name}`;
    const body = t.status === 'error' ? t.error : t.alerts ? [...(t.alerts.critical || []).map(x => '• ' + x), ...(t.alerts.warn || []).map(x => '◦ ' + x)].join('\n') : (t.result?.history || t.result?.summary || '');
    try {
      await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, { method:'POST', headers:{ 'content-type':'application/json' },
        body:JSON.stringify({ chat_id:chat, text:`${head}\n${t.route.title}\n\n${String(body).slice(0, 3200)}\n\n${PUBLIC_URL}/#desk-${t.id}`, disable_web_page_preview:true }) });
    } catch (e) { console.error('desk notify:', e.message); }
  }

  /* ---------- routes ---------- */

  async function handle(req, res, rest, isOwner) {
    const seg = rest.split('/').filter(Boolean), M = req.method;
    const url = new URL(req.url, 'http://x');

    if (M === 'GET' && (rest === 'history.js' || rest === 'history.json')) {
      const list = tasks.filter(t => t.status === 'done' && t.published && t.result).map(historyTask);
      if (rest === 'history.json') return json(res, 200, list);
      res.writeHead(200, { 'content-type':'text/javascript; charset=utf-8', 'cache-control':'no-cache' });
      return res.end(`window.OFFICE_TASKS_DESK = ${JSON.stringify(list)};\n`);
    }
    if (M === 'GET' && seg[0] === 'files' && seg.length >= 4) {
      const t = byId(seg[1]), v = Number(String(seg[2]).replace(/^v/, ''));
      if (!t || !t.result) return notFound(res);
      if (!isOwner && !(t.published && v === t.result.version)) return notFound(res);
      const rel = safeRel(seg.slice(3).map(decodeURIComponent).join('/'));
      if (!rel) return notFound(res);
      return sendFile(req, res, path.join(taskDir(t.id), 'v' + v, rel));
    }

    /* runner: Bearer token shared with apps/hq-office/runner */
    if (seg[0] === 'runner') {
      const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!runnerToken || auth.length !== runnerToken.length || !crypto.timingSafeEqual(Buffer.from(auth), Buffer.from(runnerToken))) return json(res, 403, { error:'runner token' });
      runner.seenAt = Date.now();
      if (M === 'POST' && seg[1] === 'hello') {
        // a (re)started runner has no running jobs: what it was doing goes back to the queue
        const b = await readJson(req); runner.version = String(b.version || '');
        const c = b.claude && typeof b.claude === 'object' ? b.claude : null;
        runner.claude = c ? { ok:Boolean(c.ok), error:String(c.error || '').slice(0, 300), auth:String(c.auth || '').slice(0, 80) } : null;
        runner.mcp = (Array.isArray(b.mcp) ? b.mcp : []).slice(0, 20).map(x => ({ name:String(x?.name || '').slice(0, 60), read:Number(x?.read) || 0, write:Number(x?.write) || 0, error:String(x?.error || '').slice(0, 200) })).filter(x => x.name);
        try { fs.writeFileSync(RUNNER_FILE, JSON.stringify({ version:runner.version, claude:runner.claude, mcp:runner.mcp })); } catch {}
        for (const t of tasks) if (t.status === 'work') orphan(t, 'Исполнитель перезапустился посреди задачи (выкладка или сбой сервера) — задача снова в очереди.');
        return json(res, 200, { ok:true });
      }
      if (M === 'POST' && seg[1] === 'skills') {
        // every skill installed on the runner's server: name, description and the SKILL.md text (for the twin)
        const parts = []; let size = 0;
        for await (const c of req) { size += c.length; if (size > 12e6) return json(res, 413, { error:'too large' }); parts.push(c); }
        let b; try { b = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { return json(res, 400, { error:'json' }); }
        serverSkills = (Array.isArray(b.skills) ? b.skills : []).filter(x => x && x.name).slice(0, 500)
          .map(x => ({ name:String(x.name).slice(0, 80), description:String(x.description || '').slice(0, 600), text:String(x.text || '').slice(0, 20000) }));
        fs.writeFileSync(SKILLS_FILE + '.tmp', JSON.stringify(serverSkills)); fs.renameSync(SKILLS_FILE + '.tmp', SKILLS_FILE);
        return json(res, 200, { ok:true, skills:serverSkills.length });
      }
      if (M === 'POST' && seg[1] === 'claim') {
        // the runner does one task at a time: when it asks for the next one, nothing is in work
        for (const t of tasks) if (t.status === 'work') orphan(t, 'Исполнитель не сдал задачу — она снова в очереди.');
        const t = tasks.filter(x => x.status === 'queued').sort((x, y) => x.queuedAt.localeCompare(y.queuedAt))[0];
        if (!t) { res.writeHead(204); return res.end(); }
        if (t.pending.kind === 'transcribe') {
          t.status = 'work'; t.error = '';
          step(t, `«${agentOf(TRANSCRIBER)?.name || 'Транскрибатор'}» взял референс в работу.`);
          emit(t);
          return json(res, 200, { id:t.id, kind:'transcribe', agent:TRANSCRIBER, title:t.route.title, sources:t.chain?.sources || [], files:t.chain?.media || [] });
        }
        if (t.pending.kind === 'qa') {
          t.status = 'work'; t.error = ''; t.qa.status = 'work';
          step(t, `«${agentOf(QA)?.name || 'Контролёр качества'}» проверяет результат перед показом вам.`);
          emit(t);
          return json(res, 200, { id:t.id, kind:'qa', agent:QA, title:t.route.title, prompt:qaPrompt(t), session:'', effort:'medium', files:t.files.map(f => f.name) });
        }
        const a = agentOf(t.route.agent);
        t.status = 'work'; t.versions = (t.versions || 0) + 1; t.workVersion = t.versions; t.error = '';
        if (t.pending.kind === 'run') t.lessonsUsed = lessonsNote(t.route.agent).n;
        step(t, t.pending.kind === 'execute' ? `«${a?.name}» выполняет разрешённые действия.` : t.pending.kind === 'revise' ? `«${a?.name}» вносит правку${t.pending.from === 'qa' ? ' по замечаниям контролёра' : ''}.` : t.pending.kind === 'answer' ? `«${a?.name}» получил ваш ответ и продолжает.` : `«${a?.name}» взял задачу в работу.`);
        emit(t);
        return json(res, 200, { id:t.id, kind:t.pending.kind, version:t.versions, agent:t.route.agent, skill:t.route.skill, title:t.route.title,
          prompt:jobPrompt(t), session:t.pending.kind === 'run' ? '' : t.session || '', files:t.files.map(f => f.name),
          ...(t.route.agent === TRANSCRIBER ? { sources:t.chain?.sources || videoLinks(t.text) } : {}) });
      }
      const t = byId(seg[1]);
      if (!t) return notFound(res);
      if (M === 'GET' && seg[2] === 'input' && seg[3]) return sendFile(req, res, path.join(taskDir(t.id), 'in', safeName(decodeURIComponent(seg[3]))));
      if (M === 'POST' && seg[2] === 'step') {
        const b = await readJson(req);
        if (t.status === 'work' && b.text) { step(t, b.text); emit(t); }
        return json(res, 200, { cancelled:t.status !== 'work' });
      }
      if (M === 'PUT' && seg[2] === 'file') {
        const rel = safeRel(url.searchParams.get('path'));
        if (!rel || t.status !== 'work') return json(res, 400, { error:'path' });
        if (t.pending?.kind === 'transcribe') return json(res, 200, { ok:true, size:await saveBody(req, path.join(taskDir(t.id), 'in', safeName(rel))) });
        const size = await saveBody(req, path.join(taskDir(t.id), 'v' + t.workVersion, rel));
        return json(res, 200, { ok:true, size });
      }
      if (M === 'POST' && seg[2] === 'finish') {
        const b = await readJson(req);
        if (t.status !== 'work') return json(res, 200, { ok:true, ignored:true });
        const pk = t.pending?.kind;
        addRun(t, pk === 'transcribe' ? TRANSCRIBER : pk === 'qa' ? QA : t.route.agent, pk, b.usage);
        if (b.session && pk !== 'qa') t.session = String(b.session);
        t.lost = 0;
        if (pk === 'qa') {
          // the controller's verdict: fine — to the owner; a problem — back to the agent once, with its notes
          const notes = String(b.notes || '').trim().slice(0, 3000), fix = b.result === 'qa' && b.verdict === 'fix' && notes;
          t.qa = { ...t.qa, status:'done', verdict:b.result === 'qa' ? (fix ? 'fix' : 'ok') : 'skip', notes:b.result === 'qa' ? notes : String(b.error || '').slice(0, 300) };
          if (fix) {
            queue(t, { kind:'revise', text:notes, from:'qa' });
            step(t, `«${agentOf(QA)?.name}» вернул на доработку: ${notes.replace(/\s+/g, ' ').slice(0, 220)}`);
          } else {
            t.status = 'review'; t.pending = null;
            step(t, b.result === 'qa' ? `«${agentOf(QA)?.name}»: проверено — можно показывать. Агент несёт результат к вашему столу.` : `Контролёр не смог проверить результат — показываю как есть.`);
          }
          emit(t);
          return json(res, 200, { ok:true });
        }
        if (b.result === 'transcribed' && t.pending?.kind === 'transcribe') {
          const names = (Array.isArray(b.files) ? b.files : []).map(safeName).filter(n => fs.existsSync(path.join(taskDir(t.id), 'in', n)));
          if (!names.length) { t.status = 'error'; t.error = 'Транскрибатор закончил, но расшифровка не дошла — нажмите «Повторить».'; step(t, t.error); emit(t); return json(res, 200, { ok:true }); }
          for (const n of names) if (!t.files.some(f => f.name === n)) t.files.push({ name:n, size:fs.statSync(path.join(taskDir(t.id), 'in', n)).size });
          t.transcribed = { files:names, summary:String(b.summary || '').slice(0, 600) };
          queue(t, { kind:'run' });
          step(t, `«${agentOf(TRANSCRIBER)?.name || 'Транскрибатор'}» расшифровал: ${t.transcribed.summary || names.join(', ')} — и передал текст агенту «${agentOf(t.route.agent)?.name}».`);
          emit(t);
          return json(res, 200, { ok:true });
        }
        // a middle stage of a pipeline: the work goes on to the next agent, the owner sees only the end
        if (b.result === 'review' && t.pipeline && t.pipeline.idx < t.pipeline.stages.length - 1 && ['run', 'answer', 'execute'].includes(pk)) {
          nextStage(t, b); emit(t);
          return json(res, 200, { ok:true });
        }
        if (b.result === 'review' || b.result === 'approve') {
          const root = path.join(taskDir(t.id), 'v' + t.workVersion), files = [];
          const walk = (d, pre) => { for (const e of fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes:true }) : []) { const rel = pre ? pre + '/' + e.name : e.name; if (e.isDirectory()) walk(path.join(d, e.name), rel); else files.push({ path:rel, size:fs.statSync(path.join(d, e.name)).size }); } };
          walk(root, '');
          const main = safeRel(b.main) && files.some(f => f.path === safeRel(b.main)) ? safeRel(b.main)
            : (files.find(f => f.path === 'index.html') || files.find(f => /\.(mp4|html|pdf|png|jpe?g)$/i.test(f.path)) || files[0])?.path || '';
          if (!files.length && b.result === 'review') { t.status = 'error'; t.error = 'Агент закончил, но не сдал ни одного файла.'; step(t, t.error); emit(t); return json(res, 200, { ok:true }); }
          // a revision keeps what the work is about; its own report goes to the note
          const before = t.result, revised = t.pending?.kind === 'revise' && before;
          // a structured report (## sections) replaces the old one whole; a short revision note stays next to the original report
          const report = String(b.summary || '').slice(0, 8000), full = /^##\s/m.test(report);
          if (files.length || !before) t.result = { version:t.workVersion, main, files, summary:revised && !full ? String(before.summary || report) : report,
            note:revised && !full ? report.slice(0, 1200) : '', history:String(b.history || before?.history || '').slice(0, 400) };
          if (t.pipeline) { const st = curStage(t); st.status = 'done'; st.summary = report.slice(0, 4000); }
          if (b.result === 'approve') {
            // actions in outside systems: nothing changes there until the owner says «Выполнить»
            const actions = (Array.isArray(b.actions) ? b.actions : []).map(x => String(x).trim().slice(0, 600)).filter(Boolean).slice(0, 10);
            t.approval = { actions, status:'wait', at:now() };
            t.status = 'question'; t.pending = null;
            t.question = { from:'approval', text:`«${agentOf(t.route.agent)?.name}» подготовил ${actions.length === 1 ? 'действие' : 'действия'} во внешних системах — выполнить?\n${actions.map((x, i) => `${i + 1}. ${x}`).join('\n')}`,
              options:[{ id:'1', label:'Выполнить', about:'агент сделает ровно это и отчитается' }, { id:'2', label:'Не выполнять', about:'агент сдаст результат без этих действий' }] };
            step(t, `«${agentOf(t.route.agent)?.name}» ждёт вашего разрешения: ${actions.join('; ').slice(0, 260)}`);
            emit(t);
            return json(res, 200, { ok:true });
          }
          if (needsQA(t)) {
            t.qa = { status:'queued' };
            queue(t, { kind:'qa' });
            step(t, `Результат готов — «${agentOf(QA)?.name}» сверит его с задачей, прежде чем показать вам.`);
            emit(t);
            return json(res, 200, { ok:true });
          }
          t.status = 'review'; t.pending = null;
          if (b.alerts && typeof b.alerts === 'object') t.alerts = { critical:(b.alerts.critical || []).map(String).slice(0, 30), warn:(b.alerts.warn || []).map(String).slice(0, 30) };
          const routine = ROUTINES.find(r => r.id === t.routine);
          if (routine?.quiet && t.alerts && !t.alerts.critical.length && !t.alerts.warn.length) {
            t.status = 'done'; t.doneAt = now(); t.published = false;
            step(t, 'Всё в порядке — предупреждать не о чем, задача закрыта сама.');
          } else {
            step(t, `Готово превью: ${main}. Агент несёт результат к вашему столу.`);
            notify(t);
          }
        } else if (b.result === 'need') {
          t.status = 'question'; t.question = { from:'agent', text:String(b.question || 'Агенту не хватает данных — уточните задачу.').slice(0, 800) };
          step(t, `«${agentOf(t.route.agent)?.name}» спрашивает: ${t.question.text}`);
        } else {
          if (pk === 'execute') t.approval.status = 'error';
          t.status = 'error'; t.error = String(b.error || 'Агент не смог закончить задачу.').slice(0, 800); t.log = String(b.log || '').slice(-2000);
          step(t, t.error);
          notify(t);
        }
        emit(t);
        return json(res, 200, { ok:true });
      }
      return notFound(res);
    }

    /* owner */
    if (!isOwner) return json(res, 403, { error:'Ставить задачи агентам может только владелец — войдите в ассистенте.' });
    if (M === 'GET' && rest === 'tasks') return json(res, 200, { tasks:tasks.slice(0, 60).map(view), runner:runnerView(), agents:catalog().agents.map(a => ({ id:a.id, name:a.name, dept:a.dept, role:a.role })), pipelines:pipelinesView() });
    if (M === 'GET' && rest === 'stats') { const m = url.searchParams.get('month') || ''; return json(res, 200, stats(/^\d{4}-\d{2}$/.test(m) ? m : undefined)); }
    if (M === 'GET' && rest === 'lessons') {
      const id = url.searchParams.get('agent') || '';
      return json(res, 200, id ? { agent:id, ...lessonsOf(id) } : { agents:lessonsAll() });
    }
    if (M === 'GET' && rest === 'events') {
      res.writeHead(200, { 'content-type':'text/event-stream; charset=utf-8', 'cache-control':'no-store', 'x-accel-buffering':'no' });
      res.write(`data: ${JSON.stringify({ t:'snapshot', tasks:tasks.slice(0, 60).map(view), runner:runnerView() })}\n\n`);
      clients.add(res); req.on('close', () => clients.delete(res));
      return;
    }
    if (M === 'PUT' && rest === 'upload') {
      const id = crypto.randomBytes(8).toString('hex'), name = safeName(url.searchParams.get('name'));
      const size = await saveBody(req, path.join(DIR, 'uploads', id, name));
      return json(res, 200, { id, name, size });
    }
    if (M === 'POST' && rest === 'tasks') {
      const b = await readJson(req);
      if (!String(b.text || '').trim()) return json(res, 400, { error:'Опишите задачу.' });
      const { task } = createTask({ text:b.text, agent:b.agent, pipeline:String(b.pipeline || ''), uploads:Array.isArray(b.uploads) ? b.uploads : [], source:'office' });
      return json(res, 200, { task:view(task) });
    }
    if (seg[0] === 'tasks' && seg[1] && M === 'POST') {
      const t = byId(seg[1]);
      if (!t) return notFound(res);
      const b = await readJson(req), text = String(b.text || '').trim().slice(0, 4000);
      if (seg[2] === 'answer') {
        if (t.status !== 'question' || !text) return json(res, 400, { error:'Сейчас вопроса нет.' });
        answerTask(t, text, takeUploads(t, b.uploads));
        return json(res, 200, { task:view(t) });
      }
      if (seg[2] === 'revise') {
        if (!['review', 'done'].includes(t.status) || !text) return json(res, 400, { error:'Правку можно дать к готовому результату.' });
        reviseTask(t, text, takeUploads(t, b.uploads));
        return json(res, 200, { task:view(t) });
      }
      if (seg[2] === 'approve') {
        if (t.status !== 'review') return json(res, 400, { error:'Принять можно результат на проверке.' });
        approveTask(t, b.publish !== false, b.rating, b.comment);
        return json(res, 200, { task:view(t) });
      }
      if (seg[2] === 'retry') {
        if (t.status !== 'error') return json(res, 400, { error:'Повторить можно задачу, которая закончилась ошибкой.' });
        t.error = ''; t.lost = 0;
        if (t.route) { queue(t, t.pending || { kind:'run' }); step(t, 'Повтор — задача снова в очереди.'); emit(t); }
        else { t.status = 'routing'; step(t, 'Повтор — диспетчер разбирает задачу заново.'); emit(t); route(t); }
        return json(res, 200, { task:view(t) });
      }
      if (seg[2] === 'cancel') {
        if (!OPEN.includes(t.status)) return json(res, 400, { error:'Задача уже закрыта.' });
        t.status = 'cancelled'; t.pending = null; step(t, 'Задача отменена.'); emit(t);
        return json(res, 200, { task:view(t) });
      }
    }
    return notFound(res);
  }

  return { handle, createTask, summary, tickRoutines, agents:() => catalog().agents, view, act, stats, lessonsOf, pipelines:pipelinesView,
    list:(n = 15) => tasks.slice(0, n).map(view), get:id => { const t = byId(id); return t ? view(t) : null; },
    skills:() => serverSkills, skillsFile:SKILLS_FILE };
}
