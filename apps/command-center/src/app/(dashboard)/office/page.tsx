import { AlertTriangle, BellRing, Bot, Brain, FolderKanban, ScrollText } from 'lucide-react'
import { OfficePageHeader, OfficePanel, StatCard, ToneBadge } from '@/components/office/office-primitives'
import { getOfficeOverviewData } from '@/lib/office-server'

export const dynamic = 'force-dynamic'

const AGENT_LABELS: Record<string, string> = {
  'chief-of-staff': 'Шеф штаба',
  'product-agent': 'Продукт',
  'growth-agent': 'Рост',
  'research-agent': 'Ресерч',
  'sales-agent': 'Продажи',
  'support-agent': 'Поддержка',
  'ops-agent': 'Операции',
  'finance-agent': 'Финансы',
}

const TASK_STATUS_LABELS: Record<string, string> = {
  new: 'новая',
  triaged: 'разобрана',
  in_progress: 'в работе',
  blocked: 'заблокирована',
  waiting_approval: 'ждет апрува',
  done: 'выполнена',
}

const DECISION_OPTION_LABELS: Record<string, string> = {
  pause_24h: 'пауза 24 часа',
  keep_running: 'оставить как есть',
  watch_2h: 'еще 2 часа под наблюдением',
  shift_focus: 'сместить фокус',
  split_focus: 'разделить фокус',
  manual_takeover: 'ручной перехват',
  draft_reply_only: 'только черновик ответа',
  let_ai_continue: 'дать ИИ продолжить',
  keep_current_plan: 'оставить текущий план',
}

const DECISION_STATUS_LABELS: Record<string, string> = {
  pending: 'ждет решения',
  approved: 'одобрено',
  rejected: 'отклонено',
  deferred: 'отложено',
}

const SEVERITY_LABELS: Record<string, string> = {
  critical: 'критично',
  high: 'высокий',
  medium: 'средний',
  low: 'низкий',
}

function agentLabel(value: string) {
  return AGENT_LABELS[value] || value
}

function taskStatusLabel(value: string) {
  return TASK_STATUS_LABELS[value] || value
}

function decisionOptionLabel(value: string) {
  return DECISION_OPTION_LABELS[value] || value.replaceAll('_', ' ')
}

function decisionStatusLabel(value: string) {
  return DECISION_STATUS_LABELS[value] || value
}

function severityLabel(value: string) {
  return SEVERITY_LABELS[value] || value
}

