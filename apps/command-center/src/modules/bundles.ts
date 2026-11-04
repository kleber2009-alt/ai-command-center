// Готовые связки — рабочие решения из нескольких модулей, которые можно запускать прямо сейчас.
// Страница /modules (каталог) и /modules/<slug> (мини-презентация). Данные — только реальные:
// каждая связка опирается на код/скилл/бот из монорепо или aicex-library и на проекты реестра
// apps/command-center/registry/projects.mjs (поле projects — их slug).
//
// Новая связка = новый объект в BUNDLES. Картинки и ролики для демо — публичные файлы hq2.aicex.club
// (apps/hq-office/media, apps/hq-office/works) или скриншоты живых сайтов; закрытое не показываем.

export type BundleStatus = 'production' | 'beta' | 'dev'

export type BlockId =
  | 'transcriber' | 'viral-search' | 'script' | 'heygen' | 'montage' | 'carousel'
  | 'telegram' | 'claude-code' | 'landing' | 'analytics' | 'chatplace' | 'voice'

export type Block = { id: BlockId; name: string; what: string }

export type Category = 'video' | 'carousel' | 'research' | 'sales' | 'office'

export type Slide = {
  title: string
  text: string
  /** картинка или ролик (mp4) — публичный URL */
  media?: { type: 'img' | 'video'; src: string; poster?: string; fit?: 'cover' | 'contain' }
  /** макет переписки в Telegram: me — пользователь, bot — бот; buttons — кнопки под последним сообщением */
  chat?: { from: 'me' | 'bot'; text: string; buttons?: string[] }[]
  /** схема «вход → выход» крупно */
  io?: { from: string; to: string }
}

export type Bundle = {
  slug: string
  name: string
  emoji: string
  category: Category
  status: BundleStatus
  /** одна фраза: что получаешь */
  pitch: string
  /** для кого и какую боль снимает */
  forWhom: string
  input: string
  output: string
  time?: string
  steps: { title: string; detail: string; block?: BlockId }[]
  blocks: BlockId[]
  launch: { label: string; url?: string; kind: 'bot' | 'site' | 'skill' | 'office' | 'code' }[]
  /** slug проектов реестра, на которых держится связка */
  projects: string[]
  demo: Slide[]
  notes?: string
}

const HQ = 'https://hq2.aicex.club/'
const GH = 'https://github.com/kleber2009-alt/ai-command-center/tree/main/'
const img = (src: string, fit: 'cover' | 'contain' = 'cover') => ({ type: 'img' as const, src: src.startsWith('http') ? src : HQ + src, fit })
const vid = (name: string) => ({ type: 'video' as const, src: `${HQ}media/videos/${name}.mp4`, poster: `${HQ}media/videos/${name}.jpg`, fit: 'contain' as const })
const t = (name: string) => ({ label: '@' + name, url: 'https://t.me/' + name, kind: 'bot' as const })
const skill = (name: string) => ({ label: `Скилл ${name}`, url: `${GH}.claude/skills/${name}`, kind: 'skill' as const })

export const CATEGORIES: { id: Category; label: string; about: string }[] = [
  { id: 'video',    label: 'Видео и рилсы',        about: 'от ссылки или идеи до готового рилса 9:16' },
  { id: 'carousel', label: 'Карусели и тексты',    about: 'слайды, посты, лендинги' },
  { id: 'research', label: 'Залёты и аналитика',   about: 'что сработало у вас и у конкурентов, цифры и деньги' },
  { id: 'sales',    label: 'Продажи и воронки',    about: 'Директ, Telegram, лиды и оплаты' },
  { id: 'office',   label: 'Офис агентов',         about: 'задачи агентам, двойник, утренние отчёты' },
]

// Кирпичики, из которых собраны связки. Один и тот же блок работает в нескольких связках.
export const BLOCKS: Block[] = [
  { id: 'viral-search', name: 'Поиск залётов',      what: 'Apify по аккаунтам конкурентов и своему; сила = просмотры / медиана автора' },
  { id: 'transcriber',  name: 'Транскрибатор',      what: 'ссылка или файл → текст: yt-dlp / Apify → ElevenLabs Scribe → Whisper' },
  { id: 'script',       name: 'Сценарий 2.0',       what: 'Claude по правилам скилла: новый хук, структура залёта, кодовое слово, проверка' },
  { id: 'heygen',       name: 'Аватар HeyGen',      what: 'цифровой двойник Ильи и клон голоса, видео 9:16' },
  { id: 'voice',        name: 'Клон голоса',        what: 'ElevenLabs: голосовые, озвучка, распознавание речи' },
  { id: 'montage',      name: 'Монтаж Кадрика',     what: '48 стилей монтажа, Claude Code со скиллами, превью → «ок» → финал' },
  { id: 'carousel',     name: 'Рендер каруселей',   what: 'план слайдов → HTML → PNG/JPEG 1080×1350 в стиле блога' },
  { id: 'telegram',     name: 'Telegram-карточки',  what: 'карточки в ветке с кнопками ✅ / ✏️ / 🔄 / ⏰, готовое — файлом' },
  { id: 'claude-code',  name: 'Исполнитель Claude Code', what: 'hq-runner: агенты офиса делают задачу скиллами команды на сервере' },
  { id: 'landing',      name: 'Лендинги',           what: '5 стилей лендинга эксперта + страница «Оплата прошла»' },
  { id: 'analytics',    name: 'Данные и отчёты',    what: 'Meta Ads, GetCourse, соцсети, балансы сервисов → отчёт' },
  { id: 'chatplace',    name: 'ChatPlace',          what: 'ИИ-менеджер в Instagram Direct, кодовые слова, база знаний' },
]

