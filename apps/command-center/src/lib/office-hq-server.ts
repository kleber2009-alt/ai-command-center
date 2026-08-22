import { unstable_noStore as noStore } from 'next/cache'
import { getOfficeOverviewData } from '@/lib/office-server'
import {
  OFFICE_HQ_COMMANDS,
  OFFICE_HQ_ESCALATION_RULES,
  OFFICE_HQ_REPORT_SECTIONS,
  OFFICE_HQ_ROUTINES,
  type OfficeHqView,
} from '@/lib/office-hq'
import type { OfficeAgent, OfficeDecision, OfficeEventSample, OfficeTask } from '@/lib/office-core'

type OfficeHqRender = {
  title: string
  text: string
}

type OfficeHqTeamMember = {
  slug: string
  name: string
  kind: OfficeAgent['kind']
  mission: string
  cadence: string
  roleLabel: string
  statusTone: 'good' | 'warning' | 'critical' | 'active'
  statusLabel: string
  focusLabel: string
}

type OfficeHqDecisionItem = {
  id: string
  title: string
  summary: string
  project: string
  requestedBy: string
  status: OfficeDecision['status']
  recommended: string
  options: string[]
}

export type OfficeHqSnapshot = {
  generatedAt: string
  fallback: boolean
  summary: {
    activeAgents: number
    pendingDecisions: number
    openTasks: number
    criticalAlerts: number
    weeklyFocus: string
  }
  team: OfficeHqTeamMember[]
  decisionQueue: OfficeHqDecisionItem[]
  cards: {
    situation: string
    changed: string[]
    risks: string[]
    recommendations: string[]
    decisions: string[]
    nextActions: string[]
  }
  commands: typeof OFFICE_HQ_COMMANDS
  routines: typeof OFFICE_HQ_ROUTINES
  escalationRules: typeof OFFICE_HQ_ESCALATION_RULES
  reportSections: readonly string[]
  renders: Record<Exclude<OfficeHqView, 'snapshot'>, OfficeHqRender>
}

const ROLE_LABELS: Record<OfficeAgent['kind'], string> = {
  chief_of_staff: 'Шеф штаба',
  product: 'Продукт',
  growth: 'Рост',
  research: 'Ресерч',
  sales: 'Продажи',
  support: 'Поддержка',
  ops: 'Операции',
  finance: 'Финансы',
}

const AGENT_LABELS_BY_SLUG: Record<string, string> = {
  'chief-of-staff': 'Шеф штаба',
  'product-agent': 'Продукт',
  'growth-agent': 'Рост',
  'research-agent': 'Ресерч',
  'sales-agent': 'Продажи',
  'support-agent': 'Поддержка',
  'ops-agent': 'Операции',
  'finance-agent': 'Финансы',
}

const OPTION_LABELS: Record<string, string> = {
  pause_24h: 'пауза 24 часа',
  keep_running: 'оставить как есть',
  watch_2h: 'еще 2 часа под наблюдением',
  shift_focus: 'сместить фокус',
  split_focus: 'разделить фокус',
  manual_takeover: 'ручной перехват',
  draft_reply_only: 'только черновик ответа',
  let_ai_continue: 'дать ИИ продолжить',
  keep_current_plan: 'оставить текущий план',
  ship_prod: 'выкатить в прод',
  hold_local: 'оставить на локали',
  none: 'без рекомендации',
}

const TASK_STATUS_LABELS: Record<string, string> = {
  new: 'новая',
  triaged: 'разобрана',
  in_progress: 'в работе',
  blocked: 'заблокирована',
  waiting_approval: 'ждет апрува',
  done: 'выполнена',
}

const SEVERITY_LABELS: Record<string, string> = {
  critical: 'критично',
  high: 'высокий',
  medium: 'средний',
  low: 'низкий',
}

function localizeOptionKey(value: string) {
  return OPTION_LABELS[value] || value.replaceAll('_', ' ')
}

function localizeAgentSlug(value: string) {
  return AGENT_LABELS_BY_SLUG[value] || value
}

function localizeTaskStatus(value: string) {
  return TASK_STATUS_LABELS[value] || value
}

function localizeSeverity(value: string) {
  return SEVERITY_LABELS[value] || value
}

function countTasks(tasks: OfficeTask[], ownerAgent: string, predicate?: (task: OfficeTask) => boolean) {
  return tasks.filter((task) => task.ownerAgent === ownerAgent && (predicate ? predicate(task) : task.status !== 'done')).length
}