export default async function OfficeOverviewPage() {
  const data = await getOfficeOverviewData()

  return (
    <div className="space-y-6">
      <OfficePageHeader
        title="Обзор офиса"
        description="Главный обзор будущего веб-офиса: какие сигналы живут в системе, сколько решений ждут тебя, и как агентская команда будет держать весь портфель в фокусе."
        extra={<ToneBadge tone={data.fallback ? 'medium' : 'approved'}>{data.fallback ? 'резервные данные' : 'живые данные'}</ToneBadge>}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Активные агенты" value={data.summary.activeAgents} hint="Постоянная команда с отдельными зонами ответственности." />
        <StatCard label="Решения в ожидании" value={data.summary.pendingDecisions} hint="Решения, которые лучше не терять в Telegram-шуме." />
        <StatCard label="Открытые задачи" value={data.summary.openTasks} hint="Рабочая очередь офиса: от расследований до growth-действий." />
        <StatCard label="Критические алерты" value={data.summary.criticalAlerts} hint="То, что должно сразу подниматься в личку основателя." />
        <StatCard label="Записи памяти" value={data.summary.memoryEntries} hint="Накопленная память офиса: выводы, инциденты, недельные обзоры." />
        <StatCard label="Фокус недели" value="1" hint={data.summary.weeklyFocus} />
      </div>

      {data.fallback ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100/80">
              Интерфейс офиса уже читает серверный слой, но сейчас показывает резервные данные, пока `office_*` таблицы не накатаны или недоступны.
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <OfficePanel title="Живая лента сигналов" eyebrow="События">
          <div className="space-y-3">
            {data.events.map((event) => (
              <div key={event.id} className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <ToneBadge tone={event.severity}>{severityLabel(event.severity)}</ToneBadge>
                    <span className="font-mono text-xs text-slate-500">{event.type}</span>
                  </div>
                  <span className="text-xs text-slate-500">{event.occurredAt}</span>
                </div>
                <div className="mt-3 text-sm font-semibold text-slate-100">{event.title}</div>
                <div className="mt-1 text-sm leading-relaxed text-slate-400">{event.summary}</div>
                <div className="mt-3 text-xs text-slate-500">
                  {event.project} · источник: {event.source}
                </div>
              </div>
            ))}
          </div>
        </OfficePanel>

        <OfficePanel title="Поверхности управления" eyebrow="Интерфейсы">
          <div className="space-y-3">
            {[
              { icon: BellRing, title: 'Личка основателя', text: 'Критичные алерты, /brief, /decide и быстрые апрувы.' },
              { icon: Bot, title: 'Штабная комната', text: 'Кросс-агентские сводки и черновики недельных разборов.' },
              { icon: FolderKanban, title: 'Входящие решения', text: 'Очередь решений в веб-офисе вместо потери важных развилок в чате.' },
              { icon: Brain, title: 'Слой памяти', text: 'Инциденты, выводы по трендам, боль поддержки и недельные сводки.' },
            ].map((item) => (
              <div key={item.title} className="flex gap-3 rounded-xl border border-slate-700/50 bg-slate-900/60 p-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-slate-800">
                  <item.icon className="h-4 w-4 text-indigo-300" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-100">{item.title}</div>
                  <div className="mt-1 text-sm leading-relaxed text-slate-400">{item.text}</div>
                </div>
              </div>
            ))}
          </div>
        </OfficePanel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <OfficePanel title="Очередь решений" eyebrow="Нужен апрув">
          <div className="space-y-3">
            {data.decisions.map((decision) => (
              <div key={decision.id} className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-100">{decision.title}</div>
                  <ToneBadge tone={decision.status === 'pending' ? 'pending' : decision.status === 'deferred' ? 'deferred' : 'approved'}>
                    {decisionStatusLabel(decision.status)}
                  </ToneBadge>
                </div>
                <div className="mt-2 text-sm leading-relaxed text-slate-400">{decision.summary}</div>
                <div className="mt-3 text-xs text-slate-500">
                  рекомендация: <span className="text-slate-300">{decisionOptionLabel(decision.recommended)}</span> · проект: {decision.project}
                </div>
              </div>
            ))}
          </div>
        </OfficePanel>

        <OfficePanel title="Журнал действий" eyebrow="История">
          <div className="space-y-3">
            {data.journal.map((entry) => (
              <div key={entry.id} className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-4">
                <div className="flex items-center gap-2">
                  <ScrollText className="h-4 w-4 text-slate-500" />
                  <span className="font-mono text-xs text-slate-500">{entry.action}</span>
                </div>
                <div className="mt-2 text-sm leading-relaxed text-slate-200">{entry.narrative}</div>
                <div className="mt-3 text-xs text-slate-500">
                  {entry.actor} {'->'} {entry.target} · {entry.createdAt}
                </div>
              </div>
            ))}
          </div>
        </OfficePanel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <OfficePanel title="Состав агентов" eyebrow="Ответственность">
          <div className="space-y-3">
            {data.agents.slice(0, 4).map((agent) => (
              <div key={agent.slug} className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-100">{agentLabel(agent.slug)}</div>
                  <span className="font-mono text-[11px] text-slate-500">{agent.cadence}</span>
                </div>
                <div className="mt-2 text-sm leading-relaxed text-slate-400">{agent.mission}</div>
              </div>
            ))}
          </div>
        </OfficePanel>

        <OfficePanel title="Главное из памяти" eyebrow="Что офис помнит">
          <div className="space-y-3">
            {data.memory.slice(0, 3).map((memory) => (
              <div key={memory.id} className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-4">
                <div className="flex items-center gap-2">
                  <ToneBadge tone="low">{memory.kind}</ToneBadge>
                  <span className="text-xs text-slate-500">{memory.project}</span>
                </div>
                <div className="mt-3 text-sm font-semibold text-slate-100">{memory.title}</div>
                <div className="mt-1 text-sm leading-relaxed text-slate-400">{memory.summary}</div>
              </div>
            ))}
          </div>
        </OfficePanel>
      </div>

      <OfficePanel title="Прием задач" eyebrow="Рабочая очередь">
        <div className="grid gap-3 lg:grid-cols-2">
          {data.tasks.map((task) => (
            <div key={task.id} className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-100">{task.title}</div>
                <div className="flex items-center gap-2">
                  <ToneBadge tone={task.priority === 'p0' ? 'critical' : task.priority === 'p1' ? 'high' : 'medium'}>
                    {task.priority}
                  </ToneBadge>
                  <span className="text-xs text-slate-500">{taskStatusLabel(task.status)}</span>
                </div>
              </div>
              <div className="mt-2 text-sm leading-relaxed text-slate-400">{task.summary}</div>
              <div className="mt-3 text-xs text-slate-500">
                владелец: {agentLabel(task.ownerAgent)} · проект: {task.project} · источник: {task.sourceEventType}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100/80">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300" />
          Следующий шаг — ingestion реальных событий из продуктов и двусторонние действия между веб-офисом и Telegram HQ.
        </div>
      </OfficePanel>
    </div>
  )
}
