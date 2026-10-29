// Реестр всех проектов AICEX — источник правды для дашборда https://projects.aicex.club/dashboard.
// Каждый проект: что это, где живёт (сервер, контейнер/служба, домен), как деплоится, связи с другими
// проектами и все ссылки (сайты, боты, админки, API, код, документы, артефакты Claude).
// Залить в дашборд: `node apps/command-center/registry/sync.mjs --apply` (без флага — пробный прогон).
// Общая карта архитектуры — docs/ARCHITECTURE.md.

const GH = 'https://github.com/kleber2009-alt/ai-command-center'
const LIB = 'https://github.com/kleber2009-alt/aicex-library/tree/main/'

const live = (url, label) => ({ url, kind: 'live', label })
const admin = (url, label) => ({ url, kind: 'admin', label })
const api = (url, label) => ({ url, kind: 'api', label })
const docs = (url, label) => ({ url, kind: 'docs', label })
const other = (url, label) => ({ url, kind: 'other', label })
const bot = name => ({ url: `https://t.me/${name}`, kind: 'other', label: `@${name}` })
const art = (id, label) => ({ url: `https://claude.ai/artifact/${id}`, kind: 'docs', label: `Артефакт: ${label}` })
const code = (path, label = 'Код') => ({ url: `${GH}/tree/main/${path}`, kind: 'repo', label })
const md = (path, label) => ({ url: `${GH}/blob/main/${path}`, kind: 'docs', label })
const lib = (path, label) => ({ url: LIB + path, kind: 'repo', label })
const wf = (file, label = `Деплой: ${file}`) => ({ url: `${GH}/actions/workflows/${file}`, kind: 'admin', label })
const arch = md('docs/ARCHITECTURE.md', 'Архитектура AICEX')

