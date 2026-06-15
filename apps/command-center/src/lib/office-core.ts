export type OfficeAgentKind =
  | 'chief_of_staff'
  | 'product'
  | 'growth'
  | 'research'
  | 'sales'
  | 'support'
  | 'ops'
  | 'finance'

export type OfficeSeverity = 'critical' | 'high' | 'medium' | 'low'
export type OfficeTaskStatus = 'new' | 'triaged' | 'in_progress' | 'blocked' | 'waiting_approval' | 'done'
export type OfficeTaskPriority = 'p0' | 'p1' | 'p2' | 'p3'
export type OfficeDecisionStatus = 'pending' | 'approved' | 'rejected' | 'deferred'
export type OfficeMemoryKind =
  | 'weekly_review'
  | 'incident'
  | 'research'
  | 'customer_voice'
  | 'playbook'
  | 'decision'
  | 'product_learning'

export type OfficeAgent = {
  slug: string
  name: string
  kind: OfficeAgentKind
  mission: string
  cadence: string
  channels: string[]
  sourceSystems: string[]
}

export type OfficeEventSource = {
  slug: string
  name: string
  kind: 'app' | 'service' | 'marketing' | 'ops'
  repoPath: string
  emits: string[]
}

export type OfficeEventSample = {
  id: string
  type: string
  severity: OfficeSeverity
  title: string
  summary: string
  project: string
  source: string
  occurredAt: string
}

export type OfficeTask = {
  id: string
  title: string
  summary: string
  project: string
  ownerAgent: string
  status: OfficeTaskStatus
  priority: OfficeTaskPriority
  sourceEventType: string
}

export type OfficeDecision = {
  id: string
  title: string
  summary: string
  project: string
  requestedBy: string
  status: OfficeDecisionStatus
  recommended: string
  options: string[]
}

export type OfficeMemoryEntry = {
  id: string
  kind: OfficeMemoryKind
  title: string
  summary: string
  project: string
  tags: string[]
  createdBy: string
}

export type OfficeJournalEntry = {
  id: string
  action: string
  narrative: string
  actor: string
  target: string
  createdAt: string
}

export const OFFICE_SUMMARY = {
  activeAgents: 8,
  pendingDecisions: 4,
  openTasks: 11,
  criticalAlerts: 2,
  memoryEntries: 148,
  weeklyFocus: 'Надежность Persona Studio и дисциплина повторных касаний в продажах',
}