function countDecisions(decisions: OfficeDecision[], requestedBy: string) {
  return decisions.filter((decision) => decision.requestedBy === requestedBy && decision.status === 'pending').length
}

function countEvents(events: OfficeEventSample[], matcher: (event: OfficeEventSample) => boolean) {
  return events.filter(matcher).length
}

function buildTeamMemberStatus(agent: OfficeAgent, tasks: OfficeTask[], decisions: OfficeDecision[], events: OfficeEventSample[], weeklyFocus: string): OfficeHqTeamMember {
  const openOwnedTasks = countTasks(tasks, agent.slug)
  const p0OwnedTasks = countTasks(tasks, agent.slug, (task) => task.priority === 'p0' || task.status === 'waiting_approval')
  const pendingOwnedDecisions = countDecisions(decisions, agent.slug)
  const highLeadSignals = countEvents(events, (event) => event.type.includes('lead') || event.type.includes('takeover'))
  const supportSignals = countEvents(events, (event) => event.type.includes('conversation') || event.type.includes('support'))
  const infraSignals = countEvents(events, (event) => event.source === 'infra-worker' || event.type.includes('webhook') || event.type.includes('failed'))
  const billingSignals = countEvents(events, (event) => event.type.includes('billing') || event.type.includes('payment'))

  let statusTone: OfficeHqTeamMember['statusTone'] = 'active'
  let statusLabel = 'В рабочем ритме'
  let focusLabel = agent.mission

  switch (agent.kind) {
    case 'chief_of_staff':
      if (pendingOwnedDecisions > 0 || decisions.some((decision) => decision.status === 'pending')) {
        statusTone = 'warning'
        statusLabel = `${decisions.filter((decision) => decision.status === 'pending').length} решений ждут апрува`
        focusLabel = 'Готовит ясные рекомендации для решения основателя'
      } else {
        statusTone = 'good'
        statusLabel = 'Синхронизирован'
        focusLabel = `Держит фокус недели: ${weeklyFocus}`
      }
      break
    case 'product':
      if (p0OwnedTasks > 0) {
        statusTone = 'critical'
        statusLabel = `${p0OwnedTasks} задач P0`
        focusLabel = 'Стабилизирует продукт и снимает блокеры из очереди апрува'
      } else if (openOwnedTasks > 0) {
        statusTone = 'active'
        statusLabel = `${openOwnedTasks} активных задач`
        focusLabel = 'Двигает релизы и разгружает продуктовый бэклог'
      } else {
        statusTone = 'good'
        statusLabel = 'Контур здоров'
        focusLabel = 'Следит за пользовательским трением и качеством релизов'
      }
      break
    case 'growth':
      if (openOwnedTasks > 0) {
        statusTone = 'active'
        statusLabel = `${openOwnedTasks} активных тестов`
        focusLabel = 'Запускает эксперименты по упаковке и дистрибуции'
      } else {
        statusTone = 'good'
        statusLabel = 'На разведке'
        focusLabel = 'Ищет следующий рычаг роста'
      }
      break
    case 'research':
      if (openOwnedTasks > 0) {
        statusTone = 'active'
        statusLabel = `${openOwnedTasks} гипотез в работе`
        focusLabel = 'Превращает внешние сигналы в тестируемые ходы'
      } else {
        statusTone = 'good'
        statusLabel = 'Радар включен'
        focusLabel = 'Сканирует тренды и конкурентные сигналы'
      }
      break
    case 'sales':
      if (highLeadSignals > 0 || pendingOwnedDecisions > 0) {
        statusTone = 'warning'
        statusLabel = `${Math.max(highLeadSignals, pendingOwnedDecisions)} горячих эпизодов`
        focusLabel = 'Смотрит за горячими лидами и ручными перехватами'
      } else {
        statusTone = 'good'
        statusLabel = 'Воронка под контролем'
        focusLabel = 'Дожимает зависшие диалоги и сигналы намерения купить'
      }
      break
    case 'support':
      if (supportSignals > 0) {
        statusTone = 'warning'
        statusLabel = `${supportSignals} сигналов боли`
        focusLabel = 'Собирает повторяющееся трение в продуктовые входы'
      } else {
        statusTone = 'good'
        statusLabel = 'Пульс клиента ровный'
        focusLabel = 'Следит за доверием и проблемами поддержки'
      }
      break
    case 'ops':
      if (infraSignals > 0) {
        statusTone = 'critical'
        statusLabel = `${infraSignals} сигналов инцидентов`
        focusLabel = 'Следит за очередями, вебхуками, задачами и всплесками ошибок'
      } else {
        statusTone = 'good'
        statusLabel = 'Инфра стабильна'
        focusLabel = 'Держит в порядке доставку, пайплайны и автоматизацию'
      }
      break
    case 'finance':
      if (billingSignals > 0 || pendingOwnedDecisions > 0) {
        statusTone = 'warning'
        statusLabel = `${Math.max(billingSignals, pendingOwnedDecisions)} денежных проверок`
        focusLabel = 'Следит за монетизацией, тратами и юнит-экономикой'
      } else {
        statusTone = 'good'
        statusLabel = 'Расходы под контролем'
        focusLabel = 'Отслеживает burn rate, расходы на инфраструктуру и денежные сигналы'
      }
      break
  }

  return {
    slug: agent.slug,
    name: agent.name,
    kind: agent.kind,
    mission: agent.mission,
    cadence: agent.cadence,
    roleLabel: ROLE_LABELS[agent.kind],
    statusTone,
    statusLabel,
    focusLabel,
  }
}

