// Shared knowledge-base data for the /bots index and /bots/[slug] detail pages.
// Source of truth: CLAUDE.md (aisales-app-v2) + scheduler handlers in infra-worker/.

export type BotKind = 'product' | 'tool' | 'internal'

export type WorkflowStep = {
  step: number
  title: string
  detail: string
  trigger?: string
  output?: string
}

export type PromptSpec = {
  name: string
  role: 'system' | 'user' | 'tool' | 'handler'
  purpose: string
  source?: string
  excerpt?: string
}

export type TrainingItem = {
  kind: 'rag' | 'fine-tune' | 'feedback' | 'config' | 'voice-clone'
  title: string
  status: 'live' | 'wip' | 'planned'
  detail: string
}

export type DocSection = {
  title: string
  body: string
}

export type Bot = {
  slug: string
  name: string
  handle: string
  url: string
  emoji: string
  kind: BotKind
  tagline: string
  description: string
  features: string[]
  site?: string

  documentation: DocSection[]
  workflow: WorkflowStep[]
  prompts: PromptSpec[]
  training: TrainingItem[]
}

export const KIND_STYLE: Record<BotKind, { bg: string; text: string; border: string; label: string }> = {
  product:  { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', label: 'Product' },
  tool:     { bg: 'bg-indigo-500/10',  text: 'text-indigo-400',  border: 'border-indigo-500/20',  label: 'Tool' },
  internal: { bg: 'bg-slate-500/10',   text: 'text-slate-400',   border: 'border-slate-500/20',   label: 'Internal' },
}

export const TRAINING_STYLE: Record<TrainingItem['status'], { bg: string; text: string; label: string }> = {
  live:    { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'live' },
  wip:     { bg: 'bg-amber-500/10',   text: 'text-amber-400',   label: 'wip' },
  planned: { bg: 'bg-slate-500/10',   text: 'text-slate-400',   label: 'planned' },
}

export const BOTS: Bot[] = [
  // ────────────────────────────────────────────────────────────────────────
  {
    slug: 'ai-growth-office',
    name: 'AI Growth Office',
    handle: '@AI_Growth_Office_Bot',
    url: 'https://t.me/AI_Growth_Office_Bot',
    emoji: '🏢',
    kind: 'product',
    tagline: 'AI-команда из 169 агентов под нишу клиента за 48 часов',
    description:
      'Платный SaaS для онлайн-экспертов (50к–1М ₽/мес выручка, IG+TG). Проактивный, а не реактивный: сам шлёт в TG готовые артефакты в голосе клиента. Pro 1990 / Builder 5900 / Architect 14900 ₽/мес.',
    features: [
      'Day-0 +23 мин: голосовое от Ани (ElevenLabs клон) + Reels-сценарий',
      'Daily briefing 08:30 Пн–Пт',
      'Weekly recap 15:00 Пт + PDF',
      'Monthly content-calendar (Day-25 renewal nudge)',
      'WFDS-метрика — артефакты с ✅ в TG за 7 дней',
      'Stars billing с auto-renewal + 3/1-day expiry reminders + refund flow',
    ],
    site: 'https://ai-office.46-62-215-11.nip.io/',

    documentation: [
      {
        title: 'Что это',
        body:
          'SaaS-«AI-команда из 169 агентов» под нишу клиента. Проактивный, не реактивный — каждый день/неделю/месяц сам шлёт в Telegram готовые артефакты в голосе клиента. Северная звезда — WFDS (Weekly Founder Deliverables Shipped): количество артефактов с ✅ за 7 дней.',
      },
      {
        title: 'ICP и прайс',
        body:
          'Эксперт онлайн-школы RU, 28–42, выручка 50к–1М ₽/мес, продаёт через IG+TG. Pro 1990 ₽ / Builder 5900 ₽ / Architect 14900 ₽ в месяц. Платёжный канал — Telegram Stars (RU-friendly).',
      },
      {
        title: 'Архитектура',
        body:
          'Фронт: Next.js standalone, контейнер infra-ai-office-1 (порт 3001). Лиды — в Make.com + Supabase (НЕ наш /api/leads). Скедулер: infra-aisales-worker-1 (cron+queue поверх aisales-postgres). 9 handler-kinds в infra-worker/handlers/. БД таблиц: agent_prompts_extended (миграция 023), agent_replies_feedback (024), plan_prices, platform_subscriptions, platform_users.',
      },
      {
        title: 'Момент истины',
        body:
          'Day-0 +23 минуты: пользователь получает голосовое от Ани (его клон через ElevenLabs IVC) с готовым Reels-сценарием в его голосе. Это и есть «вау-эффект», который отличает продукт от reactive чат-ботов.',
      },
    ],

    workflow: [
      { step: 1, title: '/start → онбординг (11 шагов)', detail: 'Сбор данных по нише, целям, ICP клиента. Шаг 11 — запись 30–60 сек голоса для клонирования.', trigger: '/start', output: 'platform_users + pending_voice_clones' },
      { step: 2, title: 'Payment via Telegram Stars', detail: 'Pro/Builder/Architect через invoice. duration_days берётся из plan_prices. Webhook записывает payments + создаёт platform_subscriptions.', trigger: 'successful_payment webhook', output: 'platform_subscriptions активная' },
      { step: 3, title: 'welcome_voice handler (Day-0 +23 мин)', detail: 'ElevenLabs клонирует голос → генерирует Reels-сценарий в этом голосе → sendVoice в TG.', trigger: 'scheduled_jobs (welcome_voice)', output: 'TG voice + deliverables row' },
      { step: 4, title: 'daily_briefing 08:30 Пн–Пт', detail: 'Утренний дайджест от Ани: что произошло вчера → 3 action items на сегодня. Кнопки ✅/❌ для WFDS-учёта.', trigger: 'cron schedule_rules', output: 'TG message + deliverables' },
      { step: 5, title: 'weekly_recap 15:00 Пт', detail: 'Отчёт за неделю в PDF + голосовое summary. Считает WFDS, инсайты, план на следующую неделю.', trigger: 'cron 15:00 Fri', output: 'TG document (PDF) + voice' },
      { step: 6, title: 'monthly_calendar 07:00 ежедневно', detail: 'На Day-25 цикла бьёт renewal-нудж + контент-план на следующий месяц по нише.', trigger: 'cron 07:00 daily', output: 'TG carousel (PNG) + renewal CTA' },
      { step: 7, title: 'subscription_expiry_check 06:00', detail: 'За 3 и 1 день до окончания шлёт reminder. На день X-0 — финальное предложение продлить.', trigger: 'cron 06:00 daily', output: 'TG reminder + invoice' },
    ],

    prompts: [
      { name: 'Anya · voice persona', role: 'system', purpose: 'Базовая личность Ани — стиль, тон, RU/EN свитч. Используется во всех handler-prompts.', source: 'infra-worker/lib/prompts/anya.ts' },
      { name: 'daily_briefing', role: 'handler', purpose: 'Из вчерашних deliverables + календаря клиента → 3 action items на сегодня в голосе Ани.', source: 'infra-worker/handlers/index.js · daily_briefing' },
      { name: 'weekly_recap', role: 'handler', purpose: 'Из недельных deliverables → PDF-отчёт + голосовое summary.', source: 'infra-worker/handlers/index.js · weekly_recap' },
      { name: 'monthly_calendar', role: 'handler', purpose: 'Из ниши клиента + 30-day гэпа → контент-план в формате carousel + renewal-CTA на Day-25.', source: 'infra-worker/handlers/index.js · monthly_calendar' },
      { name: 'welcome_voice', role: 'handler', purpose: 'Из онбординг-ответов клиента → персональный Reels-сценарий в его клонированном голосе.', source: 'infra-worker/handlers/index.js · welcome_voice' },
    ],

    training: [
      { kind: 'voice-clone', title: 'ElevenLabs IVC per user', status: 'live', detail: '30–60 сек записи на шаге 11 онбординга → /v1/voices/add → voice_id записывается в platform_users.voice_id. Bridge через pending_voice_clones для онбординг-без-оплаты.' },
      { kind: 'rag', title: 'RAG из ниши клиента', status: 'planned', detail: 'tenant_kb_docs пока пустой — KB на роль будет в фазе bot_training (см. project_bot_training.md в memory).' },
      { kind: 'feedback', title: 'agent_replies_feedback (migration 024)', status: 'live', detail: 'Каждый артефакт с кнопками ✅/❌ → запись в agent_replies_feedback. Накапливается тренировочный сигнал для будущего fine-tune.' },
      { kind: 'fine-tune', title: 'Fine-tune на роль', status: 'planned', detail: 'North star AWR=70% к месяцу 6. Fine-tune не раньше 500 ✅ на роль (9 ролей).' },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  {
    slug: 'transcribe',
    name: 'Транскрипция',
    handle: '@your_transscribe_bot',
    url: 'https://t.me/your_transscribe_bot',
    emoji: '📝',
    kind: 'product',
    tagline: 'YouTube/Reels/TikTok → 4 контент-артефакта + viral clone',
    description:
      'Расшифровка видео в карусель IG (8×PNG), Reels-сценарий, TG-пост, перевод 50+ языков. Free 60 мин/мес, Pro 750⭐/30 дней через Telegram Stars.',
    features: [
      '/transcribe <url> — 4 артефакта из видео',
      '/clone <url|@handle> — viral pipeline (Whisper → Claude → HeyGen → Submagic → TG)',
      '/translate <url> <lang> — перевод 50+ языков',
      'TMA на tma.46-62-215-11.nip.io (без auth)',
      'Карусель авто-доставляется в TG через sendMediaGroup',
    ],
    site: 'https://transcribe.46-62-215-11.nip.io/',

    documentation: [
      {
        title: 'Что это',
        body:
          'Расшифровка YouTube/Reels/TikTok в 4 контент-артефакта: карусель IG (8×PNG), Reels-сценарий, TG-пост, перевод на 50+ языков. Free 60 мин/мес, Pro 750⭐/30 дней (Telegram Stars). Один pro-юзер уже платит.',
      },
      {
        title: 'Стек и контейнер',
        body:
          'Next.js standalone, контейнер infra-transcribe-1 (порт 3002). БД aio в infra-postgres-1 (отдельно от aisales!). Auth — TMA initData HMAC + TRANSCRIBE_OWNER_FALLBACK=true для веба (single-tenant). Лендинг на transcribe.46-62-215-11.nip.io, App за basic-auth admin на /transcribe, TMA без auth на tma.46-62-215-11.nip.io.',
      },
      {
        title: '/clone — viral pipeline',
        body:
          '6-step state machine: Apify direct для Instagram / yt-dlp для остальных → Whisper → Claude rewrite → HeyGen → Submagic Hormozi 2 + B-rolls + zooms → TG sendDocument (>50МБ — ссылка вместо файла). Триггер из transcribe webhook, исполнение в Office Worker, выдача обратно в @your_transscribe_bot. Sweep-cron */5 * * * * оживляет orphan pipelines и завершает stage-timeouts.',
      },
      {
        title: 'Админ-квоты',
        body:
          '/admin/quotas + /api/admin/users для управления Whisper-минутами по telegram_id. Команды: создание юзеров, +60/+300/+1000 минут. Single-tenant fallback по умолчанию.',
      },
    ],

    workflow: [
      { step: 1, title: '/transcribe <url>', detail: 'yt-dlp (или Apify для Instagram) скачивает медиа → передаёт в Whisper.', trigger: 'TG command или TMA', output: 'transcript .txt + 4 артефакта' },
      { step: 2, title: 'Whisper Large v3', detail: 'Расшифровка локально или через OpenAI API. Квоты считаются по аудио-длительности.', output: 'transcript' },
      { step: 3, title: 'Claude rewrite × 4', detail: '4 параллельных промпта: carousel (8 slides), reels-script (3-act), TG-post (RU style), translate (язык).', output: 'Артефакты в TMA + TG' },
      { step: 4, title: 'Карусель → Telegram', detail: 'Авто-доставка sendMediaGroup из TMA-сессии + ручная кнопка в UI. Telegram перекачивает к себе → решает TTL kie.ai.', output: 'sendMediaGroup' },
      { step: 5, title: '/clone — 6-step pipeline', detail: 'Apify/yt-dlp → Whisper → Claude rewrite → HeyGen avatar → Submagic captions → TG sendDocument.', trigger: '/clone <url>', output: 'Готовый video файл в TG' },
      { step: 6, title: 'sweep-cron */5 мин', detail: 'Оживление orphan pipelines, fail на stage-timeout (миграция 020), retry attempts+1.', trigger: 'cron */5 * * * *' },
    ],

    prompts: [
      { name: 'Carousel rewrite (8 slides)', role: 'tool', purpose: 'Из транскрипта → 8 слайдов карусели с hook → value → CTA. Каждый слайд 1-2 строки.', source: 'apps/transcribe/src/lib/prompts/carousel.ts' },
      { name: 'Reels script (3-act)', role: 'tool', purpose: '3-act структура: hook (0-3 сек) → value (4-25 сек) → CTA (26-30 сек). RU/EN tone matching.', source: 'apps/transcribe/src/lib/prompts/reels.ts' },
      { name: 'TG post', role: 'tool', purpose: 'TG-style: эмодзи sparingly, разбивка строк, без markdown заголовков.', source: 'apps/transcribe/src/lib/prompts/tg-post.ts' },
      { name: 'Translate prompt', role: 'tool', purpose: 'Переводит транскрипт + сохраняет тон. 50+ языков. Не дословно — перевод смысла.', source: 'apps/transcribe/src/lib/prompts/translate.ts' },
      { name: 'Viral clone rewrite', role: 'tool', purpose: 'Из чужого транскрипта → перепридумать сценарий в стиле пользователя для HeyGen avatar.', source: 'infra-worker/handlers/viral_clone.js' },
    ],

    training: [
      { kind: 'config', title: 'Whisper Large v3', status: 'live', detail: 'OpenAI Whisper API. Локальный fallback через faster-whisper в перспективе.' },
      { kind: 'config', title: 'Claude Sonnet 4.6 для rewrite', status: 'live', detail: 'Все 4 артефакта генерятся одной моделью с разными промптами. Кэшируем system prompt.' },
      { kind: 'voice-clone', title: 'HeyGen avatar = клон юзера', status: 'live', detail: 'heygen_avatar_id хранится в bot_tenants. Используется в /clone pipeline на шаге 4.' },
      { kind: 'config', title: 'Submagic preset Hormozi 2', status: 'live', detail: 'Captions style + B-rolls + zooms. Захардкожен в submagic.js lib.' },
      { kind: 'feedback', title: 'Per-artifact rating', status: 'planned', detail: '👍/👎 в TMA → накопление training set для prompt-tuning.' },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  {
    slug: 'ai-hub',
    name: 'AI Hub · ИИ галерея',
    handle: '@aicex_one_bot',
    url: 'https://t.me/aicex_one_bot',
    emoji: '🎨',
    kind: 'product',
    tagline: 'Single-token-wallet агрегатор 16 нейросетей',
    description:
      'TMA-агрегатор image/video/voice генерации поверх fal.ai, Replicate, kie.ai. Onboarding-бонус 100 токенов. Race-free wallet через SECURITY DEFINER функции Postgres.',
    features: [
      '16 tools: image, video, upscale (Topaz), face-swap, nano-banana, карусель, reels-script',
      'Token-кошелёк с атомарными reserve/charge/refund/credit',
      'Stripe Checkout + Telegram Stars billing',
      '/admin: 6 табов (Overview, Users, Jobs, Transactions, Tools, Payments)',
      'Magic-link auth (Auth.js v5) + mailpit для debug',
    ],
    site: 'https://aihub.46-62-215-11.nip.io/',

    documentation: [
      {
        title: 'Что это',
        body:
          'SaaS-агрегатор 16 нейросетей с единым токен-кошельком. Tools: image, video, upscale (Topaz), face-swap, nano-banana, карусель-по-фото, reels-script. Onboarding-бонус 100 токенов. Provider\'ы: fal.ai, Replicate, kie.ai.',
      },
      {
        title: 'Стек',
        body:
          'Next.js 14 App Router + TS + Postgres ai_hub (в aisales-postgres) + Drizzle + Auth.js v5 magic-link + MinIO bucket ai-hub-media + Redis БД 1 + BullMQ. Контейнеры ai-hub-web (:3010) + ai-hub-worker + mailpit (:8025 для debug magic-link). Stripe Checkout + Telegram Stars.',
      },
      {
        title: 'Wallet (race-free)',
        body:
          '4 атомарные SECURITY DEFINER функции Postgres: wallet_reserve / wallet_charge / wallet_refund / wallet_credit. Никаких race-conditions между параллельными job\'ами. Каждая операция в transactions с балансом до/после для аудита.',
      },
      {
        title: 'Admin',
        body:
          '/admin доступен через magic-link с whitelisted email. 6 табов: Overview (metrics), Users (баланс/limit), Jobs (BullMQ queue state), Transactions (wallet log), Tools (включить/выключить tool), Payments (Stripe + Stars).',
      },
    ],

    workflow: [
      { step: 1, title: '/start → magic-link auth', detail: 'TMA → backend проверяет initData HMAC → если новый юзер → создаёт + начисляет 100 токенов onboarding-бонус через wallet_credit.', trigger: '/start или открытие TMA', output: 'session + 100 токенов на балансе' },
      { step: 2, title: 'Tool select', detail: 'Юзер выбирает из 16 tools. Для каждого свой Drizzle schema params + UI компонент.', output: 'выбранный tool + UI form' },
      { step: 3, title: 'Param input + cost preview', detail: 'UI считает стоимость по cost_per_unit таблицы tools. Показывает «после операции у вас останется X токенов».', output: 'job_request payload' },
      { step: 4, title: 'wallet_reserve (атомарно)', detail: 'SECURITY DEFINER функция блокирует токены. Если не хватает — return error до создания job.', trigger: 'submit', output: 'transaction(kind=reserve) + job создан в Bull' },
      { step: 5, title: 'Provider call', detail: 'BullMQ worker (ai-hub-worker) берёт job → routes к fal/replicate/kie API. Polling статуса до готовности.', trigger: 'BullMQ queue', output: 'media в MinIO ai-hub-media' },
      { step: 6, title: 'wallet_charge или wallet_refund', detail: 'На success — wallet_charge (списание). На fail — wallet_refund (возврат брони). Атомарно.', output: 'transaction final state' },
      { step: 7, title: 'Доставка результата', detail: 'URL/файл в TMA + (опционально) sendMediaGroup в TG.', output: 'TG message + admin/jobs' },
    ],

    prompts: [
      { name: 'Image prompt enhancer', role: 'tool', purpose: 'Из короткого юзер-запроса → расширенный midjourney/sdxl-style промпт с lighting/composition.', source: 'apps/ai-hub/src/lib/prompts/image-enhance.ts' },
      { name: 'Carousel-by-photo', role: 'tool', purpose: 'Photo → 8 slides с текстовым overlay. Анализ фото через vision + генерация text.', source: 'apps/ai-hub/src/lib/prompts/carousel-photo.ts' },
      { name: 'Reels-script', role: 'tool', purpose: 'Идея пользователя → 3-act script для reels (hook/value/CTA).', source: 'apps/ai-hub/src/lib/prompts/reels-script.ts' },
      { name: 'Face-swap params', role: 'tool', purpose: 'Шаблоны для face-swap (целевое лицо + source image), strength settings.', source: 'apps/ai-hub/src/lib/tools/face-swap.ts' },
    ],

    training: [
      { kind: 'config', title: 'Provider models (no custom training)', status: 'live', detail: 'fal.ai (image/video), Replicate (universal), kie.ai (upscale/специализированные). Нет fine-tune — только prompt engineering поверх готовых моделей.' },
      { kind: 'feedback', title: 'User rating на job', status: 'planned', detail: '👍/👎 на готовый результат → BullMQ retry на низких score → улучшение default params.' },
      { kind: 'config', title: 'Cost tuning через DB', status: 'live', detail: 'cost_per_unit в таблице tools редактируется в /admin без деплоя. Margin = (cost_per_unit − provider_cost) × usage.' },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  {
    slug: 'ai-sales-demo',
    name: 'ИИ продавец (Илья)',
    handle: '@ilia_pali0_bot',
    url: 'https://t.me/ilia_pali0_bot',
    emoji: '💼',
    kind: 'product',
    tagline: 'Персональный AI-продавец Ильи · dogfooding AI Sales OS',
    description:
      'Личный demo-бот основателя поверх AI Sales System. Прокачивается на реальных диалогах — feedback loop для prompt+RAG → fine-tune readiness. Бэкенд — aisales-api-v2 + дашборд продаж.',
    features: [
      'Входящие лиды → классификация → ответ в голосе Ильи',
      'Pulse / Pipeline / Inbox / Conversation — UI на dashboard.46-62-215-11.nip.io',
      'Обучается на approval-loop (north star AWR=70% к мес 6)',
      '9 ролей × отдельная KB (база знаний по нише)',
      'Stage в roadmap: Prompt+RAG → feedback-loop → fine-tune',
    ],
    site: 'https://dashboard.46-62-215-11.nip.io/',

    documentation: [
      {
        title: 'Что это',
        body:
          'Личный demo-бот основателя поверх AI Sales OS. Используется как dogfooding-площадка: каждый реальный диалог — материал для prompt+RAG iteration и (в перспективе) fine-tune. Цель — поверить продукт на собственной шкуре.',
      },
      {
        title: 'Бэкенд',
        body:
          'aisales-api-v2 (FastAPI :8001) + дашборд продаж на dashboard.46-62-215-11.nip.io. БД aisales (16 таблиц). Экраны: Pulse / Inbox / Pipeline / Journey / Conversation / Agents / Reports.',
      },
      {
        title: 'Roadmap обучения',
        body:
          '3 фазы (см. project_bot_training.md): Stage 1 (Now) — Prompt+RAG из tenant_kb_docs. Stage 2 (W4) — feedback-loop через agent_replies_feedback накапливает training set. Stage 3 (Month 6, AWR=70% target) — fine-tune не раньше 500 ✅ на роль. 4 milestone\'а до W4. Fine-tune только когда AWR подтверждён.',
      },
      {
        title: 'Метрика AWR',
        body:
          'Approval Without Revision = доля ответов, которые Илья одобрил без правок. North star = 70% к Month 6. Считается из agent_replies_feedback (status=approved AND edits_count=0) / total_replies.',
      },
    ],

    workflow: [
      { step: 1, title: 'Incoming lead → classify', detail: 'Сообщение в TG → классификатор определяет intent: cold / warm / hot / returning / objection.', trigger: 'TG webhook', output: 'lead + intent label' },
      { step: 2, title: 'RAG retrieve', detail: 'По intent + нише → top-K из tenant_kb_docs (база знаний роли). pgvector similarity search.', output: 'context для генерации' },
      { step: 3, title: 'Generate в голосе Ильи', detail: 'Claude Sonnet с system prompt = личность Ильи + per-stage instructions + retrieved context.', output: 'draft reply' },
      { step: 4, title: 'Approval-loop (Илья ✅/❌)', detail: 'Илья видит draft в Inbox UI → одобряет / правит / отклоняет. Каждое действие → agent_replies_feedback.', trigger: 'Inbox UI', output: 'final reply (sent) + training signal' },
      { step: 5, title: 'Pipeline stage update', detail: 'По intent + response → автоматически обновляется pipeline stage клиента. Виден в Pipeline/Pulse UI.', output: 'pipeline.stage updated' },
    ],

    prompts: [
      { name: 'System: личность Ильи', role: 'system', purpose: '10 лет в продажах, fintech BG, RU-native. Тон, словарь, привычки.', source: 'apps/ai-sales/agent-prompts/00-persona-ilia.md' },
      { name: 'IG manager', role: 'system', purpose: 'Холодные лиды из Instagram. Quick win — calendar booking.', source: 'apps/ai-sales/agent-prompts/01-ig-manager.md' },
      { name: 'TG manager', role: 'system', purpose: 'Warm/hot из Telegram. Длинные разговоры, qualifying.', source: 'apps/ai-sales/agent-prompts/02-tg-manager.md' },
      { name: 'Per-stage', role: 'tool', purpose: 'cold reach / qualifying / objection handling / closing — 4 stage-specific prompts.', source: 'apps/ai-sales/agent-prompts/' },
      { name: 'Classifier', role: 'tool', purpose: 'Из сообщения → intent label + confidence. Используется на шаге 1.', source: 'apps/ai-sales/code/agents/nodes.py' },
    ],

    training: [
      { kind: 'rag', title: 'tenant_kb_docs (база знаний)', status: 'live', detail: '9 ролей × своя KB. pgvector index. Загружается через /api/kb-upload (MD/PDF/DOCX).' },
      { kind: 'feedback', title: 'Approval-feedback-loop', status: 'live', detail: 'agent_replies_feedback (миграция 024) накапливает (draft, final, status) на каждое сообщение. Готов dataset для fine-tune.' },
      { kind: 'fine-tune', title: 'Fine-tune на роль', status: 'planned', detail: 'Не раньше 500 ✅ на роль. Целевая метрика AWR=70%. На Anthropic нет fine-tune API → возможный кандидат OpenAI/локальная Llama после Month 6.' },
      { kind: 'config', title: 'agent_prompt_overrides', status: 'live', detail: 'Per-tenant override промптов без деплоя. Используется для A/B тестов формулировок.' },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  {
    slug: 'parser-bot',
    name: 'Парсер бот',
    handle: '@parser_instaa_bot',
    url: 'https://t.me/parser_instaa_bot',
    emoji: '🔍',
    kind: 'tool',
    tagline: 'Onboarding-wizard для viral_discover',
    description:
      'Настраивает ежедневный парсер трендовых рилсов конкурентов с Claude-оценкой 1–10 «зайдёт у меня». Live с 2026-05-20.',
    features: [
      '/start → wizard: ниша → акк → теги → запуск',
      'Ежедневный cron 08:00 МСК',
      'Парсит 5 рилсов + 5 каруселей конкурентов',
      'Claude scoring 1–10 для фильтрации релевантного',
      'Доставка результатов в TG-чат пользователя',
    ],

    documentation: [
      {
        title: 'Что это',
        body:
          'Wizard-onboarding для viral_discover. Помогает юзеру за 4 шага настроить ежедневный парсер трендовых рилсов конкурентов с Claude-оценкой релевантности. Live с 2026-05-20.',
      },
      {
        title: 'Бэкенд',
        body:
          'Handler viral_discover в infra-aisales-worker-1. Конфигурация в viral_discover_configs (per-user). Запуски в viral_discover_runs. Apify для скрейпа Instagram, Claude для scoring.',
      },
      {
        title: 'Cron расписание',
        body:
          'Ежедневный cron 08:00 МСК. Один прогон = top 5 reels + top 5 carousels по списку конкурентов из конфига. Claude оценивает каждый 1–10. Доставка только score ≥ 7 в TG.',
      },
    ],

    workflow: [
      { step: 1, title: '/start → wizard step 1', detail: 'Какая у тебя ниша? Свободный текст. Сохраняется в viral_discover_configs.niche.', trigger: '/start', output: 'config.niche' },
      { step: 2, title: 'Step 2: конкуренты', detail: 'Список IG-аккаунтов через запятую или по одному. Валидация — реальные ли это аккаунты (Apify check).', output: 'config.competitors[]' },
      { step: 3, title: 'Step 3: хэштеги', detail: 'Опциональные хэштеги для расширения охвата. Пустой список = только конкуренты.', output: 'config.hashtags[]' },
      { step: 4, title: 'Step 4: подтверждение и активация', detail: 'Показывает summary → юзер жмёт «Запустить». is_active=true → попадает в cron-выборку.', output: 'viral_discover_configs.is_active=true' },
      { step: 5, title: 'Cron 08:00 МСК — handler срабатывает', detail: 'Worker берёт все active configs → для каждой запускает scrape + scoring + delivery.', trigger: 'cron 0 5 * * * (UTC) = 08:00 МСК', output: 'viral_discover_runs row' },
      { step: 6, title: 'Apify scrape', detail: 'Top 5 reels + top 5 carousels по каждому конкуренту. Метрики: views, likes, comments, save_ratio.', output: 'raw items[]' },
      { step: 7, title: 'Claude scoring 1–10', detail: 'Каждый item → промпт «оцени 1–10 насколько это зайдёт в нише X» → score + explanation.', output: 'scored items[]' },
      { step: 8, title: 'TG delivery', detail: 'Только score ≥ 7 → TG message с обложкой, метриками, ссылкой, explanation от Claude.', output: 'TG sendPhoto/sendDocument' },
    ],

    prompts: [
      { name: 'Niche scoring', role: 'tool', purpose: 'Видит item (видео/карусель + метрики) + контекст ниши пользователя → score 1–10 + 1-2 предложения объяснения.', source: 'infra-worker/handlers/viral_discover.js · scoreItem' },
      { name: 'Onboarding wizard prompts', role: 'handler', purpose: 'Текст шагов 1–4 wizard\'а, валидация ответов, конверсия в config.', source: 'infra-worker/lib/parser_bot.js' },
    ],

    training: [
      { kind: 'config', title: 'Per-user niche tag', status: 'live', detail: 'Конфиг в viral_discover_configs управляется через wizard. Юзер сам обучает «свой контекст».' },
      { kind: 'feedback', title: '👍/👎 на сценарий', status: 'planned', detail: 'Кнопки под каждым доставленным item → накопление в viral_discover_runs для tuning порога score.' },
      { kind: 'config', title: 'Threshold score ≥ 7', status: 'live', detail: 'Хардкод в handler. План — сделать per-user настройку через wizard step 5.' },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  {
    slug: 'tg-agent',
    name: 'TG-agent · классификатор',
    handle: '@newnewnnn_bot',
    url: 'https://t.me/newnewnnn_bot',
    emoji: '🤖',
    kind: 'internal',
    tagline: 'Внутренний бот-responder в TG-группах',
    description:
      'Claude Haiku 4.5 classifier для входящих сообщений в группах. CONFIDENCE_THRESHOLD=0.7 — отвечает только когда уверен. Не для публичного использования.',
    features: [
      'Whitelist через ALLOWED_CHAT_IDS',
      'Игнор-лист (IGNORED_USER_IDS=256120033,923980789)',
      'OWNER=1280515130 для алертов',
      'Админка на :8080',
      'Один владелец: ilia.paliy',
    ],

    documentation: [
      {
        title: 'Что это',
        body:
          'Внутренний бот-классификатор и responder в TG-группах. Запускается на Claude Haiku 4.5 (claude-haiku-4-5-20251001) ради дешевизны и латентности. Не для публичного использования.',
      },
      {
        title: 'Стек и конфиг',
        body:
          'Контейнер tg-agent, compose-проект tg-agent. ALLOWED_CHAT_IDS — whitelist чатов. CONFIDENCE_THRESHOLD=0.7 — отвечает только когда уверен. IGNORED_USER_IDS=256120033,923980789. OWNER=1280515130 (для алертов).',
      },
      {
        title: 'Админка',
        body:
          'Простая web-админка на :8080 (basic-auth admin). Видит recent messages, классификации, confidence, sent replies.',
      },
    ],

    workflow: [
      { step: 1, title: 'Message в allowed chat', detail: 'TG webhook → проверка chat_id ∈ ALLOWED_CHAT_IDS. Если нет — drop.', trigger: 'TG webhook', output: 'accepted message' },
      { step: 2, title: 'User filter', detail: 'Если from_user_id ∈ IGNORED_USER_IDS — drop. Это владелец+собеседник, не хотят чтобы бот вмешивался.', output: 'filtered message' },
      { step: 3, title: 'Claude Haiku classifier', detail: 'Промпт: «классифицируй intent + confidence 0..1». Возвращает label + score.', output: '{intent, confidence}' },
      { step: 4, title: 'Threshold check', detail: 'Если confidence < CONFIDENCE_THRESHOLD (0.7) → молчит. Иначе → шаг 5.', output: 'pass/fail' },
      { step: 5, title: 'Response generation', detail: 'Claude Haiku с response prompt → ответ по-русски (если intent=вопрос).', output: 'reply text' },
      { step: 6, title: 'Send reply', detail: 'sendMessage в исходный chat. Логируется в БД для админки.', output: 'TG message' },
      { step: 7, title: 'Owner alert', detail: 'На критичные intent (например, прямое обращение к владельцу) — отдельный sendMessage к OWNER (1280515130).', output: 'OWNER notification' },
    ],

    prompts: [
      { name: 'Classifier (system)', role: 'system', purpose: 'Из сообщения → JSON {intent: question|command|chat|spam, confidence: 0..1, reasoning: string}.', source: 'apps/tg-agent/src/lib/prompts/classifier.ts' },
      { name: 'Response (system)', role: 'system', purpose: 'Если intent=question → краткий ответ по-русски. Если intent=command/spam → null.', source: 'apps/tg-agent/src/lib/prompts/response.ts' },
    ],

    training: [
      { kind: 'config', title: 'CONFIDENCE_THRESHOLD env', status: 'live', detail: 'Главный «обучающий» рычаг — повышать порог чтобы отвечать реже, понижать чтобы активнее. По умолчанию 0.7.' },
      { kind: 'config', title: 'ALLOWED_CHAT_IDS whitelist', status: 'live', detail: 'Где бот живёт. Менять через .env + restart контейнера.' },
      { kind: 'feedback', title: 'Owner-only feedback', status: 'wip', detail: 'OWNER может в админке отметить «хороший/плохой ответ» — накапливается в local SQLite, ждёт реализации экспорта в training set.' },
    ],
  },
]

export function getBot(slug: string): Bot | undefined {
  return BOTS.find(b => b.slug === slug)
}
