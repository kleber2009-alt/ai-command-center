import { OfficeDecisionActions } from '@/components/office/office-decision-actions'
import { OfficePageHeader, OfficePanel, ToneBadge } from '@/components/office/office-primitives'
import { getOfficeDecisionsPageData } from '@/lib/office-server'

export const dynamic = 'force-dynamic'

const STATUS_LABELS = {
  pending: 'ждет решения',
  approved: 'одобрено',
  rejected: 'отклонено',
  deferred: 'отложено',
} as const

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
}

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

function optionLabel(value: string) {
  return OPTION_LABELS[value] || value.replaceAll('_', ' ')
}

function agentLabel(value: string) {
  return AGENT_LABELS[value] || value
}

function taskStatusLabel(value: string) {
  return TASK_STATUS_LABELS[value] || value
}

export default async function OfficeDecisionsPage() {
  const data = await getOfficeDecisionsPageData()

  return (
    <div className="space-y-6">
      <OfficePageHeader
        title="Входящие решения"
        description="Здесь шеф штаба и остальные агенты поднимают развилки, которые требуют твоего решения. Карточки уже рабочие: их можно одобрять, откладывать и отклонять прямо из веб-офиса."
        extra={<ToneBadge tone={data.fallback ? 'medium' : 'approved'}>{data.fallback ? 'резервный режим' : 'живые данные'}</ToneBadge>}
      />

      {data.fallback ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100/80">
          Входящие решения уже подключены к API, но до миграций показывают резервный набор данных.
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <OfficePanel title="Решения в работе" eyebrow="office_decisions">
          <div className="space-y-3">
            {data.decisions.map((decision) => (
              <div key={decision.id} className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-100">{decision.title}</div>
                  <ToneBadge tone={decision.status === 'pending' ? 'pending' : decision.status === 'deferred' ? 'deferred' : 'approved'}>
                    {STATUS_LABELS[decision.status]}
                  </ToneBadge>
                </div>
                <div className="mt-2 text-sm leading-relaxed text-slate-400">{decision.summary}</div>
                <div className="mt-3 text-xs text-slate-500">
                  запрошено: {agentLabel(decision.requestedBy)} · проект: {decision.project}
                </div>
                <div className="mt-4">
                  <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">Варианты</div>
                  <div className="flex flex-wrap gap-2">
                    {decision.options.map((option) => (
                      <span
                        key={option}
                        className={`rounded-full border px-2 py-1 font-mono text-[11px] ${
                          option === decision.recommended
                            ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300'
                            : 'border-slate-700/50 bg-slate-800/60 text-slate-300'
                        }`}
                      >
                        {optionLabel(option)}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="mt-4 rounded-xl border border-slate-700/40 bg-slate-950/40 p-3">
                  <div className="mb-3 text-[10px] uppercase tracking-[0.2em] text-slate-500">Действие</div>
                  <OfficeDecisionActions
                    decisionId={decision.id}
                    currentStatus={decision.status}
                    recommendedOptionKey={decision.recommended}
                  />
                </div>
              </div>
            ))}
          </div>
        </OfficePanel>

        <OfficePanel title="Задачи, которые поднимают решения" eyebrow="office_tasks">
          <div className="space-y-3">
            {data.tasks
              .filter((task) => task.status === 'waiting_approval' || task.priority === 'p0')
              .map((task) => (
                <div key={task.id} className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-100">{task.title}</div>
                    <ToneBadge tone={task.priority === 'p0' ? 'critical' : 'high'}>{task.priority}</ToneBadge>
                  </div>
                <div className="mt-2 text-sm leading-relaxed text-slate-400">{task.summary}</div>
                <div className="mt-3 text-xs text-slate-500">
                  владелец: {agentLabel(task.ownerAgent)} · статус: {taskStatusLabel(task.status)}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-slate-700/50 bg-slate-900/40 p-4 text-sm leading-relaxed text-slate-400">
            Эти же действия дальше подключаются к Telegram HQ, чтобы одно и то же решение можно было закрывать и из бота, и из веб-офиса.
          </div>
        </OfficePanel>
      </div>
    </div>
  )
}
