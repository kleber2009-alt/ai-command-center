import { unstable_noStore as noStore } from 'next/cache'
import { db } from '@/lib/db'
import {
  OFFICE_AGENTS,
  OFFICE_DATA_MODEL_TABLES,
  OFFICE_DECISIONS,
  OFFICE_EVENT_SOURCES,
  OFFICE_EVENTS,
  OFFICE_JOURNAL,
  OFFICE_MEMORY,
  OFFICE_SUMMARY,
  OFFICE_TASKS,
  type OfficeAgent,
  type OfficeDecision,
  type OfficeDecisionStatus,
  type OfficeEventSample,
  type OfficeEventSource,
  type OfficeJournalEntry,
  type OfficeMemoryEntry,
  type OfficeTask,
} from '@/lib/office-core'

type OfficeSummary = typeof OFFICE_SUMMARY

export type OfficeOverviewData = {
  agents: OfficeAgent[]
  summary: OfficeSummary
  events: OfficeEventSample[]
  tasks: OfficeTask[]
  decisions: OfficeDecision[]
  memory: OfficeMemoryEntry[]
  journal: OfficeJournalEntry[]
  fallback: boolean
}

export type OfficeAgentsPageData = {
  agents: OfficeAgent[]
  sources: OfficeEventSource[]
  fallback: boolean
}

export type OfficeDecisionsPageData = {
  decisions: OfficeDecision[]
  tasks: OfficeTask[]
  fallback: boolean
}

export type OfficeMemoryPageData = {
  memory: OfficeMemoryEntry[]
  journal: OfficeJournalEntry[]
  fallback: boolean
}

export type OfficeModelData = {
  tables: typeof OFFICE_DATA_MODEL_TABLES
}

type OfficeCoreAvailability = {
  agents: boolean
  sources: boolean
  events: boolean
  tasks: boolean
  decisions: boolean
  memory: boolean
  journal: boolean
  briefs: boolean
}