function uniqueNonEmpty(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]))
}

function pickDecisionLine(decision: { title: string; project: string; recommended: string }) {
  return `${decision.title} -> ${localizeOptionKey(decision.recommended)} (${decision.project})`
}

function pickTaskLine(task: { title: string; ownerAgent: string; priority: string; status: string }) {
  return `${task.title} -> ${localizeAgentSlug(task.ownerAgent)} [${task.priority}, ${localizeTaskStatus(task.status)}]`
}

function pickRiskLine(event: { title: string; severity: string; project: string }) {
  return `${event.title} [${localizeSeverity(event.severity)}] (${event.project})`
}

function renderLines(title: string, lines: string[]) {
  return `${title}\n\n${lines.join('\n')}`.trim()
}

function buildHelpText() {
  const lines = [
    'Протокол штаба',
    '',
    'Ты говоришь с одним штабом, а не с восемью разрозненными ботами.',
    '',
    'Команды:',
    ...OFFICE_HQ_COMMANDS.map((item) => `${item.command} — ${item.intent}`),
    '',
    'Ритуалы:',
    ...OFFICE_HQ_ROUTINES.map((item) => `${item.cadence} · ${item.title} · ${item.owner}`),
    '',
    'Формат отчета:',
    ...OFFICE_HQ_REPORT_SECTIONS.map((section) => `- ${section}`),
  ]

  return renderLines('Штаб офиса', lines)
}