export const OFFICE_AGENTS: OfficeAgent[] = [
  {
    slug: 'chief-of-staff',
    name: 'Шеф штаба',
    kind: 'chief_of_staff',
    mission: 'Фильтрует сигналы, собирает приоритеты и выдает готовый бриф для основателя.',
    cadence: '08:30 бриф · 19:00 итог дня',
    channels: ['Личка основателя', 'Штабная комната', 'Входящие решения'],
    sourceSystems: ['apps/command-center', 'all'],
  },
  {
    slug: 'product-agent',
    name: 'Продукт',
    kind: 'product',
    mission: 'Следит за качеством продукта, багами, воронкой фич и пользовательским трением.',
    cadence: 'ежедневное здоровье продукта + разбор бэклога',
    channels: ['Штабная комната', 'Веб-офис / Проекты'],
    sourceSystems: ['apps/persona-studio', 'apps/transcribe', 'apps/persona-train', 'apps/ai-hub', 'apps/ig-content'],
  },
  {
    slug: 'growth-agent',
    name: 'Рост',
    kind: 'growth',
    mission: 'Ищет рычаги роста, улучшения упаковки, дистрибуции и лендингов.',
    cadence: 'ежедневные идеи + недельная кампания',
    channels: ['Контент-комната', 'Веб-офис / Контент'],
    sourceSystems: ['apps/ai-content-factory', 'apps/ai-office', 'landings/*'],
  },
  {
    slug: 'research-agent',
    name: 'Ресерч',
    kind: 'research',
    mission: 'Конвертирует тренды и конкурентные сигналы в тестируемые гипотезы.',
    cadence: 'батч трендов + недельный радар',
    channels: ['Контент-комната', 'Веб-офис / Память'],
    sourceSystems: ['services/node/infra-worker', 'apps/persona-studio'],
  },
  {
    slug: 'sales-agent',
    name: 'Продажи',
    kind: 'sales',
    mission: 'Ловит горячие лиды, зависшие диалоги и паттерны потерь в CRM.',
    cadence: 'алерты по горячим лидам в реальном времени',
    channels: ['Комната продаж', 'Личка основателя'],
    sourceSystems: ['apps/tg-agent', 'apps/ig-agent', 'apps/ai-sales'],
  },
  {
    slug: 'support-agent',
    name: 'Поддержка',
    kind: 'support',
    mission: 'Собирает повторяющуюся боль и превращает ее во входы для продукта и роста.',
    cadence: 'ежедневный голос клиента',
    channels: ['Штабная комната', 'Веб-офис / Память'],
    sourceSystems: ['apps/tg-agent', 'apps/ig-agent', 'manual support'],
  },
  {
    slug: 'ops-agent',
    name: 'Операции',
    kind: 'ops',
    mission: 'Следит за инфраструктурой, очередями, деплоями, вебхуками и всплесками сбоев.',
    cadence: 'инциденты в реальном времени + ежедневное здоровье системы',
    channels: ['Операционная комната', 'Личка основателя'],
    sourceSystems: ['infra/', 'services/node/infra-worker', 'services/python/ytdlp', 'apps/persona-studio'],
  },
  {
    slug: 'finance-agent',
    name: 'Финансы',
    kind: 'finance',
    mission: 'Смотрит на burn rate, расходы на токены, инфраструктурные траты и сигналы монетизации.',
    cadence: 'еженедельный финансовый дайджест',
    channels: ['Штабная комната', 'Веб-офис / Дашборд'],
    sourceSystems: ['биллинг-таблицы', 'использование продукта', 'инфраструктурные расходы'],
  },
]

export const OFFICE_EVENT_SOURCES: OfficeEventSource[] = [
  {
    slug: 'persona-studio',
    name: 'Persona Studio',
    kind: 'app',
    repoPath: 'apps/persona-studio',
    emits: ['generation.failed', 'generation.completed', 'billing.tokens_spent', 'research.batch_ready'],
  },
  {
    slug: 'transcribe',
    name: 'Transcribe',
    kind: 'app',
    repoPath: 'apps/transcribe',
    emits: ['transcript.created', 'generation.cached', 'api.error_spike'],
  },
  {
    slug: 'tg-agent',
    name: 'TG Agent',
    kind: 'app',
    repoPath: 'apps/tg-agent',
    emits: ['lead.hot', 'lead.stalled', 'conversation.negative'],
  },
  {
    slug: 'ig-agent',
    name: 'IG Agent',
    kind: 'app',
    repoPath: 'apps/ig-agent',
    emits: ['lead.hot', 'manual.takeover', 'recommendation.ready'],
  },
  {
    slug: 'infra-worker',
    name: 'Infra Worker',
    kind: 'service',
    repoPath: 'services/node/infra-worker',
    emits: ['job.failed', 'trend.batch_ready', 'scheduler.drift'],
  },
  {
    slug: 'ytdlp',
    name: 'ytdlp',
    kind: 'service',
    repoPath: 'services/python/ytdlp',
    emits: ['extract.failed', 'extract.latency_spike'],
  },
]