const OFFICE_TEXT_TRANSLATIONS: Record<string, string> = {
  'Persona Studio reliability + sales follow-up discipline': 'Надежность Persona Studio и дисциплина повторных касаний в продажах',
  'Chief of Staff': 'Шеф штаба',
  'Product Agent': 'Продукт',
  'Growth Agent': 'Рост',
  'Research Agent': 'Ресерч',
  'Sales Agent': 'Продажи',
  'Support Agent': 'Поддержка',
  'Ops Agent': 'Операции',
  'Finance Agent': 'Финансы',
  '08:30 brief · 19:00 wrap-up': '08:30 бриф · 19:00 итог дня',
  'daily health + backlog triage': 'ежедневное здоровье продукта + triage бэклога',
  'daily ideas + weekly campaign': 'ежедневные идеи + недельная кампания',
  'trend batch + weekly radar': 'батч трендов + недельный радар',
  'real-time hot lead alerts': 'алерты по горячим лидам в реальном времени',
  'daily voice-of-customer': 'ежедневный голос клиента',
  'real-time incidents + daily health': 'инциденты в реальном времени + ежедневное здоровье системы',
  'weekly CFO digest': 'еженедельный CFO-дайджест',
  'Avatar queue failure spike': 'Всплеск сбоев в очереди аватаров',
  'Persona Studio avatar jobs failed 7 times in 20 minutes after worker restart.': 'После рестарта воркера задачи аватаров Persona Studio упали 7 раз за 20 минут.',
  'Hot lead waiting 34 minutes': 'Горячий лид ждет уже 34 минуты',
  'TG Agent marked a buyer-intent lead as hot and owner reply is still pending.': 'TG Agent пометил лид с явным намерением купить как горячий, но ответ владельца все еще не отправлен.',
  'Viral Discover found 12 creator hooks': 'Viral Discover нашел 12 сильных креаторских хуков',
  'Research batch produced 3 high-confidence hook patterns for AI creator positioning.': 'Исследовательский батч дал 3 сильных паттерна хука для позиционирования AI-креатора.',
  'yt-dlp extraction slower than baseline': 'yt-dlp работает медленнее базовой нормы',
  'Median extraction time is up 42% over the last 3 hours.': 'Медианное время извлечения выросло на 42% за последние 3 часа.',
  'Investigate Persona Studio worker failures': 'Разобрать сбои воркеров Persona Studio',
  'Check BullMQ queue backlog, Gemini provider errors, and refund exposure.': 'Проверить отставание очереди BullMQ, ошибки провайдера Gemini и риск возвратов.',
  'Prepare manual reply for hot TG lead': 'Подготовить ручной ответ для горячего TG-лида',
  'Lead asked about paid rollout timeline and team onboarding.': 'Лид спросил про сроки платного запуска и онбординг команды.',
  'Convert Viral Discover findings into 3 content bets': 'Превратить выводы Viral Discover в 3 контент-гипотезы',
  'Map trending hooks into short-form content plan for the week.': 'Переложить трендовые хуки в недельный план короткого контента.',
  'Document ytdlp latency regression': 'Задокументировать деградацию задержки в ytdlp',
  'Capture before/after metrics and decide whether it needs an incident record.': 'Зафиксировать метрики до/после и решить, нужна ли отдельная карточка инцидента.',
  'Pause paid Persona Studio traffic for 24 hours?': 'Поставить платный трафик Persona Studio на паузу на 24 часа?',
  'Failure spike affects paid avatar generations and refund exposure is growing.': 'Всплеск сбоев бьет по платным генерациям аватаров, и риск возвратов растет.',
  'Take over the hot TG lead manually?': 'Перехватить горячий TG-лид вручную?',
  'Sales Agent suggests direct owner reply instead of AI continuation.': 'Продажи предлагают прямой ответ владельца вместо продолжения от ИИ.',
  'Turn this week into a Persona Studio reliability sprint?': 'Превратить эту неделю в спринт надежности Persona Studio?',
  'Product Agent sees reliability as the main blocker for monetization confidence.': 'Продукт считает надежность главным блокером для уверенности в монетизации.',
  'Persona Studio queue instability after worker restart': 'Нестабильность очереди Persona Studio после рестарта воркера',
  'Worker restarts can create retry storms and hide refund exposure unless queue state is checked first.': 'Рестарты воркеров могут запускать шторм повторных попыток и скрывать риск возвратов, если сначала не проверить состояние очереди.',
  'Creator trend: “AI clone, but with my own face” hook keeps outperforming tooling-first framing': 'Тренд в экономике креаторов: хук «ИИ-клон, но с моим лицом» все еще сильнее, чем подача через инструмент',
  'Creator trend: "AI clone, but with my own face" hook keeps outperforming tooling-first framing': 'Тренд в экономике креаторов: хук «ИИ-клон, но с моим лицом» все еще сильнее, чем подача через инструмент',
  'Trend batches show stronger response to identity transformation than generic automation language.': 'Тренд-батчи показывают, что язык про смену идентичности работает лучше, чем общий язык про автоматизацию.',
  'Support pain cluster: users want faster explanation of token spend before generation starts': 'Кластер боли поддержки: пользователи хотят раньше понимать расход токенов до старта генерации',
  'Users understand output value, but not pricing timing and refund behavior.': 'Пользователи понимают ценность результата, но не понимают время списания и механику возвратов.',
  'Week 23 review': 'Обзор 23-й недели',
  'Biggest opportunity came from tighter handoff between research, growth, and product reliability.': 'Самая сильная возможность появилась там, где плотнее связались ресерч, рост и надежность продукта.',
  'Ops Agent captured a critical failure spike from Persona Studio workers.': 'Операции зафиксировали критический всплеск сбоев у воркеров Persona Studio.',
  'Chief of Staff created a p0 investigation task for the failure spike.': 'Шеф штаба создал задачу p0 на расследование всплеска сбоев.',
  'Chief of Staff opened a decision to pause paid traffic for 24 hours.': 'Шеф штаба открыл решение: поставить платный трафик на паузу на 24 часа.',
  'Research Agent stored a new high-performing positioning pattern from Viral Discover.': 'Ресерч сохранил новый сильный паттерн позиционирования из Viral Discover.',
}