export const projects = [
  // ── Карта всего ──────────────────────────────────────────────────────────
  {
    slug: 'architecture', name: 'Архитектура AICEX', emoji: '🗺️', status: 'production', sort_order: 1,
    tagline: 'Карта всех серверов, доменов, проектов, ботов и связок в одном месте',
    description:
      'Сводная карта инфраструктуры. Сервер aicex (Hetzner 157.180.33.173, Caddy, *.aicex.club): Docker-проекты infra / aisales / tg-agent / ai-hub / ig-content / command-center, ' +
      'статика hq2, remake, dashboard, лендинги, finance-os; боты на systemd под пользователем iliapaliy (Студия Кадрика, Creator Pack, монтаж, карусели, Silent Reels, hq-runner) ' +
      'с общей очередью тяжёлых задач heavy_slot и Claude-логином. Через Cloudflare: hq, skills, marketing, reels, montazh, studio; kadrik — cloudflared-туннель. ' +
      'Базы: aisales-postgres (aisales, ai_hub, ig_agent), infra-postgres-1 (aio — Транскрибация). Код: монорепо ai-command-center (apps/, landings/, .github/workflows/) ' +
      'и закрытая библиотека aicex-library (110 скиллов, 28 проектов). Старый сервер 46.62.215.11 (nip.io) больше не отвечает — все ссылки на *.aicex.club.',
    technologies: ['Hetzner', 'Caddy 2', 'Cloudflare', 'Docker Compose', 'systemd', 'Postgres', 'GitHub Actions'],
    links: [
      arch,
      md('CLAUDE.md', 'Навигация по монорепо (CLAUDE.md)'),
      { url: GH, kind: 'repo', label: 'Монорепо ai-command-center' },
      lib('', 'Библиотека AICEX (закрыто)'),
      code('.github/workflows', 'Все деплой-воркфлоу'),
      md('docs/backup-restore.md', 'Бэкапы и восстановление'),
      live('https://projects.aicex.club/dashboard', 'Этот дашборд'),
      live('https://hq2.aicex.club', 'Живой офис агентов'),
    ],
  },

  // ── Флагманские продукты ─────────────────────────────────────────────────
  {
    slug: 'ai-office', name: 'AI Growth Office', emoji: '🏢', status: 'production', sort_order: 10,
    tagline: 'AI-команда из 169 агентов под нишу клиента за 48ч',
    description:
      'SaaS-«AI-команда»: проактивные daily/weekly/monthly артефакты в голосе клиента, не реактивная переписка. Day-0 +23min голосовое от Ани (ElevenLabs клон) — момент истины. ' +
      'ICP: эксперт онлайн-школы 50к–1М ₽/мес. North star — WFDS (Weekly Founder Deliverables Shipped). Pro 1990 / Builder 5900 / Architect 14900 ₽/мес.\n\n' +
      'Архитектура: контейнер infra-ai-office-1 (проект infra) → office.aicex.club; Mini App /mini-app/; фоновая работа — Office Worker (infra-aisales-worker-1, /worker/*). ' +
      'БД aisales. Голос — AI Voice Bot и Persona Train (общая таблица voices).',
    technologies: ['Next.js', 'Node.js', 'ElevenLabs', 'Telegram', 'Make.com', 'Supabase', 'Postgres'],
    links: [
      live('https://office.aicex.club/', 'Сайт'),
      live('https://office.aicex.club/mini-app/', 'Mini App'),
      admin('https://office.aicex.club/worker/wfds', 'WFDS'),
      bot('AI_Growth_Office_Bot'),
      code('apps/ai-office'), md('apps/ai-office/CLAUDE.md', 'CLAUDE.md'),
    ],
  },
  {
    slug: 'transcribe', name: 'Транскрибация', emoji: '🎙️', status: 'production', sort_order: 20,
    tagline: 'YouTube/Reels/TikTok → 4 артефакта (карусель, Reels-сценарий, TG-пост, перевод)',
    description:
      'Расшифровка любого видео по ссылке в 4 артефакта: IG-карусель 8×PNG, Reels-сценарий, TG-пост, перевод на 50+ языков. Доп.фича: /clone <url> — viral_clone pipeline ' +
      '(yt-dlp → Whisper → Claude rewrite → HeyGen → Submagic Hormozi 2). Free 60 мин/мес, Pro 750⭐/30 дней через Telegram Stars.\n\n' +
      'Архитектура: контейнер infra-transcribe-1 (Next.js), БД aio в infra-postgres-1, скачивание через yt-dlp service и Apify; Mini App tma.aicex.club. Деплой deploy-transcribe.yml.',
    technologies: ['Next.js', 'Whisper', 'Claude', 'HeyGen', 'Submagic', 'Telegram Stars', 'TMA', 'Postgres'],
    links: [
      live('https://transcribe.aicex.club/', 'Приложение'),
      live('https://tma.aicex.club/', 'Mini App'),
      live('https://landings.aicex.club/transcribe/', 'Лендинг'),
      bot('your_transscribe_bot'),
      code('apps/transcribe'), md('apps/transcribe/CLAUDE.md', 'CLAUDE.md'), wf('deploy-transcribe.yml'),
    ],
  },
  {
    slug: 'viral-clone', name: 'Reels Cloner', emoji: '🎬', status: 'production', sort_order: 30,
    tagline: 'Залетевший Reels конкурента → твой Reels за 5 минут',
    description:
      'Pipeline в @your_transscribe_bot: /clone <url> → yt-dlp/Apify → Whisper → Claude rewrite → HeyGen (твой аватар + голос) → Submagic (Hormozi 2 + B-rolls + зумы) → TG sendDocument. ' +
      'End-to-end 4-7 мин.\n\nАрхитектура: обработчик viral_clone + viral_clone_sweep в Office Worker (контейнер infra-aisales-worker-1), очередь FOR UPDATE SKIP LOCKED в БД aisales.',
    technologies: ['yt-dlp', 'Apify', 'Whisper v3', 'Claude Opus', 'HeyGen', 'Submagic', 'Telegram Bot API', 'ElevenLabs'],
    links: [
      live('https://t.me/your_transscribe_bot', '/clone в боте'),
      live('https://landings.aicex.club/viral-clone/', 'Лендинг'),
      { url: `${GH}/blob/main/apps/infra-worker/handlers/viral_clone.js`, kind: 'repo', label: 'Код обработчика' },
    ],
  },
  {
    slug: 'remake-site', name: 'Ремейк залёта', emoji: '🔁', status: 'production', sort_order: 32,
    tagline: 'Свой залетевший рилс → новый сценарий → аватар HeyGen → монтаж Кадрика',
    description:
      'Скилл remake-top-reel и сайт remake.aicex.club. Вкладка «Прогоны» — как топ-рилс @ilia.paliy (говорящая голова с кодовым словом) превращается в новый: отбор, расшифровка, ' +
      'сценарий «было/стало», проверка, аватар, монтаж. Вкладка «Студия» (по паролю): референс файлом или ссылкой → расшифровка ElevenLabs → «Сценарий 2.0» Claude с гейтом скилла → ' +
      'образ и голос из HeyGen → монтаж через API Студии Кадрика → скачать 1080×1920.\n\n' +
      'Архитектура: контейнеры aicex-remake-site (статика) и aicex-remake-api (node + ffmpeg + python3 + yt-dlp, server.mjs + studio.mjs), блок /opt/edge/sites/remake-site.caddy. ' +
      'Секреты REMAKE_SITE_TOKEN/PASSWORD, ключи HeyGen/ElevenLabs/Anthropic; ключ монтажа — из .env Кадрика. Деплой deploy-remake-site.yml.',
    technologies: ['Node.js', 'ffmpeg', 'yt-dlp', 'ElevenLabs', 'HeyGen', 'Claude', 'Caddy'],
    links: [
      live('https://remake.aicex.club', 'Сайт: прогоны и студия'),
      api('https://remake.aicex.club/api/health', 'API health'),
      art('TzpSjDViTsbwJqjJ8bmRtf', 'Ремейк залёта (прогоны)'),
      code('apps/remake-site'), code('.claude/skills/remake-top-reel', 'Скилл remake-top-reel'),
      md('apps/remake-site/CLAUDE.md', 'CLAUDE.md'), wf('deploy-remake-site.yml'),
    ],
  },
  {
    slug: 'ai-hub', name: 'AI Creative Hub', emoji: '🎨', status: 'dev', sort_order: 40,
    tagline: 'Агрегатор 16 нейросетей с единым token-кошельком',
    description:
      'SaaS-агрегатор: image/video/upscale Topaz/face-swap/nano-banana/карусель/reels-script. Provider’ы: fal.ai, Replicate, kie.ai. Wallet — race-free через 4 атомарные SECURITY DEFINER функции Postgres. ' +
      'Onboarding-бонус 100 токенов. /admin с 6 табами.\n\nАрхитектура: проект ai-hub (ai-hub-web, ai-hub-worker на BullMQ, mailpit), БД ai_hub в aisales-postgres, MinIO ai-hub-media. Деплой deploy-ai-hub.yml.',
    technologies: ['Next.js 14', 'TypeScript', 'Drizzle', 'Auth.js v5', 'Postgres', 'BullMQ', 'MinIO', 'Stripe', 'Telegram Stars'],
    links: [
      live('https://aihub-app.aicex.club/', 'Приложение'),
      live('https://aihub.aicex.club/', 'Лендинг'),
      bot('aicex_one_bot'),
      code('apps/ai-hub'), md('apps/ai-hub/CLAUDE.md', 'CLAUDE.md'), wf('deploy-ai-hub.yml'),
    ],
  },
  {
    slug: 'aisales-v2', name: 'AI Sales v2', emoji: '💼', status: 'dev', sort_order: 40,
    tagline: 'AI-продавец Алиса для IG/TG: диалоги, прогрев, эскалация',
    description:
      'FastAPI-стек для автоматизации продаж в директ Instagram и Telegram. Голосовые, видео-кружки (wav2lip), voice clone Ильи (ElevenLabs), сегментация клиентов, оценка лидов, эскалация на оператора. ' +
      'Воронка по 8 стадиям (hello → discovery → pitch → objections → close → followup).\n\nАрхитектура: контейнер aisales-api-v2 (:8001), compose /home/aisales/aisales-v2-compose; БД aisales, Redis, Qdrant, MinIO.',
    technologies: ['FastAPI', 'Postgres', 'Redis', 'Qdrant', 'MinIO', 'Anthropic', 'ElevenLabs', 'Sieve'],
    links: [
      api('https://sales-api.aicex.club/', 'API'),
      docs('https://sales-api.aicex.club/docs', 'Swagger'),
      code('apps/ai-sales-v2', 'Код (compose v2)'),
    ],
  },
  {
    slug: 'aisales-v1', name: 'AI Sales v1', emoji: '📞', status: 'paused', sort_order: 50,
    tagline: 'Первая версия AI-продавца (legacy)',
    description: 'Базовый FastAPI-сервис с моделями client/conversation/message/action. Proof-of-concept, работает параллельно с v2 для постепенной миграции.',
    technologies: ['FastAPI', 'Postgres', 'SQLAlchemy'],
    links: [code('apps/ai-sales/code', 'Код (v1)')],
  },
  {
    slug: 'voice-bot', name: 'AI Voice Bot', emoji: '🎤', status: 'production', sort_order: 50,
    tagline: 'Telegram-бот для тренировки голосового клона',
    description:
      'Telegram-бот @aio_voice_bot для onboarding голосового клона ElevenLabs: пользователь шлёт голосовые → датасет → voice ID → подключается к AI Sales / AI Office. ' +
      'Привязка через one-time token на /persona-train.\n\nАрхитектура: общая таблица voices с AI Office и Persona Train; исходников бота в монорепо нет.',
    technologies: ['Telegram Bot API', 'Node.js', 'ElevenLabs', 'Fastify'],
    links: [bot('aio_voice_bot'), live('https://persona-train.aicex.club/', 'Persona Train')],
  },
  {
    slug: 'mini-app', name: 'AI Office Mini App', emoji: '📱', status: 'dev', sort_order: 60,
    tagline: 'Telegram Mini App для AI Growth Office',
    description: 'Telegram Mini App обёртка для сайта AI Growth Office (URL office.aicex.club/mini-app/): квиз, pricing, dashboard внутри Telegram. Живёт в контейнере infra-ai-office-1.',
    technologies: ['Telegram Mini App', 'HTML', 'Telegram WebApp SDK'],
    links: [live('https://office.aicex.club/mini-app/', 'Mini App'), other('https://t.me/AI_Growth_Office_Bot/app', 'Открыть в Telegram'), md('docs/TELEGRAM_MINI_APP.md', 'Гайд по TMA')],
  },
  {
    slug: 'ai-sales', name: 'AI Sales System', emoji: '💼', status: 'production', sort_order: 70,
    tagline: 'AI закрывает 87% диалогов в IG+TG. Ты — 13%.',
    description:
      'CRM/dashboard для команды продаж + AI-агенты под клиентов. 7 экранов: Pulse / Inbox / Pipeline / Journey / Conversation / Agents / Reports.\n\n' +
      'Архитектура: статика /var/www/aisales-dashboard/ + FastAPI aisales-api-v2 (:8001); проект aisales (aisales-command-center, postgres, redis, qdrant, minio). Деплой deploy-ai-sales.yml.',
    technologies: ['FastAPI', 'Postgres', 'Redis', 'Qdrant', 'MinIO', 'HTML', 'Caddy'],
    links: [
      admin('https://crm.aicex.club/', 'CRM-дашборд'),
      live('https://sales.aicex.club/', 'Портал'),
      api('https://sales-api.aicex.club/health', 'API'),
      live('https://landings.aicex.club/aisales/', 'Лендинг'),
      live('https://landings.aicex.club/aisales-system/', 'Лендинг System'),
      code('apps/ai-sales'), md('apps/ai-sales/CLAUDE.md', 'CLAUDE.md'), wf('deploy-ai-sales.yml'),
    ],
  },
  {
    slug: 'ytdlp', name: 'yt-dlp service', emoji: '⬇️', status: 'production', sort_order: 70,
    tagline: 'Микросервис для скачивания YouTube/IG/TikTok',
    description: 'FastAPI + yt-dlp, POST /extract. Fallback для Транскрибации при rate-limit YouTube и для IG/TikTok/X. API-key auth, блокировка internal-IP. Контейнер infra-ytdlp-1, деплой deploy-ytdlp.yml.',
    technologies: ['Python', 'FastAPI', 'yt-dlp'],
    links: [code('apps/ytdlp'), md('apps/ytdlp/CLAUDE.md', 'CLAUDE.md'), wf('deploy-ytdlp.yml')],
  },
  {
    slug: 'infra', name: 'Infra', emoji: '🛠', status: 'production', sort_order: 80,
    tagline: 'Сервер aicex: Docker, Caddy, Postgres, бэкапы',
    description:
      'Hetzner 157.180.33.173 (*.aicex.club). docker-compose проекты infra / aisales / aisales-v2 / tg-agent / ai-hub / ig-content; Caddy с Let’s Encrypt; ' +
      'бэкапы pg_backup (03:17 UTC, БД aisales) и aux_backup (03:40 UTC: aio, SQLite tg-agent/transcribe, voice_notes) в MinIO (30 дней) + 7 дней локально.',
    technologies: ['Docker Compose', 'Caddy 2', 'Postgres 16', 'Redis 7', 'Qdrant', 'MinIO', 'Hetzner'],
    links: [
      code('infra', 'Compose и Caddy'), code('infra/snippets', 'Caddyfile snippets'), code('infra/backup', 'Backup scripts'),
      code('scripts', 'Скрипты бэкапа и деплоя'), md('docs/backup-restore.md', 'Runbook восстановления'), arch,
    ],
  },
  {
    slug: 'tg-agent', name: 'TG Agent', emoji: '🤖', status: 'production', sort_order: 80,
    tagline: 'Telegram-бот для групп с авто-классификацией и ответами',
    description:
      'AI-агент для Telegram-групп: классифицирует сообщения (вопрос / спам / лид / draft-for-owner), отвечает по базе знаний, эскалирует владельцу с inline-approval; агенты по темам форума и аналитик в личке. ' +
      'Magic-link админка, daily backup в Telegram, health-monitor.\n\nАрхитектура: контейнер tg-agent (Node + SQLite + Hono), Claude Haiku 4.5. Бот владельца также шлёт уведомления ig-agent. Деплой deploy-tg-agent.yml.',
    technologies: ['Node.js', 'TypeScript', 'SQLite', 'Hono', 'Anthropic', 'Telegram Bot API'],
    links: [
      admin('https://tg.aicex.club/', 'Админка'),
      live('https://landings.aicex.club/tg-agent/', 'Лендинг'),
      bot('newnewnnn_bot'),
      code('apps/tg-agent'), md('apps/tg-agent/CLAUDE.md', 'CLAUDE.md'), wf('deploy-tg-agent.yml'),
    ],
  },
  {
    slug: 'legal-site', name: 'Legal Site', emoji: '⚖️', status: 'production', sort_order: 90,
    tagline: 'Лендинг юридической компании (Next.js + Netlify)',
    description: 'Статический сайт юридической компании: hero, услуги, страница для пенсионеров, контакты в Telegram + WhatsApp. Static export, деплой на Netlify. Живёт в ветке claude/legal-company-site-Iy5a0.',
    technologies: ['Next.js 14', 'TypeScript', 'Tailwind', 'Netlify', 'Static export'],
    links: [
      { url: `${GH}/tree/claude/legal-company-site-Iy5a0/legal-site`, kind: 'repo', label: 'Repo (ветка)' },
      admin('https://app.netlify.com', 'Netlify dashboard'),
    ],
  },
  {
    slug: 'persona-studio', name: 'Persona Studio', emoji: '🪞', status: 'dev', sort_order: 90,
    tagline: 'AI-контент из твоего лица за 2 минуты',
    description:
      'AI Avatar Content Studio: 1 фото → 10 аватаров → HeyGen/OmniHuman-видео, обложки и карусели. Версия 2.0: тренды ниши, метрики, атрибуция, единая цена, свой клон голоса, ' +
      'генеративный воркспейс (бриф → сценарий → ролик → контент-план), «Блогеры / Шпион», автопостинг IG+TG, встроенные скиллы монтажа и каруселей.\n\n' +
      'Архитектура: persona-studio-web + persona-studio-worker (avatar/cover, BullMQ, Gemini), файлы через S3; монтаж — через серверное API Студии Кадрика (/api/ext/*). Деплой deploy-persona-studio.yml, лендинг deploy-persona-landing.yml.',
    technologies: ['Next.js', 'HeyGen', 'OmniHuman', 'nano-banana', 'Replicate', 'Gemini', 'BullMQ', 'S3'],
    links: [
      live('https://studio.aicex.club/', 'Приложение'),
      live('https://landings.aicex.club/persona-studio/', 'Лендинг'),
      art('D1kTgCx8mQCTV3utcJdxFq', 'Persona Studio 2.0'),
      art('2aVDVGGJfK9uSgSz4kgYyV', 'Гайд для клиента'),
      code('apps/persona-studio'), md('apps/persona-studio/CLAUDE.md', 'CLAUDE.md'), wf('deploy-persona-studio.yml'),
    ],
  },
  {
    slug: 'viral-discover', name: 'Залётный (Viral Discover)', emoji: '📡', status: 'production', sort_order: 100,
    tagline: 'Топ-5 рилсов + топ-5 каруселей конкурентов утром в Telegram',
    description:
      'Ежедневный парсер ниши: 5 рилсов + 5 каруселей конкурентов с Claude-оценкой 1-10 «зайдёт у меня». Cron 08:00 МСК. Wizard-onboarding через @parser_instaa_bot.\n\n' +
      'Архитектура: обработчик viral_discover + lib/parser_bot.js в Office Worker (infra-aisales-worker-1), Apify, БД aisales; кабинет parser.aicex.club.',
    technologies: ['Apify', 'Claude', 'Postgres', 'Telegram Bot API', 'cron'],
    links: [
      live('https://parser.aicex.club/', 'Кабинет'),
      live('https://landings.aicex.club/viral-discover/', 'Лендинг'),
      bot('parser_instaa_bot'),
      { url: `${GH}/blob/main/apps/infra-worker/handlers/viral_discover.js`, kind: 'repo', label: 'Код обработчика' },
    ],
  },
  {
    slug: 'ai-content-factory', name: 'AI Content Factory', emoji: '🏭', status: 'dev', sort_order: 110,
    tagline: 'Автономная фабрика IG-контента',
    description: 'Claude + RAG (Voyage + sqlite-vec) + Puppeteer: карусели и рилсы по расписанию, доставка в Telegram. Плановая генерация выключена, включается в кабинете. Контейнер infra-ai-content-factory-1.',
    technologies: ['TypeScript', 'Claude', 'Voyage', 'SQLite', 'Puppeteer'],
    links: [
      admin('https://factory.aicex.club/', 'Кабинет'),
      live('https://landings.aicex.club/ai-content-factory/', 'Лендинг'),
      code('apps/ai-content-factory'), md('apps/ai-content-factory/CLAUDE.md', 'CLAUDE.md'), md('docs/ai-content-factory-spec.md', 'Спецификация'),
    ],
  },
  {
    slug: 'ig-content', name: 'IG Serial Content', emoji: '📸', status: 'production', sort_order: 120,
    tagline: 'Серийный контент для Instagram',
    description: 'Next.js + 5 AI-агентов (стратег, рилсы, карусели, аналитика). Сейчас в демо-режиме: данные в памяти, без Supabase. Контейнер ig-content (host port 3017).',
    technologies: ['Next.js', 'Supabase', 'pgvector', 'Claude'],
    links: [live('https://ig.aicex.club/dashboard', 'Приложение (демо)'), code('apps/ig-content'), md('apps/ig-content/CLAUDE.md', 'CLAUDE.md')],
  },
  {
    slug: 'persona-train', name: 'Persona Train', emoji: '🗣️', status: 'dev', sort_order: 130,
    tagline: 'Обучение голоса и аватара',
    description: 'Клон голоса (ElevenLabs IVC) и образцы аватара; общая таблица voices с AI Office. Отдельный стек persona-train-web :3030, бот @ilia_pali0_bot. Деплой deploy-persona-train.yml.',
    technologies: ['Next.js', 'ElevenLabs', 'Postgres', 'Telegram'],
    links: [
      live('https://persona-train.aicex.club/', 'Кабинет'), bot('ilia_pali0_bot'),
      code('apps/persona-train'), md('apps/persona-train/CLAUDE.md', 'CLAUDE.md'), wf('deploy-persona-train.yml'),
    ],
  },
  {
    slug: 'funnel-analytics', name: 'Сквозная аналитика', emoji: '📊', status: 'production', sort_order: 140,
    tagline: 'Воронка × Meta Ads × оплаты',
    description:
      'Декомпозиция вебинарной воронки × Meta Ads × оплаты с UTM (GetCourse), расходы/доходы и контент в одном HTML.\n\n' +
      'Архитектура: Python stdlib (build.py, meta_api.py, getcourse.py, update.py) → статический dist/index.html в /var/www/funnel-analytics; cron каждые 3 часа (git pull + update.py) из deploy/setup-server.sh. ' +
      'Реальные данные — private/*.enc. Ручной воркфлоу update-funnel-analytics.yml.',
    technologies: ['Python', 'Meta Ads', 'GetCourse'],
    links: [
      live('https://dashboard.aicex.club/', 'Дашборд'),
      art('UzeN9sagWbM8We1yTWTmGf', 'Сквозная аналитика'),
      code('apps/funnel-analytics'), md('apps/funnel-analytics/CLAUDE.md', 'CLAUDE.md'), wf('update-funnel-analytics.yml'),
    ],
  },
  {
    slug: 'command-center', name: 'AI Command Center', emoji: '🎛', status: 'production', sort_order: 150,
    tagline: 'Этот дашборд — каталог всех проектов с roadmap',
    description:
      'Хаб проектов: описание, статус, ссылки, архитектура и редактируемый roadmap каждого проекта. Единая точка входа во всю инфраструктуру.\n\n' +
      'Архитектура: Next.js 14 (контейнер command-center, :3005), таблицы projects / project_milestones в БД aisales. Реестр в репозитории — apps/command-center/registry/projects.mjs, ' +
      'заливается скриптом registry/sync.mjs. Деплой deploy-command-center.yml.',
    technologies: ['Next.js 14', 'TypeScript', 'pg', 'Postgres', 'Tailwind'],
    links: [
      live('https://projects.aicex.club/dashboard', 'Дашборд'),
      api('https://projects.aicex.club/api/projects', 'API /api/projects'),
      code('apps/command-center'), code('apps/command-center/registry', 'Реестр проектов'), arch, wf('deploy-command-center.yml'),
    ],
  },
  {
    slug: 'office-worker', name: 'Office Worker', emoji: '⚙️', status: 'production', sort_order: 155,
    tagline: 'Cron + очередь: рассылки, /clone, Viral Discover',
    description:
      'Фоновый воркер AI Growth Office, 9 обработчиков: daily_briefing, weekly_recap, monthly_calendar, welcome_sequence, welcome_voice, subscription_expiry_check, viral_clone, viral_clone_sweep, viral_discover. ' +
      'Контейнер infra-aisales-worker-1, очередь FOR UPDATE SKIP LOCKED в БД aisales. Деплой deploy-infra-worker.yml.',
    technologies: ['Node.js', 'Fastify', 'Postgres', 'HeyGen', 'Submagic', 'Apify'],
    links: [
      api('https://office.aicex.club/worker/health', 'Health'),
      admin('https://office.aicex.club/worker/wfds', 'WFDS'),
      code('apps/infra-worker'), md('apps/infra-worker/CLAUDE.md', 'CLAUDE.md'), wf('deploy-infra-worker.yml'),
    ],
  },
  {
    slug: 'finance-os', name: 'Finance OS', emoji: '💰', status: 'production', sort_order: 160,
    tagline: 'Личные финансы: бот + Mini App',
    description: 'Отдельный стек на сервере aicex (/opt/finance-os): бот, Mini App, API, Postgres, бэкапы. Кода в монорепо нет.',
    technologies: ['Telegram', 'Mini App', 'Postgres'],
    links: [live('https://finance.aicex.club/', 'Mini App'), live('https://finance.157-180-33-173.nip.io/', 'Mini App (nip.io)')],
  },
  {
    slug: 'ig-agent', name: 'IG Agent', emoji: '📨', status: 'dev', sort_order: 170,
    tagline: 'ИИ-ответы в Instagram Direct через SendPulse',
    description:
      'Webhook SendPulse → классификатор и ответ Claude в тоне владельца, история в Postgres (БД ig_agent в aisales-postgres), магик-линк админка на базе дашборда AI Sales (Hono :8081), ' +
      'уведомления владельцу через бота tg-agent. Не задеплоен; в проде Директ ведёт ИИ-менеджер ChatPlace (см. «ИИ в Директе»).',
    technologies: ['Node.js', 'SendPulse', 'Claude', 'Postgres'],
    links: [code('apps/ig-agent'), md('apps/ig-agent/CLAUDE.md', 'CLAUDE.md')],
  },
  {
    slug: 'tg-viral-parser', name: 'TG Viral Parser', emoji: '📰', status: 'dev', sort_order: 180,
    tagline: 'Виральные посты TG-каналов → ревью → публикация',
    description: 'Парсинг каналов конкурентов через user-session (Telethon/MTProto), скоринг относительной виральности (Xn/Rn/Fn к медиане канала × recency), ревью в боте и публикация в канал. Не задеплоен.',
    technologies: ['Python', 'Telethon', 'Postgres'],
    links: [code('apps/tg-viral-parser'), md('apps/tg-viral-parser/CLAUDE.md', 'CLAUDE.md')],
  },
  {
    slug: 'threads-growth', name: 'Threads Growth Agent', emoji: '🧵', status: 'dev', sort_order: 190,
    tagline: 'Рост Threads: виралки → адаптация → публикация → воронка в Telegram',
    description:
      'Дискавери виралок (Apify), скоринг xn = views / медиана автора, адаптация под стиль Ильи с проверкой похожести, публикация и Reply Engine, warmup-ramp, самообучение. ' +
      'Воронка Threads → Telegram: 3 ветки в день карточками в TG, публикация через Threads API, перевыпуск победителей; ветка ведёт в канал своего материала.\n\n' +
      'Архитектура: FastAPI + Postgres/pgvector + Alembic, Claude/Voyage, n8n-кроны (/cron/funnel/<job>), approval_bot + funnel_bot. WIP, не задеплоен.',
    technologies: ['Python', 'FastAPI', 'pgvector', 'Claude', 'Apify', 'n8n', 'Threads API'],
    links: [
      art('CkvtwSgioKAD4kAHS8tF9k', 'Автоматизация Threads → Telegram'),
      art('Xbngg9iN7rzBuwuWMBNDwd', 'Threads: 3 тестовые ветки'),
      other('https://t.me/c/3008075559/18787', 'Карточки веток в теме «Threads»'),
      code('apps/threads-growth'), md('apps/threads-growth/CLAUDE.md', 'CLAUDE.md'),
    ],
  },
  {
    slug: 'voice-circle-bot', name: 'Voice Circle Bot', emoji: '⭕', status: 'paused', sort_order: 200,
    tagline: 'Обработка видео-кружков в Telegram',
    description: 'Прототип Python-бота для видео-кружков. Не задеплоен.',
    technologies: ['Python', 'Telegram'],
    links: [code('apps/voice-circle-bot'), md('apps/voice-circle-bot/CLAUDE.md', 'CLAUDE.md')],
  },

  // ── Офис агентов ─────────────────────────────────────────────────────────
  {
    slug: 'hq-office', name: 'Живой офис агентов', emoji: '🏙️', status: 'production', sort_order: 12,
    tagline: '3D-офис: агенты носят друг другу работы, история реальных задач с доказательствами',
    description:
      'hq2.aicex.club — open-space офиса AICEX: отделы (CEO, маркетинг, продажи, реклама Meta), руководители и агенты, досье и скиллы, история реальных задач с PR, артефактами Claude и сайтами. ' +
      'hq.aicex.club — первая версия: отделы, досье агентов, демо-презентации, игровой режим «Офис растёт с тобой» (?game). Голосовой ассистент и рабочий стол: задачи агентам прямо из офиса.\n\n' +
      'Архитектура: статика без сборки (Three.js), контейнеры aicex-hq-office (сайт) и aicex-hq-assistant (/api/assistant/*: Claude SDK + голос ElevenLabs), служба hq-runner ' +
      '(исполняет задачи рабочего стола через Claude Code со скиллами под пользователем ботов), блок /opt/edge/sites/hq-office.caddy. История из PR — воркфлоу hq-office-history.yml (sync/sync.mjs → tasks.auto.js). Деплой deploy-hq-office.yml.',
    technologies: ['Three.js', 'Node.js', 'Claude SDK', 'ElevenLabs', 'Claude Code', 'Caddy'],
    links: [
      live('https://hq2.aicex.club', 'Живой офис v2 (hq2)'),
      live('https://hq.aicex.club', 'Виртуальный офис v1 (hq)'),
      live('https://hq.aicex.club/?game', 'Игровой режим «Офис растёт с тобой»'),
      art('USUnYCP83rryz642mYnFjc', 'Живой офис AICEX'),
      art('7FTMzSseUbDHJDfb5xgkEP', 'Виртуальный офис агентов'),
      art('LZDnz2r6xEpr2GkDZpz1J8', 'Офис растёт с тобой'),
      art('8aGHjCzKk6odhv6D6W4Aj2', 'Офис растёт с тобой 3D'),
      code('apps/hq-office'), md('apps/hq-office/CLAUDE.md', 'CLAUDE.md'), code('.claude/skills/hq-history', 'Скилл hq-history'),
      wf('deploy-hq-office.yml'), wf('hq-office-history.yml', 'История задач из PR'),
    ],
  },
  {
    slug: 'aicex-academy', name: 'Академия «Свой ИИ-офис»', emoji: '🎓', status: 'dev', sort_order: 14,
    tagline: 'Методология, продукт и игровой трек обучения + внедрение офиса у клиента',
    description:
      'Продуктовая линия вокруг офиса агентов: академия «Свой ИИ-офис» (методология и продукт), игровой трек обучения, Prod Skills — игровые концепции обучения навыкам, ' +
      '«Готовый ИИ-офис» — внедрение офиса агентов у клиента. Пока живёт артефактами Claude; игровой мини-апп реализован в «Студии Кадрика».',
    technologies: ['Claude', 'Telegram Mini App'],
    links: [
      art('LAh6SFjhLJQcufXYjgDMWb', 'Академия AICEX'),
      art('RcD45CeaDndGua4CYzqJwH', 'Методология и продукт'),
      art('P9tdnq4J6AyjW34kiurAgw', 'Трек «Свой ИИ-офис»'),
      art('9tHWVU5GxiJ8PHBevK5Dce', 'Готовый ИИ-офис: внедрение'),
      art('8bFig9B5aX3RqzZqS5LdkZ', 'Prod Skills — игровые концепции'),
      live('https://hq.aicex.club/?game', 'Игровой режим офиса'),
    ],
  },

  // ── Монтаж, скиллы и контент-боты ────────────────────────────────────────
  {
    slug: 'studio-kadrik', name: 'Студия Кадрика', emoji: '🎞️', status: 'production', sort_order: 34,
    tagline: 'Игровой мини-апп Prod Skills + монтаж рилсов скиллами прямо в боте, оплата Stars',
    description:
      '@studio_kadrik_bot: игра (опыт, монеты, серия, квесты, карта стилей, лига недели) и монтаж скиллами Creator Pack (очередь → Claude Code со скиллами → превью → «ок»/правка → финал), ' +
      'Telegram Stars, рефералы, разбор рилса (/razbor), рассылки. Серверное API /api/ext/* для Persona Studio и Ремейка залёта (Bearer PERSONA_API_KEY).\n\n' +
      'Архитектура: Python 3 (aiogram 3 + aiohttp) одним процессом, systemd-юнит studio-kadrik-bot в /home/iliapaliy/studio-kadrik-bot, мини-апп на 127.0.0.1:8095 → cloudflared-туннель kadrik.aicex.club. ' +
      'Общая очередь тяжёлых задач heavy_slot с другими ботами. Деплой deploy-studio-kadrik.yml (вручную), мониторинг monitor-studio-kadrik.yml каждые 30 мин.',
    technologies: ['Python', 'aiogram 3', 'aiohttp', 'Claude Code', 'Telegram Stars', 'cloudflared', 'faster-whisper'],
    links: [
      bot('studio_kadrik_bot'),
      live('https://kadrik.aicex.club/', 'Мини-апп'),
      api('https://kadrik.aicex.club/health', 'Health'),
      code('apps/studio-kadrik'), md('apps/studio-kadrik/CLAUDE.md', 'CLAUDE.md'),
      wf('deploy-studio-kadrik.yml'), wf('monitor-studio-kadrik.yml', 'Мониторинг'),
    ],
  },
  {
    slug: 'creator-pack', name: 'Creator Pack', emoji: '🧰', status: 'paused', sort_order: 35,
    tagline: 'Выведен: 48 стилей монтажа теперь во вкладке «Монтаж» Студии Кадрика',
    description:
      'Бот @Productionskill_bot выведен из работы: каталог из 48 стилей монтажа и движок перенесены в Студию Кадрика (@studio_kadrik_bot, вкладка «Монтаж»), бот и его папки удалены с сервера.\n\n' +
      'Перенос и чистка: apps/studio-kadrik/deploy/retire_productionskill.sh (режимы retire-check / retire в deploy-studio-kadrik.yml). Скиллы монтажа — по-прежнему ~/.claude/skills.',
    technologies: ['Python', 'Telegram Mini App', 'Claude Code', 'Remotion', 'ffmpeg'],
    links: [
      bot('studio_kadrik_bot'),
      live('https://kadrik.aicex.club/?tab=montage', 'Стили в мини-аппе Кадрика'),
      lib('skills/claude-code', 'Скиллы монтажа (aicex-library)'),
    ],
  },
  {
    slug: 'montazh-bot', name: 'Бот монтажа', emoji: '✂️', status: 'production', sort_order: 36,
    tagline: 'Монтаж рилсов кодом по готовым стилям — бот и мини-апп в Telegram',
    description:
      '@reelswithai_bot: монтаж рилсов кодом по готовым стилям (Палий, Стикер, Журнал и др.), мини-апп montazh.aicex.club для монтажа прямо в Telegram, лендинг reels.aicex.club.\n\n' +
      'Архитектура: бот и мини-апп на сервере ботов (общая очередь heavy_slot), сайты за Cloudflare. Код — aicex-library/results/montazh-bot.',
    technologies: ['Python', 'Telegram Mini App', 'Claude Code', 'Remotion', 'ffmpeg', 'Cloudflare'],
    links: [
      live('https://reels.aicex.club', 'Лендинг бота'),
      live('https://montazh.aicex.club', 'Мини-апп монтажа'),
      bot('reelswithai_bot'),
      art('5MttqUph3kSsvi8iW5TDGs', 'Мини-апп монтажа'),
      art('8Sx4z7NmqWs6CnjieSbEHJ', 'Пакет скиллов по монтажу видео'),
      art('HardKCwUitYL85CPU9cYwb', 'Монтаж Палия'),
      lib('results/montazh-bot', 'Код (aicex-library)'),
    ],
  },
  {
    slug: 'karusel-bot', name: 'Бот каруселей', emoji: '🖼️', status: 'production', sort_order: 37,
    tagline: 'Карусели Instagram: 24 стиля, бот и мини-апп',
    description:
      '@caruselclaude_bot: карусели в 24 стилях по тексту или теме, мини-апп выбора стиля. Скилл каруселей встроен в Persona Studio; ремикс своих каруселей — скилл ilia-carousel-style.\n\n' +
      'Архитектура: бот на сервере ботов, код — aicex-library/results/karusel-bot.',
    technologies: ['Python', 'Telegram Mini App', 'Claude', 'HTML → PNG'],
    links: [
      bot('caruselclaude_bot'),
      other('https://marketing.aicex.club/assets/pages/karusel-v1.pdf', 'Готовая карусель (PDF)'),
      art('7BHNqZLNvpCpP9fLhkQiRv', 'Анализ публикаций и 5 идей каруселей'),
      art('Sou97jmxHzjre798egTRjC', '3 карусели: тексты по слайдам'),
      lib('results/karusel-bot', 'Код (aicex-library)'),
    ],
  },
  {
    slug: 'silent-reels', name: 'Silent Reels', emoji: '🔇', status: 'dev', sort_order: 38,
    tagline: 'Рилс из любого клипа из галереи — без лица и голоса',
    description: 'Бот-фабрика @Sielencemode_bot: берёт клип из галереи и делает рилс без лица и голоса (текст, музыка, ритм). Код — aicex-library/results/silent-reels.',
    technologies: ['Python', 'Telegram', 'ffmpeg', 'Claude'],
    links: [bot('Sielencemode_bot'), art('GRJDBxDhoN7ncD8Bp7bCEH', 'ТЗ: агент Silent Reels'), lib('results/silent-reels', 'Код (aicex-library)')],
  },
  {
    slug: 'skills-pack', name: 'Пак скиллов', emoji: '🧩', status: 'production', sort_order: 39,
    tagline: 'Готовые скиллы для Claude: монтаж, карусели, лендинги — skills.aicex.club',
    description:
      'Лендинг «Медь» пака скиллов и сама библиотека aicex-library (110 скиллов, 28 проектов, закрыто). Скиллы монтажа (Remotion: промо-история, неон-схема, UI-motion, длинное видео YouTube), ' +
      'каруселей, 5 стилей лендингов эксперта (Золото, Светлый, Неон, Постер, Изумруд), лид-магнитов. Ставятся в ~/.claude/skills на сервере ботов и у клиента.',
    technologies: ['Claude Code', 'Skills', 'Remotion', 'Cloudflare'],
    links: [
      live('https://skills.aicex.club', 'skills.aicex.club'),
      lib('', 'Библиотека AICEX (закрыто)'),
      art('8Sx4z7NmqWs6CnjieSbEHJ', 'Пакет скиллов по монтажу видео'),
      art('F5cjiWb2ss8AvaC3uF3CHi', 'Лендинги эксперта: 5 стилей'),
      code('.claude/skills', 'Скиллы проекта в монорепо'),
    ],
  },

  // ── Маркетинг и воронки ──────────────────────────────────────────────────
  {
    slug: 'neuro-funnel', name: 'Нейроворонка', emoji: '🧲', status: 'dev', sort_order: 42,
    tagline: 'Бот, прогрев, лид-магниты «Воронка», «Клон», «Поток», лендинги a1–a5 и EN-версия',
    description:
      'Воронка продаж: продающие рилсы → лид-магниты → Telegram-бот с прогревом и сообщениями до и после оплаты → лендинг эксперта в одном из 5 стилей. Есть англоязычная NeuroFunnel. ' +
      'Аналитика воронки — «Сквозная аналитика» (dashboard.aicex.club).',
    technologies: ['Claude', 'Telegram', 'Лендинги', 'Meta Ads'],
    links: [
      art('6z4UBbZhGNcCpVmJUp487P', 'Нейроворонка'),
      art('Qc9ehZN7mvMrUGin99JbYT', 'План реализации'),
      art('MEienkWZMA9dp3RugXzJRM', 'ТЗ на Telegram-бота'),
      art('GQybtJnYrc9EN4dYoorRae', '5 лендингов'),
      art('DjnAUCjCvpqj7vLazrCE7e', 'Лендинги a1–a5'),
      art('9xAM7woBmzLosiCnZt6uMe', 'Лендинг Нейроворонка'),
      art('MfLyqeAaZGw62HSUwuCCZd', '10 продающих рилсов'),
      art('FmuSoMWs8iVphWcC9AYgPL', 'ТЗ на продающие рилсы'),
      art('UmhCiWJHjmKATyFKQKCUh3', 'NeuroFunnel (EN)'),
      art('9dWKV6kvSGuWUDqPKC4WtD', 'Neuro-Funnel Landing (EN)'),
    ],
  },
  {
    slug: 'direct-ai', name: 'ИИ в Директе', emoji: '💬', status: 'production', sort_order: 44,
    tagline: 'ИИ-менеджер Instagram Direct в ChatPlace: кодовые слова и бесплатные материалы',
    description:
      'ИИ-менеджер в Instagram Direct на ChatPlace: воронки кодовых слов, каталог из 48 бесплатных материалов двух Telegram-каналов в базе знаний и тематических правилах агентов. ' +
      'Еженедельный разбор переписок — скилл direct-ai-weekly-review; обновление каталога — direct-materials-catalog. Самописная альтернатива — IG Agent (не задеплоен).',
    technologies: ['ChatPlace', 'Instagram Direct', 'Claude'],
    links: [art('5dj56wNJrKph3AYLbiibKH', 'Каталог бесплатных материалов')],
  },
  {
    slug: 'marketing', name: 'Маркетинг: витрина и материалы', emoji: '📣', status: 'production', sort_order: 46,
    tagline: 'marketing.aicex.club — презентации, вебинары, лид-магниты, VSL, контент-стратегия',
    description:
      'Витрина отдела маркетинга и хранилище файлов для офиса (marketing.aicex.club/assets/): эфир «Монтаж рилсов с Claude» («Медь»), практикум «AI-контент: подписчики → клиенты → деньги», ' +
      'урок «блог с 0 до 10 000», «Спринт Чёрный», лид-магнит «12 рабочих связок», VSL «Контент → Аудитория → Деньги», контент-стратегия и трек «0 → 10 000». Сайт за Cloudflare.',
    technologies: ['HTML', 'Cloudflare', 'Claude'],
    links: [
      live('https://marketing.aicex.club', 'marketing.aicex.club'),
      live('https://marketing.aicex.club/assets/pages/copper/deck/index.html', 'Эфир «Монтаж рилсов с Claude»'),
      other('https://marketing.aicex.club/assets/pages/copper/presentation.pdf', 'Эфир «Медь» (PDF)'),
      live('https://marketing.aicex.club/assets/pages/presentation-svyazka.html', 'Лид-магнит «Первые 10 000»'),
      live('https://marketing.aicex.club/assets/pages/webinar/index.html', 'Урок 2 — блог с 0 до 10 000'),
      art('R56YaWRpHrDHPD8n7ZjUny', 'Спринт Чёрный'),
      art('Xs6q7BfiHsmEdYxSAXt9DU', '12 рабочих связок'),
      art('TAZq62RAQbfRsKWhMrzKFL', 'Презентация о связке'),
      art('3K2VLPCxZqQKu2oHTqTD69', 'VSL: Контент → Аудитория → Деньги'),
      art('5LwBz4Y5Yhdxj6pDcTG6Wp', 'Контент Илья — органика'),
      art('BLULR8V3fsKhF7H7tWKyv9', 'Трек 0 → 10 000 подписчиков'),
      art('Cft7hmLVrPK9P9RA4A8NqM', 'Рилс «Claude vs GPT»: сценарий и ТЗ'),
      lib('results/praktikum-day1', 'Практикум, день 1 (aicex-library)'),
    ],
  },
]