export const OFFICE_EVENTS: OfficeEventSample[] = [
  {
    id: 'evt_01',
    type: 'generation.failed',
    severity: 'critical',
    title: 'Всплеск сбоев в очереди аватаров',
    summary: 'После рестарта воркера задачи аватаров Persona Studio упали 7 раз за 20 минут.',
    project: 'persona-studio',
    source: 'persona-studio',
    occurredAt: '10 min ago',
  },
  {
    id: 'evt_02',
    type: 'lead.hot',
    severity: 'high',
    title: 'Горячий лид ждет уже 34 минуты',
    summary: 'TG Agent пометил лид с явным намерением купить как горячий, но ответ владельца все еще не отправлен.',
    project: 'tg-agent',
    source: 'tg-agent',
    occurredAt: '34 min ago',
  },
  {
    id: 'evt_03',
    type: 'trend.batch_ready',
    severity: 'medium',
    title: 'Viral Discover нашел 12 сильных креаторских хуков',
    summary: 'Исследовательский батч дал 3 сильных паттерна хука для позиционирования AI-креатора.',
    project: 'viral-discover',
    source: 'infra-worker',
    occurredAt: '2 h ago',
  },
  {
    id: 'evt_04',
    type: 'extract.latency_spike',
    severity: 'low',
    title: 'yt-dlp работает медленнее базовой нормы',
    summary: 'Медианное время извлечения выросло на 42% за последние 3 часа.',
    project: 'transcribe',
    source: 'ytdlp',
    occurredAt: '3 h ago',
  },
]

export const OFFICE_TASKS: OfficeTask[] = [
  {
    id: 'tsk_01',
    title: 'Разобрать сбои воркеров Persona Studio',
    summary: 'Проверить отставание очереди BullMQ, ошибки провайдера Gemini и риск возвратов.',
    project: 'persona-studio',
    ownerAgent: 'ops-agent',
    status: 'in_progress',
    priority: 'p0',
    sourceEventType: 'generation.failed',
  },
  {
    id: 'tsk_02',
    title: 'Подготовить ручной ответ для горячего TG-лида',
    summary: 'Лид спросил про сроки платного запуска и онбординг команды.',
    project: 'tg-agent',
    ownerAgent: 'sales-agent',
    status: 'waiting_approval',
    priority: 'p1',
    sourceEventType: 'lead.hot',
  },
  {
    id: 'tsk_03',
    title: 'Превратить выводы Viral Discover в 3 контент-гипотезы',
    summary: 'Переложить трендовые хуки в недельный план короткого контента.',
    project: 'ai-content-factory',
    ownerAgent: 'growth-agent',
    status: 'triaged',
    priority: 'p2',
    sourceEventType: 'trend.batch_ready',
  },
  {
    id: 'tsk_04',
    title: 'Задокументировать деградацию задержки в ytdlp',
    summary: 'Зафиксировать метрики до/после и решить, нужна ли отдельная карточка инцидента.',
    project: 'transcribe',
    ownerAgent: 'ops-agent',
    status: 'new',
    priority: 'p3',
    sourceEventType: 'extract.latency_spike',
  },
]

export const OFFICE_DECISIONS: OfficeDecision[] = [
  {
    id: 'dec_01',
    title: 'Поставить платный трафик Persona Studio на паузу на 24 часа?',
    summary: 'Всплеск сбоев бьет по платным генерациям аватаров, и риск возвратов растет.',
    project: 'persona-studio',
    requestedBy: 'chief-of-staff',
    status: 'pending',
    recommended: 'pause_24h',
    options: ['pause_24h', 'watch_2h', 'keep_running'],
  },
  {
    id: 'dec_02',
    title: 'Перехватить горячий TG-лид вручную?',
    summary: 'Продажи предлагают прямой ответ владельца вместо продолжения от ИИ.',
    project: 'tg-agent',
    requestedBy: 'sales-agent',
    status: 'pending',
    recommended: 'manual_takeover',
    options: ['manual_takeover', 'draft_reply_only', 'let_ai_continue'],
  },
  {
    id: 'dec_03',
    title: 'Превратить эту неделю в спринт надежности Persona Studio?',
    summary: 'Продукт считает надежность главным блокером для уверенности в монетизации.',
    project: 'persona-studio',
    requestedBy: 'product-agent',
    status: 'deferred',
    recommended: 'shift_focus',
    options: ['shift_focus', 'split_focus', 'keep_current_plan'],
  },
]