function localizeOfficeText(value: string | null | undefined) {
  if (!value) return value ?? ''
  return OFFICE_TEXT_TRANSLATIONS[value] || value
}

async function tableExists(name: string) {
  const { rows } = await db.query<{ exists: boolean }>(
    'select to_regclass($1) is not null as exists',
    [`public.${name}`],
  )
  return rows[0]?.exists ?? false
}

async function officeCoreAvailability() {
  const [agents, sources, events, tasks, decisions, memory, journal, briefs] = await Promise.all([
    tableExists('office_agents'),
    tableExists('office_event_sources'),
    tableExists('office_events'),
    tableExists('office_tasks'),
    tableExists('office_decisions'),
    tableExists('office_memory_entries'),
    tableExists('office_journal_entries'),
    tableExists('office_daily_briefs'),
  ])

  return { agents, sources, events, tasks, decisions, memory, journal, briefs }
}

async function readOfficeCoreAvailability(): Promise<OfficeCoreAvailability | null> {
  try {
    return await officeCoreAvailability()
  } catch (error) {
    console.warn('[office] falling back to mock data because office-core DB probe failed', error)
    return null
  }
}

function formatAgo(value: string | Date | null | undefined) {
  if (!value) return 'неизвестно'
  const now = Date.now()
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return String(value)
  const diffMinutes = Math.max(1, Math.round((now - then) / 60000))
  if (diffMinutes < 60) return `${diffMinutes} мин назад`
  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} ч назад`
  const diffDays = Math.round(diffHours / 24)
  return `${diffDays} дн назад`
}

function buildSummary({
  agents,
  tasks,
  decisions,
  events,
  memory,
  weeklyFocus,
}: {
  agents: OfficeAgent[]
  tasks: OfficeTask[]
  decisions: OfficeDecision[]
  events: OfficeEventSample[]
  memory: OfficeMemoryEntry[]
  weeklyFocus: string
}): OfficeSummary {
  return {
    activeAgents: agents.length,
    pendingDecisions: decisions.filter((decision) => decision.status === 'pending').length,
    openTasks: tasks.filter((task) => task.status !== 'done').length,
    criticalAlerts: events.filter((event) => event.severity === 'critical').length,
    memoryEntries: memory.length,
    weeklyFocus,
  }
}

async function getDbAgents(): Promise<OfficeAgent[]> {
  const { rows } = await db.query<{
    slug: string
    name: string
    kind: OfficeAgent['kind']
    mission: string
    cadence: string
    primary_channels: string[] | null
    source_systems: string[] | null
  }>(`
    select slug, name, kind, mission, cadence, primary_channels, source_systems
    from office_agents
    order by slug
  `)

  if (!rows.length) return OFFICE_AGENTS

  return rows.map((row) => ({
    slug: row.slug,
    name: localizeOfficeText(row.name),
    kind: row.kind,
    mission: localizeOfficeText(row.mission),
    cadence: localizeOfficeText(row.cadence || 'ритм не задан'),
    channels: Array.isArray(row.primary_channels) ? row.primary_channels : [],
    sourceSystems: Array.isArray(row.source_systems) ? row.source_systems : [],
  }))
}

async function getDbSources(): Promise<OfficeEventSource[]> {
  const { rows } = await db.query<{
    slug: string
    display_name: string
    system_kind: OfficeEventSource['kind']
    repo_path: string
    emits: string[] | null
  }>(`
    select slug, display_name, system_kind, repo_path, emits
    from office_event_sources
    where enabled = true
    order by slug
  `)

  if (!rows.length) return OFFICE_EVENT_SOURCES

  return rows.map((row) => ({
    slug: row.slug,
    name: row.display_name,
    kind: row.system_kind,
    repoPath: row.repo_path,
    emits: Array.isArray(row.emits) ? row.emits : [],
  }))
}

async function getDbEvents(): Promise<OfficeEventSample[]> {
  const { rows } = await db.query<{
    id: string
    event_type: string
    severity: OfficeEventSample['severity']
    title: string
    summary: string
    project_slug: string | null
    source_slug: string | null
    occurred_at: string
  }>(`
    select e.id, e.event_type, e.severity, e.title, e.summary,
           e.project_slug, s.slug as source_slug, e.occurred_at
    from office_events e
    left join office_event_sources s on s.id = e.source_id
    order by e.occurred_at desc
    limit 12
  `)

  if (!rows.length) return OFFICE_EVENTS

  return rows.map((row) => ({
    id: row.id,
    type: row.event_type,
    severity: row.severity,
    title: localizeOfficeText(row.title),
    summary: localizeOfficeText(row.summary),
    project: row.project_slug || 'portfolio',
    source: row.source_slug || 'неизвестно',
    occurredAt: formatAgo(row.occurred_at),
  }))
}

async function getDbTasks(): Promise<OfficeTask[]> {
  const { rows } = await db.query<{
    id: string
    title: string
    summary: string
    project_slug: string | null
    owner_agent_slug: string | null
    status: OfficeTask['status']
    priority: OfficeTask['priority']
    source_event_type: string | null
  }>(`
    select t.id, t.title, t.summary, t.project_slug, t.owner_agent_slug,
           t.status, t.priority, e.event_type as source_event_type
    from office_tasks t
    left join office_events e on e.id = t.source_event_id
    order by
      case t.priority
        when 'p0' then 0
        when 'p1' then 1
        when 'p2' then 2
        else 3
      end,
      t.created_at desc
    limit 20
  `)

  if (!rows.length) return OFFICE_TASKS

  return rows.map((row) => ({
    id: row.id,
    title: localizeOfficeText(row.title),
    summary: localizeOfficeText(row.summary),
    project: row.project_slug || 'portfolio',
    ownerAgent: row.owner_agent_slug || 'не назначен',
    status: row.status,
    priority: row.priority,
    sourceEventType: row.source_event_type || 'manual',
  }))
}

async function getDbDecisions(): Promise<OfficeDecision[]> {
  const { rows } = await db.query<{
    id: string
    title: string
    summary: string
    project_slug: string | null
    requested_by_agent_slug: string | null
    status: OfficeDecision['status']
    recommended_option_key: string | null
    options: Array<{ option_key: string }> | null
  }>(`
    select d.id, d.title, d.summary, d.project_slug, d.requested_by_agent_slug,
           d.status, d.recommended_option_key,
           coalesce(
             jsonb_agg(jsonb_build_object('option_key', o.option_key) order by o.created_at)
             filter (where o.id is not null),
             '[]'::jsonb
           ) as options
    from office_decisions d
    left join office_decision_options o on o.decision_id = d.id
    group by d.id
    order by d.requested_at desc
    limit 20
  `)

  if (!rows.length) return OFFICE_DECISIONS

  return rows.map((row) => ({
    id: row.id,
    title: localizeOfficeText(row.title),
    summary: localizeOfficeText(row.summary),
    project: row.project_slug || 'portfolio',
    requestedBy: row.requested_by_agent_slug || 'неизвестно',
    status: row.status,
    recommended: row.recommended_option_key || 'none',
    options: Array.isArray(row.options) ? row.options.map((option) => option.option_key) : [],
  }))
}

async function getDbMemory(): Promise<OfficeMemoryEntry[]> {
  const { rows } = await db.query<{
    id: string
    kind: OfficeMemoryEntry['kind']
    title: string
    summary: string
    project_slug: string | null
    tags: string[] | null
    created_by_agent_slug: string | null
  }>(`
    select id, kind, title, summary, project_slug, tags, created_by_agent_slug
    from office_memory_entries
    order by created_at desc
    limit 20
  `)

  if (!rows.length) return OFFICE_MEMORY

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: localizeOfficeText(row.title),
    summary: localizeOfficeText(row.summary),
    project: row.project_slug || 'portfolio',
    tags: Array.isArray(row.tags) ? row.tags : [],
    createdBy: row.created_by_agent_slug || 'неизвестно',
  }))
}

async function getDbJournal(): Promise<OfficeJournalEntry[]> {
  const { rows } = await db.query<{
    id: string
    action_kind: string
    narrative: string
    actor_id: string | null
    entity_id: string | null
    created_at: string
  }>(`
    select id, action_kind, narrative, actor_id, entity_id, created_at
    from office_journal_entries
    order by created_at desc
    limit 20
  `)

  if (!rows.length) return OFFICE_JOURNAL

  return rows.map((row) => ({
    id: row.id,
    action: row.action_kind,
    narrative: localizeOfficeText(row.narrative),
    actor: row.actor_id || 'система',
    target: row.entity_id || 'n/a',
    createdAt: formatAgo(row.created_at),
  }))
}

async function getWeeklyFocus(briefsTableAvailable: boolean) {
  if (!briefsTableAvailable) return localizeOfficeText(OFFICE_SUMMARY.weeklyFocus)

  const { rows } = await db.query<{ summary: string }>(`
    select summary
    from office_daily_briefs
    order by brief_date desc, created_at desc
    limit 1
  `)

  return localizeOfficeText(rows[0]?.summary || OFFICE_SUMMARY.weeklyFocus)
}

export async function getOfficeOverviewData(): Promise<OfficeOverviewData> {
  noStore()
  const availability = await readOfficeCoreAvailability()

  try {
    const fallback = !availability || !Object.values(availability).some(Boolean)

    const [agents, events, tasks, decisions, memory, journal, weeklyFocus] = await Promise.all([
      availability?.agents ? getDbAgents() : Promise.resolve(OFFICE_AGENTS),
      availability?.events ? getDbEvents() : Promise.resolve(OFFICE_EVENTS),
      availability?.tasks ? getDbTasks() : Promise.resolve(OFFICE_TASKS),
      availability?.decisions ? getDbDecisions() : Promise.resolve(OFFICE_DECISIONS),
      availability?.memory ? getDbMemory() : Promise.resolve(OFFICE_MEMORY),
      availability?.journal ? getDbJournal() : Promise.resolve(OFFICE_JOURNAL),
      getWeeklyFocus(Boolean(availability?.briefs)),
    ])

    return {
      agents,
      summary: buildSummary({ agents, tasks, decisions, events, memory, weeklyFocus }),
      events,
      tasks,
      decisions,
      memory,
      journal,
      fallback,
    }
  } catch (error) {
    console.warn('[office] falling back to mock overview payload after read failure', error)
    return {
      agents: OFFICE_AGENTS,
      summary: OFFICE_SUMMARY,
      events: OFFICE_EVENTS,
      tasks: OFFICE_TASKS,
      decisions: OFFICE_DECISIONS,
      memory: OFFICE_MEMORY,
      journal: OFFICE_JOURNAL,
      fallback: true,
    }
  }
}

export async function getOfficeAgentsPageData(): Promise<OfficeAgentsPageData> {
  noStore()
  const availability = await readOfficeCoreAvailability()

  try {
    const fallback = !availability?.agents || !availability?.sources

    const [agents, sources] = await Promise.all([
      availability?.agents ? getDbAgents() : Promise.resolve(OFFICE_AGENTS),
      availability?.sources ? getDbSources() : Promise.resolve(OFFICE_EVENT_SOURCES),
    ])

    return { agents, sources, fallback }
  } catch (error) {
    console.warn('[office] falling back to mock agents payload after read failure', error)
    return { agents: OFFICE_AGENTS, sources: OFFICE_EVENT_SOURCES, fallback: true }
  }
}

export async function getOfficeDecisionsPageData(): Promise<OfficeDecisionsPageData> {
  noStore()
  const availability = await readOfficeCoreAvailability()

  try {
    const fallback = !availability?.decisions || !availability?.tasks

    const [decisions, tasks] = await Promise.all([
      availability?.decisions ? getDbDecisions() : Promise.resolve(OFFICE_DECISIONS),
      availability?.tasks ? getDbTasks() : Promise.resolve(OFFICE_TASKS),
    ])

    return { decisions, tasks, fallback }
  } catch (error) {
    console.warn('[office] falling back to mock decisions payload after read failure', error)
    return { decisions: OFFICE_DECISIONS, tasks: OFFICE_TASKS, fallback: true }
  }
}

export async function getOfficeMemoryPageData(): Promise<OfficeMemoryPageData> {
  noStore()
  const availability = await readOfficeCoreAvailability()

  try {
    const fallback = !availability?.memory || !availability?.journal

    const [memory, journal] = await Promise.all([
      availability?.memory ? getDbMemory() : Promise.resolve(OFFICE_MEMORY),
      availability?.journal ? getDbJournal() : Promise.resolve(OFFICE_JOURNAL),
    ])

    return { memory, journal, fallback }
  } catch (error) {
    console.warn('[office] falling back to mock memory payload after read failure', error)
    return { memory: OFFICE_MEMORY, journal: OFFICE_JOURNAL, fallback: true }
  }
}

export async function getOfficeModelData(): Promise<OfficeModelData> {
  noStore()
  return { tables: OFFICE_DATA_MODEL_TABLES }
}

export async function updateOfficeDecision(input: {
  id: string
  status: OfficeDecisionStatus
  resolutionNote?: string
  selectedOptionKey?: string
  actorId?: string
}) {
  noStore()
  try {
    const decisionsTableExists = await tableExists('office_decisions')
    if (!decisionsTableExists) {
      return { ok: false as const, status: 503, error: 'office_core_not_initialized' }
    }

    const { rows } = await db.query<{
      id: string
      status: OfficeDecisionStatus
      resolved_option_key: string | null
      resolution_note: string | null
    }>(
      `
        update office_decisions
        set status = $2,
            resolution_note = coalesce($3, resolution_note),
            resolved_option_key = coalesce($4, resolved_option_key),
            resolved_at = case when $2 in ('approved','rejected','deferred') then now() else resolved_at end
        where id = $1::uuid
        returning id, status, resolved_option_key, resolution_note
      `,
      [input.id, input.status, input.resolutionNote || null, input.selectedOptionKey || null],
    )

    if (!rows.length) {
      return { ok: false as const, status: 404, error: 'not_found' }
    }

    if (await tableExists('office_journal_entries')) {
      await db.query(
        `
          insert into office_journal_entries (entity_kind, entity_id, action_kind, actor_type, actor_id, narrative, metadata)
          values ($1, $2::uuid, $3, $4, $5, $6, $7::jsonb)
        `,
        [
          'office_decision',
          input.id,
          'decision.resolved',
          'human',
          input.actorId || 'manual',
          `Decision ${input.id} marked as ${input.status}.`,
          JSON.stringify({
            status: input.status,
            selectedOptionKey: input.selectedOptionKey || null,
          }),
        ],
      )
    }

    return { ok: true as const, status: 200, decision: rows[0] }
  } catch (error) {
    console.warn('[office] failed to update office decision', error)
    return { ok: false as const, status: 503, error: 'office_core_unavailable' }
  }
}