export const BUNDLES: Bundle[] = [
  // ── Видео и рилсы ────────────────────────────────────────────────────────
  {
    slug: 'reference-transcript', name: 'Транскрибатор референсов', emoji: '🎧', category: 'video', status: 'production',
    pitch: 'Ссылка на ролик конкурента → чистый текст, подпись, автор и цифры за минуту',
    forWhom: 'Первый шаг любой контентной связки: чтобы писать сценарий «как у конкурента», нужен точный текст того, что в ролике говорят.',
    input: 'Ссылка на Reels, YouTube, TikTok, VK или видео/аудиофайл',
    output: 'Расшифровка абзацами + подпись к публикации + автор + просмотры/лайки',
    time: '≈1 минута',
    steps: [
      { title: 'Скачивание', detail: 'yt-dlp, для Instagram — Apify; берётся звуковая дорожка, а не немой mp4', block: 'transcriber' },
      { title: 'Распознавание', detail: 'ElevenLabs Scribe, запасные — OpenAI и локальный faster-whisper', block: 'transcriber' },
      { title: 'Оформление', detail: 'текст абзацами, подпись, автор и цифры ролика одной страницей' },
      { title: 'Дальше по цепочке', detail: 'в офисе текст сам уходит агенту сценариев, каруселей или постов', block: 'claude-code' },
    ],
    blocks: ['transcriber', 'claude-code'],
    launch: [
      { label: 'Офис hq2: агент «Транскрибатор»', url: HQ, kind: 'office' },
      skill('transcribe-reference'),
      { label: 'Приложение Транскрибация', url: 'https://transcribe.aicex.club/', kind: 'site' },
    ],
    projects: ['transcribe', 'hq-office', 'ytdlp'],
    demo: [
      { title: 'Вход — просто ссылка', text: 'Илья кидает ссылку на залетевший ролик конкурента: в офис, боту или в задачу.', io: { from: 'instagram.com/reel/…', to: 'текст ролика' } },
      { title: 'Скачали и распознали', text: 'Скрипт скилла сам выбирает способ скачать и распознать: если один сервис упал — берёт следующий.',
        chat: [{ from: 'me', text: 'расшифруй https://www.instagram.com/reel/…' }, { from: 'bot', text: '🎧 Скачиваю звук… распознаю ElevenLabs Scribe' }, { from: 'bot', text: '✅ Готово: 142 слова · автор @… · 1,2 млн просмотров' }] },
      { title: 'Готовый текст для работы', text: 'Расшифровка, подпись и цифры — одной страницей. Её сразу берут агенты сценариев и каруселей.', media: img('works/sites/transcribe.jpg') },
    ],
  },
  {
    slug: 'remake-top-reel', name: 'Ремейк залёта', emoji: '🔁', category: 'video', status: 'production',
    pitch: 'Свой залетевший рилс → новый, сильнее, с аватаром Ильи и монтажом',
    forWhom: 'Повторить успех своего топового рилса без съёмки: тот же смысл, новый хук и подача, говорит цифровой двойник.',
    input: 'Аккаунт @ilia.paliy (сам находит топ) или ссылка/файл референса',
    output: 'Готовый рилс 1080×1920 + сценарий + подпись',
    time: '20–40 минут, без участия',
    steps: [
      { title: 'Отбор', detail: 'топ рилсов по просмотрам, комментариям и репостам; только говорящие головы с кодовым словом', block: 'viral-search' },
      { title: 'Расшифровка', detail: 'текст победителя', block: 'transcriber' },
      { title: 'Сценарий 2.0', detail: 'усиленный и уникализированный текст «было → стало», проверка правилами скилла', block: 'script' },
      { title: 'Аватар', detail: 'HeyGen: образ и клон голоса Ильи, вертикаль', block: 'heygen' },
      { title: 'Монтаж', detail: 'стиль Кадрика: «Стеклянная объяснялка», «Панель-объяснялка» или «Бизнес-рилс»', block: 'montage' },
    ],
    blocks: ['viral-search', 'transcriber', 'script', 'heygen', 'montage'],
    launch: [
      { label: 'remake.aicex.club — прогоны и студия', url: 'https://remake.aicex.club', kind: 'site' },
      skill('remake-top-reel'),
    ],
    projects: ['remake-site', 'studio-kadrik'],
    demo: [
      { title: 'Нашли, что залетело', text: 'Скилл берёт рилсы @ilia.paliy, ранжирует по просмотрам, комментариям и репостам и оставляет говорящие головы с кодовым словом.', io: { from: 'топ-рилс @ilia.paliy', to: 'победитель' } },
      { title: 'Сценарий «было → стало»', text: 'Claude усиливает хук и структуру, меняет формулировки, чтобы ролик не был копией, и проверяет сценарий по правилам скилла.' },
      { title: 'Стиль «Стеклянная объяснялка»', text: 'Двойник Ильи говорит текст, монтаж добавляет стеклянные карточки, титры и графику.', media: vid('glass-explainer') },
      { title: 'Стиль «Панель-объяснялка»', text: 'Тот же сценарий — в другой подаче. Стиль выбирается под ролик.', media: vid('explainer-panel') },
      { title: 'Все прогоны — на сайте', text: 'remake.aicex.club показывает каждый прогон по шагам; во вкладке «Студия» то же самое можно сделать руками из любого референса.' },
    ],
  },
  {
    slug: 'reels-telegram', name: 'Ветка «Instagram Reels» в Telegram', emoji: '📲', category: 'video', status: 'production',
    pitch: 'Каждое утро — залёты конкурентов карточками в Telegram, ✅ → готовое видео в ветке',
    forWhom: 'Ежедневный конвейер рилсов без ручного поиска: остаётся только одобрить карточку и опубликовать видео.',
    input: 'Список конкурентов (/competitors add) или свой аккаунт',
    output: 'Готовый смонтированный рилс файлом + подпись к выбранному слоту',
    time: 'карточки утром, видео ≈30 минут после ✅',
    steps: [
      { title: 'Поиск', detail: 'раз в день залёты конкурентов: свежие, 12–120 с, сила = просмотры / медиана автора', block: 'viral-search' },
      { title: 'Расшифровка и сценарий', detail: 'новый хук «было → стало», сценарий 2.0, проверка скилла', block: 'script' },
      { title: 'Карточка в ветку', detail: 'кнопки ✅ Одобрить · ✏️ Править · 🔄 Хук · ♻️ Другой · 📎 Материалы · ⏰ Слот · 🎨 Стиль', block: 'telegram' },
      { title: 'Аватар + монтаж', detail: 'после ✅ — HeyGen и монтаж Кадрика', block: 'heygen' },
      { title: 'Видео в ветку', detail: 'файлом, с напоминанием к слоту публикации 12:00 / 19:00', block: 'telegram' },
    ],
    blocks: ['viral-search', 'transcriber', 'script', 'telegram', 'heygen', 'montage', 'voice'],
    launch: [
      { label: 'Ветка «Instagram Reels» в рабочей группе', kind: 'bot' },
      { label: 'Код: reels-bot.mjs', url: `${GH}apps/remake-site`, kind: 'code' },
    ],
    projects: ['remake-site', 'studio-kadrik'],
    demo: [
      { title: 'Утренняя карточка', text: 'Бот нашёл залёт конкурента и принёс разбор и новый хук.',
        chat: [{ from: 'bot', text: '🔥 Залёт @конкурент · 840K просмотров (×6 к медиане)\nХук было: «Я потратил 100к на рекламу…»\nХук стало: «100 тысяч в рекламу — и ни одной заявки. Вот почему»\nСценарий 2.0 ✓ проверка скилла · стиль: Стекло', buttons: ['✅ Одобрить', '✏️ Править', '🔄 Хук', '♻️ Другой', '⏰ Слот', '🎨 Стиль'] }] },
      { title: 'Правка голосом', text: 'Ответ на карточку текстом или голосовым — Claude переписывает сценарий, остальное не трогает.',
        chat: [{ from: 'me', text: '🎤 добавь в конец кодовое слово «РЕКЛАМА»' }, { from: 'bot', text: '✏️ Сценарий обновлён: CTA с кодовым словом «РЕКЛАМА»', buttons: ['✅ Одобрить'] }] },
      { title: 'Готовое видео в ветке', text: 'После ✅ — аватар HeyGen и монтаж. Ролик приходит файлом, в слот — напоминание с подписью.', media: vid('glass-explainer') },
    ],
  },
  {
    slug: 'reel-turnkey', name: 'Рилс под ключ (конвейер офиса)', emoji: '🎬', category: 'video', status: 'production',
    pitch: 'Одна задача в офисе → сценарий → аватар → монтаж → подпись, на проверку только итог',
    forWhom: 'Когда нужен готовый рилс по теме или референсу, а не отдельный шаг: агенты сами передают работу друг другу.',
    input: 'Тема или ссылка на референс текстом/голосом в офисе hq2',
    output: 'out/rils.mp4 + подпись с хуком, CTA и хештегами + страница результата',
    steps: [
      { title: 'Диспетчер', detail: 'понимает задачу, спрашивает стиль монтажа, запускает конвейер', block: 'claude-code' },
      { title: 'Транскрибатор', detail: 'если есть ссылка на ролик — сначала расшифровка', block: 'transcriber' },
      { title: 'Сценарист', detail: 'сценарий до 60 с: хук за 2 с, кодовое слово, CTA', block: 'script' },
      { title: 'Аватар', detail: 'двойник Ильи в HeyGen, 9:16', block: 'heygen' },
      { title: 'Монтажёр', detail: 'титры, графика, хук на первом кадре — в выбранном стиле', block: 'montage' },
      { title: 'Публикатор + контролёр', detail: 'подпись и обложка; контролёр качества проверяет до владельца', block: 'claude-code' },
    ],
    blocks: ['claude-code', 'transcriber', 'script', 'heygen', 'montage'],
    launch: [{ label: 'hq2.aicex.club → ＋ Задача → «Рилс под ключ»', url: HQ, kind: 'office' }],
    projects: ['hq-office', 'studio-kadrik'],
    demo: [
      { title: 'Задача своими словами', text: 'В офисе hq2: «сделай рилс по этому ролику» + ссылка. Диспетчер сам выбирает конвейер и спрашивает стиль.', media: img('works/sites/hq2.jpg') },
      { title: 'Агенты передают работу', text: 'Каждый этап получает файлы и отчёты предыдущего: сценарий → аватар → монтаж → подпись. В 3D-офисе видно, кто сейчас несёт задачу.',
        io: { from: 'Сценарист → Аватар → Монтажёр', to: 'Публикатор' } },
      { title: 'На проверку — только итог', text: 'Владелец видит готовый ролик с подписью, затраты (время и $) и может принять или поправить голосом.', media: vid('explainer-panel') },
    ],
  },
  {
    slug: 'reels-cloner', name: 'Reels Cloner (/clone)', emoji: '🧬', category: 'video', status: 'production',
    pitch: 'Залетевший рилс конкурента → твой рилс с твоим аватаром за 5 минут',
    forWhom: 'Клиентам Транскрибации: быстрый клон чужого формата под свой аватар и голос.',
    input: '/clone <ссылка> в @your_transscribe_bot',
    output: 'Рилс с аватаром, субтитрами Hormozi, B-roll и зумами — файлом в Telegram',
    time: '4–7 минут',
    steps: [
      { title: 'Скачивание', detail: 'yt-dlp / Apify', block: 'transcriber' },
      { title: 'Whisper', detail: 'расшифровка', block: 'transcriber' },
      { title: 'Claude rewrite', detail: 'переписанный под тебя сценарий', block: 'script' },
      { title: 'HeyGen', detail: 'твой аватар и голос', block: 'heygen' },
      { title: 'Submagic', detail: 'субтитры Hormozi 2, B-roll, зумы → sendDocument', block: 'telegram' },
    ],
    blocks: ['transcriber', 'script', 'heygen', 'telegram'],
    launch: [t('your_transscribe_bot'), { label: 'Лендинг', url: 'https://landings.aicex.club/viral-clone/', kind: 'site' }],
    projects: ['viral-clone', 'office-worker', 'transcribe'],
    demo: [
      { title: 'Одна команда', text: 'Ссылка на чужой залёт — и всё.', chat: [{ from: 'me', text: '/clone https://www.instagram.com/reel/…' }, { from: 'bot', text: '⏳ Скачал · расшифровал · переписал сценарий · генерирую аватар…' }, { from: 'bot', text: '🎬 Готово — рилс.mp4 (58 с)' }] },
      { title: 'Под капотом', text: 'Обработчик viral_clone в Office Worker: очередь в Postgres, повтор при сбоях, sweep зависших задач.', io: { from: 'чужой рилс', to: 'твой рилс' } },
    ],
  },
  {
    slug: 'montage-skills', name: 'Монтаж рилсов скиллами', emoji: '✂️', category: 'video', status: 'production',
    pitch: 'Сырое видео → смонтированный рилс в одном из 48 стилей прямо в Telegram',
    forWhom: 'Эксперту, который снял говорящую голову: не нужен монтажёр, стиль выбирается по превью.',
    input: 'Видео в бот + выбор стиля в мини-аппе',
    output: 'Готовый рилс 9:16 с титрами и графикой; превью → «ок» или правка → финал',
    steps: [
      { title: 'Загрузка', detail: 'видео в @studio_kadrik_bot или @reelswithai_bot' },
      { title: 'Выбор стиля', detail: 'мини-апп: 48 стилей (Палий, Стикер, Журнал, Неон, Кобальт…)', block: 'montage' },
      { title: 'Монтаж', detail: 'очередь → Claude Code со скиллом стиля → превью', block: 'montage' },
      { title: 'Правка', detail: '«ок» или правка словами → финал; оплата Telegram Stars', block: 'telegram' },
    ],
    blocks: ['montage', 'claude-code', 'telegram'],
    launch: [t('studio_kadrik_bot'), t('reelswithai_bot'), { label: 'Мини-апп монтажа', url: 'https://montazh.aicex.club', kind: 'site' }, { label: 'Лендинг reels.aicex.club', url: 'https://reels.aicex.club', kind: 'site' }],
    projects: ['studio-kadrik', 'montazh-bot', 'skills-pack'],
    demo: [
      { title: 'Мини-апп выбора стиля', text: 'Каталог стилей с превью прямо в Telegram.', media: img('media/screens/montazh-miniapp.jpg', 'contain') },
      { title: 'Стиль «Палий»', text: 'Фирменный стиль рилсов Ильи.', media: img('media/montazh-styles/palii.jpg', 'contain') },
      { title: 'Стиль «Неон»', text: 'Неоновая схема поверх говорящей головы.', media: img('media/montazh-styles/neon.jpg', 'contain') },
      { title: 'Стиль «Журнал»', text: 'Редакционная вёрстка, крупная типографика.', media: img('media/montazh-styles/journal.jpg', 'contain') },
      { title: 'Студия Кадрика', text: 'Игровой мини-апп: опыт, квесты, карта стилей — и монтаж в той же вкладке.', media: img('media/screens/creator-pack.jpg', 'contain') },
    ],
  },
  {
    slug: 'silent-reels', name: 'Silent Reels', emoji: '🔇', category: 'video', status: 'beta',
    pitch: 'Любой клип из галереи → рилс без лица и голоса: текст, музыка, ритм',
    forWhom: 'Когда нет сил или желания сниматься: контент из готовых кадров.',
    input: 'Клип из галереи в @Sielencemode_bot',
    output: 'Рилс с текстом на экране и музыкой',
    steps: [
      { title: 'Клип', detail: 'любой ролик из галереи' },
      { title: 'Текст', detail: 'Claude пишет короткий текст-хук по смыслу', block: 'script' },
      { title: 'Сборка', detail: 'ffmpeg: текст, музыка, ритм нарезки', block: 'montage' },
    ],
    blocks: ['script', 'montage', 'telegram'],
    launch: [t('Sielencemode_bot')],
    projects: ['silent-reels'],
    demo: [
      { title: 'Пример', text: 'Клип без лица и голоса — смысл несёт текст на экране.', media: vid('silent-reel') },
      { title: 'С экраном телефона', text: 'Тот же формат на записи экрана.', media: vid('silent-reel-screen') },
    ],
  },

  // ── Карусели и тексты ────────────────────────────────────────────────────
  {
    slug: 'carousel-pro', name: 'Карусель Pro', emoji: '🖼️', category: 'carousel', status: 'production',
    pitch: 'Залетевшая карусель (своя или конкурента) → план → ✅ → готовые слайды 1080×1350',
    forWhom: 'Повторить успех каруселей: свои — ремикс с новой обложкой и хуком, чужие — их формат в стиле Ильи.',
    input: 'Ссылка на карусель или ежедневный поиск залётов',
    output: 'Слайды альбомом и файлами без сжатия + подпись',
    steps: [
      { title: 'Поиск', detail: 'свои карусели старше 14 дней и конкуренты; сила = (3×комментарии + лайки) / медиана', block: 'viral-search' },
      { title: 'План', detail: 'Claude видит слайды оригинала: разбор, новый хук, слайды keep/edit/new, кодовое слово', block: 'script' },
      { title: 'Карточка', detail: 'превью обложки в выбранном стиле, кнопки ✅ ✏️ 🔄 🎨', block: 'telegram' },
      { title: 'Рендер', detail: 'стили блога: Тёмный / Светлый @ilia.paliy, обложка с вашим фото', block: 'carousel' },
    ],
    blocks: ['viral-search', 'script', 'telegram', 'carousel'],
    launch: [t('caruselclaude_bot'), skill('carousel-pro'), { label: 'Офис hq2: агент каруселей', url: HQ, kind: 'office' }],
    projects: ['karusel-bot', 'remake-site'],
    demo: [
      { title: 'Мини-апп каруселей', text: '24 стиля и «Мой блог» в одном боте.', media: img('media/screens/karusel-miniapp.jpg', 'contain') },
      { title: 'Карточка с планом', text: 'Бот приносит разбор и план слайдов — с понятным числом слайдов.',
        chat: [{ from: 'bot', text: '📌 Своя карусель · 3,4K сохранений\nНовый хук: «7 нейросетей, которые заменили мне команду»\nСлайды: 1 new · 2–6 edit · 7 keep · 8 CTA\nКодовое слово: КОМАНДА', buttons: ['✅ Одобрить', '✏️ Править', '🔄 Хук', '🎨 Стиль'] }] },
      { title: 'Стиль «Палий»', text: 'Готовая обложка в стиле блога.', media: img('media/karusel-styles/palii.jpg', 'contain') },
      { title: 'Стиль «Кобальт»', text: 'Один из 24 стилей бота.', media: img('media/karusel-styles/kobalt.jpg', 'contain') },
    ],
  },
  {
    slug: 'link-to-artifacts', name: 'Видео → 4 артефакта', emoji: '🎙️', category: 'carousel', status: 'production',
    pitch: 'Одна ссылка на видео → карусель 8 слайдов, сценарий рилса, пост в TG и перевод',
    forWhom: 'Переупаковать любой длинный ролик в контент для всех площадок за пару минут.',
    input: 'Ссылка YouTube / Reels / TikTok или файл',
    output: 'IG-карусель 8×PNG, Reels-сценарий, Telegram-пост, перевод на 50+ языков',
    steps: [
      { title: 'Расшифровка', detail: 'yt-dlp + Whisper', block: 'transcriber' },
      { title: 'Генерация', detail: 'Claude: summarize / generate / translate', block: 'script' },
      { title: 'Карусель', detail: '8 слайдов PNG', block: 'carousel' },
    ],
    blocks: ['transcriber', 'script', 'carousel'],
    launch: [{ label: 'transcribe.aicex.club', url: 'https://transcribe.aicex.club/', kind: 'site' }, { label: 'Mini App', url: 'https://tma.aicex.club/', kind: 'site' }, t('your_transscribe_bot')],
    projects: ['transcribe'],
    demo: [
      { title: 'Приложение', text: 'Вставил ссылку — получил 4 артефакта. Free 60 мин/мес, Pro — Telegram Stars.', media: img('works/sites/transcribe.jpg') },
      { title: 'Что на выходе', text: 'Карусель, сценарий, пост и перевод из одного ролика.', io: { from: '1 видео', to: '4 артефакта' } },
    ],
  },
  {
    slug: 'offer-landing', name: 'Оффер → лендинг', emoji: '🧭', category: 'carousel', status: 'production',
    pitch: 'Идея продукта → оффер по Хормози → совет 8 легенд → продающий лендинг',
    forWhom: 'Запустить продукт быстро: сильный оффер, проверенный «легендами», и готовая страница с оплатой.',
    input: 'Продукт и аудитория текстом в офисе',
    output: 'offer-final.md + лендинг out/index.html (адаптив, блок оплаты/заявки)',
    steps: [
      { title: 'Оффер', detail: 'агент «Хормози»: уравнение ценности, бонусы, гарантия, цена и якорь', block: 'claude-code' },
      { title: 'Совет легенд', detail: 'Гэри Ви, Годин, Кеннеди, Кардон и др. оценивают и правят оффер', block: 'claude-code' },
      { title: 'Лендинг', detail: 'один из 5 стилей: Золото, Светлый, Неон, Постер, Изумруд', block: 'landing' },
    ],
    blocks: ['claude-code', 'landing'],
    launch: [{ label: 'hq2.aicex.club → ＋ Задача → «Оффер → лендинг»', url: HQ, kind: 'office' }, { label: 'Скиллы landing-gold / light / neon / poster / emerald', kind: 'skill' }],
    projects: ['hq-office', 'skills-pack', 'neuro-funnel'],
    demo: [
      { title: 'Переговорная легенд', text: '8 ИИ-советников по методам легенд бизнеса оценивают оффер и дают исправленную версию.', io: { from: 'черновик оффера', to: 'оффер-финал' } },
      { title: 'Лендинг «Золото»', text: 'Тёмный графит и золото, премиальная подача.', media: img('works/pages/landing-a1.jpg') },
      { title: 'Лендинг «Неон»', text: 'Электрический синий, технологичная подача.', media: img('works/pages/landing-a3.jpg') },
      { title: 'Лендинг «Изумруд»', text: 'Чёрный и изумрудный, «финтех».', media: img('works/pages/landing-a5.jpg') },
    ],
  },

  // ── Залёты и аналитика ───────────────────────────────────────────────────
  {
    slug: 'viral-discover', name: 'Залётный: топ конкурентов утром', emoji: '📡', category: 'research', status: 'production',
    pitch: 'Каждое утро в 08:00 — 5 рилсов и 5 каруселей конкурентов с оценкой «зайдёт у меня»',
    forWhom: 'Не листать ленту часами: лучшие идеи ниши приходят сами, с оценкой Claude 1–10.',
    input: 'Ниша и аккаунты конкурентов (wizard в боте)',
    output: 'Подборка в Telegram + кабинет со всеми находками',
    steps: [
      { title: 'Парсинг', detail: 'Apify по аккаунтам ниши, cron 08:00 МСК', block: 'viral-search' },
      { title: 'Оценка', detail: 'Claude ставит 1–10 «зайдёт у меня» и объясняет', block: 'script' },
      { title: 'Доставка', detail: 'топ-5 + топ-5 в Telegram, дальше — в Reels Cloner или Карусель Pro', block: 'telegram' },
    ],
    blocks: ['viral-search', 'script', 'telegram'],
    launch: [t('parser_instaa_bot'), { label: 'Кабинет parser.aicex.club', url: 'https://parser.aicex.club/', kind: 'site' }],
    projects: ['viral-discover', 'office-worker'],
    demo: [
      { title: 'Кабинет', text: 'Все найденные залёты и оценки.', media: img('works/sites/parser.jpg') },
      { title: 'Утренняя подборка', text: 'Пять рилсов и пять каруселей с оценкой.', chat: [{ from: 'bot', text: '☀️ Залётное за вчера\n1. @… — 1,1M · 9/10 «повтори хук про цену»\n2. @… — 640K · 8/10\n…' }] },
    ],
  },
  {
    slug: 'funnel-analytics', name: 'Сквозная аналитика', emoji: '📊', category: 'research', status: 'production',
    pitch: 'Meta Ads × вебинарная воронка × оплаты GetCourse по UTM — один дашборд',
    forWhom: 'Видеть, какая реклама и какой контент приносят деньги, а не просто клики.',
    input: 'Meta Ads API, GetCourse, UTM-метки',
    output: 'dashboard.aicex.club: декомпозиция воронки, доходы/расходы, контент; обновление каждые 3 часа',
    steps: [
      { title: 'Сбор', detail: 'Meta Ads и GetCourse по API', block: 'analytics' },
      { title: 'Сведение', detail: 'оплаты к кампаниям по UTM, шаги вебинарной воронки' },
      { title: 'Дашборд', detail: 'один статический HTML, cron каждые 3 часа' },
    ],
    blocks: ['analytics'],
    launch: [{ label: 'dashboard.aicex.club', url: 'https://dashboard.aicex.club/', kind: 'site' }],
    projects: ['funnel-analytics'],
    demo: [{ title: 'Дашборд', text: 'Воронка, реклама и оплаты на одной странице.', media: img('works/sites/dashboard.jpg') }],
  },
  {
    slug: 'morning-agents', name: 'Утренние агенты', emoji: '☀️', category: 'research', status: 'production',
    pitch: 'Каждое утро сами: статистика соцсетей за вчера и предупреждения по балансам сервисов',
    forWhom: 'Чтобы с утра знать, что залетело, и чтобы офис не встал из-за кончившихся кредитов.',
    input: 'Ничего — запускаются сами в 08:50 и 09:10 МСК',
    output: 'Отчёт в офисе + сообщение в Telegram',
    steps: [
      { title: 'Балансы и подписки (08:50)', detail: 'Anthropic, OpenAI, ElevenLabs, HeyGen, Apify, Deepgram, kie.ai, Meta Ads + даты продлений', block: 'analytics' },
      { title: 'Статистика соцсетей (09:10)', detail: 'Instagram, Threads, YouTube, TikTok, Telegram: охваты, приросты, что сработало и что делать сегодня', block: 'analytics' },
      { title: 'В Telegram', detail: 'итог или предупреждение владельцу; без проблем балансы закрываются молча', block: 'telegram' },
    ],
    blocks: ['analytics', 'claude-code', 'telegram'],
    launch: [{ label: 'Офис hq2: агенты billing и socialstats', url: HQ, kind: 'office' }, skill('social-daily-stats'), skill('service-balances')],
    projects: ['hq-office'],
    demo: [
      { title: 'Сообщение утром', text: 'Агент сам пишет, если что-то скоро кончится.', chat: [{ from: 'bot', text: '⚠️ Балансы: HeyGen — кредитов на ~4 дня, продлить до пятницы. Остальное в норме.' }, { from: 'bot', text: '📈 Вчера: Instagram +312 подписчиков, лучший рилс — «Claude vs GPT» (184K). Сегодня: повторить формат сравнения.' }] },
    ],
  },
  {
    slug: 'threads-funnel', name: 'Threads → Telegram', emoji: '🧵', category: 'research', status: 'dev',
    pitch: 'Виральные ветки Threads → адаптация под стиль → 3 ветки в день → подписчики в канал',
    forWhom: 'Рост в Threads с переводом аудитории в свой Telegram-канал.',
    input: 'Ниша и стиль Ильи',
    output: '3 карточки веток в день в Telegram, публикация через Threads API, перевыпуск победителей',
    steps: [
      { title: 'Дискавери', detail: 'Apify, xn = просмотры / медиана автора', block: 'viral-search' },
      { title: 'Адаптация', detail: 'Claude в стиле Ильи + проверка похожести на оригинал', block: 'script' },
      { title: 'Карточки', detail: '3 ветки в день в теме «Threads», ✅ → публикация', block: 'telegram' },
      { title: 'Обучение', detail: 'победители перевыпускаются, Reply Engine отвечает в комментариях' },
    ],
    blocks: ['viral-search', 'script', 'telegram'],
    launch: [{ label: 'Код apps/threads-growth', url: `${GH}apps/threads-growth`, kind: 'code' }],
    projects: ['threads-growth'],
    demo: [{ title: 'Карточка ветки', text: 'WIP: связка собрана, не задеплоена.', chat: [{ from: 'bot', text: '🧵 Ветка 2/3 · xn 7,4\n«Я уволил SMM и взял 3 нейросети. Месяц спустя…»', buttons: ['✅ Опубликовать', '✏️ Править', '🗑'] }] }],
  },

  // ── Продажи и воронки ────────────────────────────────────────────────────
  {
    slug: 'direct-ai', name: 'ИИ в Директе', emoji: '💬', category: 'sales', status: 'production',
    pitch: 'Кодовое слово в Instagram → ИИ-менеджер выдаёт материал и ведёт к покупке',
    forWhom: 'Обработать сотни сообщений из рилсов с кодовыми словами без менеджера.',
    input: 'Кодовое слово в комментарии или Директе',
    output: 'Ответ в тоне Ильи, бесплатный материал из каталога (48 штук), лид в воронку',
    steps: [
      { title: 'Триггер', detail: 'воронки кодовых слов в ChatPlace', block: 'chatplace' },
      { title: 'Ответ', detail: 'ИИ-агент по базе знаний и тематическим правилам', block: 'chatplace' },
      { title: 'Разбор недели', detail: 'скилл direct-ai-weekly-review: отчёт с правками, правки после «ок»' },
    ],
    blocks: ['chatplace'],
    launch: [{ label: 'ChatPlace (ИИ-агенты)', kind: 'site' }, { label: 'Скилл direct-ai-weekly-review', kind: 'skill' }],
    projects: ['direct-ai'],
    demo: [{ title: 'Диалог', text: 'Пример ответа на кодовое слово.', chat: [{ from: 'me', text: 'КОМАНДА' }, { from: 'bot', text: 'Держи гайд «7 нейросетей вместо команды» 👇 Кстати, чем занимаешься — подскажу, с какой начать.' }] }],
  },
  {
    slug: 'neuro-funnel', name: 'Нейроворонка', emoji: '🧲', category: 'sales', status: 'dev',
    pitch: 'Продающие рилсы → лид-магнит → бот с прогревом → лендинг → оплата → аналитика',
    forWhom: 'Полная воронка продаж эксперта, собранная из готовых модулей.',
    input: 'Продукт, офер, контент',
    output: 'Рилсы, лид-магниты «Воронка» / «Клон» / «Поток», бот с прогревом, лендинг, дашборд',
    steps: [
      { title: 'Трафик', detail: 'продающие рилсы (связки видео) и Meta Ads' },
      { title: 'Лид-магнит', detail: 'кодовое слово → материал', block: 'chatplace' },
      { title: 'Прогрев', detail: 'Telegram-бот: сообщения до и после оплаты', block: 'telegram' },
      { title: 'Продажа', detail: 'лендинг эксперта в одном из 5 стилей', block: 'landing' },
      { title: 'Аналитика', detail: 'Сквозная аналитика', block: 'analytics' },
    ],
    blocks: ['chatplace', 'telegram', 'landing', 'analytics'],
    launch: [{ label: 'Артефакт «Нейроворонка»', url: 'https://claude.ai/artifact/6z4UBbZhGNcCpVmJUp487P', kind: 'site' }],
    projects: ['neuro-funnel', 'funnel-analytics', 'marketing'],
    demo: [
      { title: 'Лендинг «Светлый»', text: 'Один из пяти стилей лендинга воронки.', media: img('works/pages/landing-a2.jpg') },
      { title: 'Лендинг «Постер»', text: 'Плакатная подача.', media: img('works/pages/landing-a4.jpg') },
    ],
  },
  {
    slug: 'tg-group-agent', name: 'ИИ-агент Telegram-группы', emoji: '🤖', category: 'sales', status: 'production',
    pitch: 'Каждое сообщение группы классифицируется: ответ по базе, спам, лид или черновик владельцу',
    forWhom: 'Сообществам и чатам курсов: вопросы закрываются сами, лиды не теряются.',
    input: 'Сообщения в группе / темах форума',
    output: 'Ответы, удалённый спам, лиды в CRM, черновики на одобрение кнопкой',
    steps: [
      { title: 'Классификатор', detail: 'Claude Haiku: вопрос / спам / лид / черновик' },
      { title: 'Ответ', detail: 'по базе знаний; агенты по темам форума' },
      { title: 'Эскалация', detail: 'владельцу с inline-approval', block: 'telegram' },
    ],
    blocks: ['telegram'],
    launch: [t('newnewnnn_bot'), { label: 'Админка tg.aicex.club', url: 'https://tg.aicex.club/', kind: 'site' }],
    projects: ['tg-agent'],
    demo: [{ title: 'В группе', text: 'Агент отвечает сам, сложное — владельцу.', chat: [{ from: 'me', text: 'А запись эфира будет?' }, { from: 'bot', text: 'Да, запись придёт в бот в течение часа после эфира 👌' }] }],
  },
  {
    slug: 'ai-seller', name: 'AI-продавец IG + TG', emoji: '💼', category: 'sales', status: 'beta',
    pitch: 'ИИ ведёт диалог от «привет» до оплаты, голосом и кружками, оператор — только 13%',
    forWhom: 'Отделу продаж: прогрев, работа с возражениями и эскалация на человека.',
    input: 'Диалоги Instagram Direct и Telegram',
    output: 'Воронка из 8 стадий, оценка лидов, CRM с 7 экранами',
    steps: [
      { title: 'Диалог', detail: 'hello → discovery → pitch → objections → close → followup' },
      { title: 'Голос', detail: 'голосовые и видео-кружки клоном Ильи', block: 'voice' },
      { title: 'CRM', detail: 'Pulse / Inbox / Pipeline / Journey / Agents / Reports' },
    ],
    blocks: ['voice'],
    launch: [{ label: 'CRM crm.aicex.club', url: 'https://crm.aicex.club/', kind: 'site' }, { label: 'API sales-api.aicex.club', url: 'https://sales-api.aicex.club/docs', kind: 'site' }],
    projects: ['ai-sales', 'aisales-v2'],
    demo: [{ title: 'Как работает', text: 'ИИ закрывает типовые диалоги, сложные передаёт оператору.', io: { from: 'диалог в Директе', to: 'оплата или оператор' } }],
  },

  // ── Офис агентов ─────────────────────────────────────────────────────────
  {
    slug: 'office-desk', name: 'Задача агенту в живом офисе', emoji: '🏙️', category: 'office', status: 'production',
    pitch: 'Задача голосом или текстом → диспетчер → агент со скиллами → контроль качества → вам на проверку',
    forWhom: 'Владельцу: ставить работу команде из 34 ИИ-агентов как живым людям и видеть, кто что делает.',
    input: 'Задача своими словами + файлы/ссылки',
    output: 'Готовая работа (страница, видео, карусель, документ) с отчётом и затратами; уходит в историю',
    steps: [
      { title: 'Диспетчер', detail: 'выбирает агента и скилл, пишет ТЗ, спрашивает стиль для видео и каруселей', block: 'claude-code' },
      { title: 'Агент', detail: 'Claude Code со скиллами команды на сервере, учитывает свои прошлые уроки', block: 'claude-code' },
      { title: 'Контролёр качества', detail: 'проверяет первую сдачу, при необходимости — одна доработка' },
      { title: 'Проверка владельцем', detail: '«Принять» с оценкой или правка голосом; правки становятся уроками агента' },
    ],
    blocks: ['claude-code', 'transcriber'],
    launch: [{ label: 'hq2.aicex.club', url: HQ, kind: 'office' }],
    projects: ['hq-office'],
    demo: [
      { title: '3D-офис «Волна»', text: '7 стеклянных комнат отделов, диспетчерская в центре, переговорная легенд. Агенты носят друг другу работы.', media: img('works/sites/hq2.jpg') },
      { title: 'Маршрут задачи', text: 'Поставлена → Диспетчер → (Транскрибатор) → агент → ваша проверка → готово. Видно время и $ на каждую задачу.', io: { from: 'задача словами', to: 'готовая работа' } },
      { title: 'Режим гостя', text: 'Без входа офис показывает готовые решения и живые задачи — без кода и ноу-хау. Можно давать ссылку клиентам.' },
    ],
  },
  {
    slug: 'digital-twin', name: 'Цифровой двойник', emoji: '🧠', category: 'office', status: 'beta',
    pitch: 'Голосовой двойник, который знает весь бизнес Ильи и ставит задачи Claude Code',
    forWhom: 'Разговаривать с офисом голосом: спросить про проект, поставить задачу, принять результат.',
    input: 'Голос или текст, картинки, камера («посмотри»)',
    output: 'Ответ голосом клона, задачи агентам, память о бизнесе',
    steps: [
      { title: 'Знания', detail: 'реестр проектов, README и CLAUDE.md, лендинги, скиллы + свои материалы', block: 'claude-code' },
      { title: 'Разговор', detail: 'потоковый голос: распознавание ElevenLabs, ответ клоном', block: 'voice' },
      { title: 'Пульт Claude Code', detail: 'запускает задачи, отвечает на вопросы агентов, принимает работу', block: 'claude-code' },
    ],
    blocks: ['voice', 'claude-code'],
    launch: [{ label: 'hq2.aicex.club/twin/', url: HQ + 'twin/', kind: 'office' }, { label: 'Голограмма в офисе', url: HQ, kind: 'office' }],
    projects: ['digital-twin', 'hq-office'],
    demo: [
      { title: 'Утро с двойником', text: 'Без входа — демо-сценарий; владелец говорит вживую.', chat: [{ from: 'me', text: '🎤 что у нас сегодня горит?' }, { from: 'bot', text: 'Два ролика ждут вашей проверки, HeyGen кончится через 4 дня. Запустить ремейк вчерашнего залёта?' }] },
      { title: 'Голограмма в офисе', text: 'Двойник появляется над диспетчерской, поворачивается к агентам, о которых говорит, и видит рабочий стол.' },
    ],
  },
]

export const bundleBySlug = (slug: string) => BUNDLES.find(b => b.slug === slug)
export const blockById = (id: BlockId) => BLOCKS.find(b => b.id === id)!