export const OFFICE_MEMORY: OfficeMemoryEntry[] = [
  {
    id: 'mem_01',
    kind: 'incident',
    title: 'Нестабильность очереди Persona Studio после рестарта воркера',
    summary: 'Рестарты воркеров могут запускать шторм повторных попыток и скрывать риск возвратов, если сначала не проверить состояние очереди.',
    project: 'persona-studio',
    tags: ['bullmq', 'incident', 'refunds'],
    createdBy: 'ops-agent',
  },
  {
    id: 'mem_02',
    kind: 'research',
    title: 'Тренд в экономике креаторов: хук «ИИ-клон, но с моим лицом» все еще сильнее, чем подача через инструмент',
    summary: 'Тренд-батчи показывают, что язык про смену идентичности работает лучше, чем общий язык про автоматизацию.',
    project: 'persona-studio',
    tags: ['hooks', 'positioning', 'creator'],
    createdBy: 'research-agent',
  },
  {
    id: 'mem_03',
    kind: 'customer_voice',
    title: 'Кластер боли поддержки: пользователи хотят раньше понимать расход токенов до старта генерации',
    summary: 'Пользователи понимают ценность результата, но не понимают время списания и механику возвратов.',
    project: 'persona-studio',
    tags: ['billing', 'ux', 'support'],
    createdBy: 'support-agent',
  },
  {
    id: 'mem_04',
    kind: 'weekly_review',
    title: 'Обзор 23-й недели',
    summary: 'Самая сильная возможность появилась там, где плотнее связались ресерч, рост и надежность продукта.',
    project: 'portfolio',
    tags: ['weekly', 'ceo', 'review'],
    createdBy: 'chief-of-staff',
  },
]

export const OFFICE_JOURNAL: OfficeJournalEntry[] = [
  {
    id: 'jr_01',
    action: 'event.ingested',
    narrative: 'Операции зафиксировали критический всплеск сбоев у воркеров Persona Studio.',
    actor: 'ops-agent',
    target: 'evt_01',
    createdAt: '10 min ago',
  },
  {
    id: 'jr_02',
    action: 'task.created',
    narrative: 'Шеф штаба создал задачу p0 на расследование всплеска сбоев.',
    actor: 'chief-of-staff',
    target: 'tsk_01',
    createdAt: '9 min ago',
  },
  {
    id: 'jr_03',
    action: 'decision.requested',
    narrative: 'Шеф штаба открыл решение: поставить платный трафик на паузу на 24 часа.',
    actor: 'chief-of-staff',
    target: 'dec_01',
    createdAt: '7 min ago',
  },
  {
    id: 'jr_04',
    action: 'memory.created',
    narrative: 'Ресерч сохранил новый сильный паттерн позиционирования из Viral Discover.',
    actor: 'research-agent',
    target: 'mem_02',
    createdAt: '2 h ago',
  },
]

export const OFFICE_DATA_MODEL_TABLES = [
  {
    name: 'office_agents',
    purpose: 'Состав долгоживущих агентских ролей и их зон ответственности.',
  },
  {
    name: 'office_event_sources',
    purpose: 'Реестр систем, которые отдают нормализованные офисные сигналы.',
  },
  {
    name: 'office_events',
    purpose: 'Сырой поток событий по продукту, продажам, операциям и росту.',
  },
  {
    name: 'office_tasks',
    purpose: 'Рабочая очередь, собранная из событий, расписаний и рекомендаций.',
  },
  {
    name: 'office_decisions',
    purpose: 'Точки человеческого апрува с вариантами и рекомендованным действием.',
  },
  {
    name: 'office_memory_entries',
    purpose: 'Долгая память: выводы, инциденты, недельные разборы и уроки.',
  },
  {
    name: 'office_journal_entries',
    purpose: 'Неизменяемый журнал действий по событиям, задачам, решениям и памяти.',
  },
]