export async function getOfficeHqSnapshot(): Promise<OfficeHqSnapshot> {
  noStore()
  const overview = await getOfficeOverviewData()
  const pendingDecisions = overview.decisions.filter((decision) => decision.status === 'pending')
  const urgentTasks = overview.tasks.filter((task) => task.priority === 'p0' || task.status === 'waiting_approval')
  const criticalEvents = overview.events.filter((event) => event.severity === 'critical' || event.severity === 'high')

  const changed = uniqueNonEmpty([
    overview.events[0]?.title || null,
    overview.journal[0]?.narrative,
    overview.memory[0] ? `память: ${overview.memory[0].title}` : null,
  ])

  const risks = uniqueNonEmpty([
    ...criticalEvents.slice(0, 3).map((event) => pickRiskLine(event)),
    ...pendingDecisions.slice(0, 2).map((decision) => `ждет решения: ${decision.title}`),
  ])

  const recommendations = uniqueNonEmpty([
    overview.summary.weeklyFocus ? `Держать фокус недели: ${overview.summary.weeklyFocus}` : null,
    urgentTasks[0] ? `Сначала двинуть ${urgentTasks[0].title}` : null,
    pendingDecisions[0] ? `Закрыть решение: ${pendingDecisions[0].title}` : null,
  ])

  const decisions = uniqueNonEmpty(
    pendingDecisions.length
      ? pendingDecisions.slice(0, 5).map((decision) => pickDecisionLine(decision))
      : ['Нет решений в ожидании.']
  )

  const nextActions = uniqueNonEmpty(
    urgentTasks.length
      ? urgentTasks.slice(0, 5).map((task) => pickTaskLine(task))
      : ['Срочных задач в очереди нет.']
  )

  const situation = `В офисе сейчас работают ${overview.summary.activeAgents} агентов, открыты ${overview.summary.openTasks} задач, ждут решения ${overview.summary.pendingDecisions} развилки, критических алертов — ${overview.summary.criticalAlerts}.`
  const modeLine = overview.fallback ? 'Режим: резервные стартовые данные.' : 'Режим: живые данные офисного ядра.'
  const team = overview.agents.map((agent) =>
    buildTeamMemberStatus(agent, overview.tasks, overview.decisions, overview.events, overview.summary.weeklyFocus)
  )
  const decisionQueue = pendingDecisions.slice(0, 8).map((decision) => ({
    id: decision.id,
    title: decision.title,
    summary: decision.summary,
    project: decision.project,
    requestedBy: decision.requestedBy,
    status: decision.status,
    recommended: decision.recommended,
    options: decision.options,
  }))

  const brief = renderLines('Краткий бриф', [
    situation,
    modeLine,
    '',
    'Ситуация',
    `- Фокус недели: ${overview.summary.weeklyFocus}`,
    `- Критических алертов: ${overview.summary.criticalAlerts}`,
    '',
    'Что изменилось',
    ...changed.map((line) => `- ${line}`),
    '',
    'Риски',
    ...risks.map((line) => `- ${line}`),
    '',
    'Что требует твоего решения',
    ...decisions.map((line) => `- ${line}`),
    '',
    'Следующие действия по владельцам',
    ...nextActions.map((line) => `- ${line}`),
  ])

  const standup = renderLines('Планерка команды', [
    `Шеф штаба -> ${overview.summary.weeklyFocus}`,
    ...team.map((agent) => `${agent.roleLabel} -> ${agent.statusLabel}. ${agent.focusLabel}`),
  ])

  const focus = renderLines('Фокус недели', [
    `Фокус недели -> ${overview.summary.weeklyFocus}`,
    '',
    'Очередь P0 / на апрув',
    ...uniqueNonEmpty(urgentTasks.slice(0, 6).map((task) => `- ${pickTaskLine(task)}`)),
  ])

  const escalations = renderLines('Эскалации', [
    criticalEvents.length ? 'Критические и высокоприоритетные сигналы' : 'Сейчас критических эскалаций нет.',
    ...criticalEvents.slice(0, 5).map((event) => `- ${pickRiskLine(event)}`),
    '',
    'Правила маршрутизации',
    ...OFFICE_HQ_ESCALATION_RULES.map((rule) => `- ${rule.trigger} -> ${rule.route}`),
  ])

  const decisionInbox = renderLines('Входящие решения', [
    pendingDecisions.length ? 'Ждут апрува' : 'Нет решений в ожидании.',
    ...pendingDecisions.slice(0, 8).map((decision) => `- ${pickDecisionLine(decision)}`),
  ])

  return {
    generatedAt: new Date().toISOString(),
    fallback: overview.fallback,
    summary: {
      activeAgents: overview.summary.activeAgents,
      pendingDecisions: overview.summary.pendingDecisions,
      openTasks: overview.summary.openTasks,
      criticalAlerts: overview.summary.criticalAlerts,
      weeklyFocus: overview.summary.weeklyFocus,
    },
    team,
    decisionQueue,
    cards: {
      situation,
      changed,
      risks,
      recommendations,
      decisions,
      nextActions,
    },
    commands: OFFICE_HQ_COMMANDS,
    routines: OFFICE_HQ_ROUTINES,
    escalationRules: OFFICE_HQ_ESCALATION_RULES,
    reportSections: OFFICE_HQ_REPORT_SECTIONS,
    renders: {
      help: { title: 'Штаб офиса', text: buildHelpText() },
      brief: { title: 'Краткий бриф', text: brief },
      standup: { title: 'Планерка команды', text: standup },
      focus: { title: 'Фокус недели', text: focus },
      escalations: { title: 'Эскалации', text: escalations },
      decisions: { title: 'Входящие решения', text: decisionInbox },
    },
  }
}

export async function getOfficeHqView(view: OfficeHqView) {
  const snapshot = await getOfficeHqSnapshot()
  if (view === 'snapshot') return snapshot
  return {
    view,
    generatedAt: snapshot.generatedAt,
    fallback: snapshot.fallback,
    reportSections: snapshot.reportSections,
    ...snapshot.renders[view],
  }
}
