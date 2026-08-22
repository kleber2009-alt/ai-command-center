import { OfficePageHeader, OfficePanel, StatCard, ToneBadge } from '@/components/office/office-primitives'
import { getOfficeHqSnapshot } from '@/lib/office-hq-server'

export const dynamic = 'force-dynamic'

export default async function OfficeHqPage() {
  const data = await getOfficeHqSnapshot()

  return (
    <div className="space-y-6">
      <OfficePageHeader
        title="Штаб офиса"
        description="Единый штабной слой: ты говоришь с шефом штаба, а не с восемью разрозненными агентами. Здесь собраны протокол общения, состав команды, ритуалы, эскалации и готовые штабные режимы."
        extra={<ToneBadge tone={data.fallback ? 'medium' : 'approved'}>{data.fallback ? 'резервный режим' : 'живой штаб'}</ToneBadge>}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Активные агенты" value={data.summary.activeAgents} hint="Роли, которые уже работают как организованная команда." />
        <StatCard label="Решения в ожидании" value={data.summary.pendingDecisions} hint="То, что должно идти через штаб, а не теряться в личках." />
        <StatCard label="Открытые задачи" value={data.summary.openTasks} hint="Текущая рабочая очередь штаба." />
        <StatCard label="Критические алерты" value={data.summary.criticalAlerts} hint="Сигналы, которые имеют право прерывать твой день." />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <OfficePanel title="Как команда отчитывается тебе" eyebrow="Протокол">
          <div className="space-y-4 text-sm text-slate-300">
            <p className="leading-relaxed text-slate-400">{data.cards.situation}</p>
            <div>
              <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">Секции отчета</div>
              <div className="flex flex-wrap gap-2">
                {data.reportSections.map((section) => (
                  <span key={section} className="rounded-full border border-slate-700/50 bg-slate-800/60 px-2 py-1 text-[11px] text-slate-300">
                    {section}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-4">
              <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">Фокус недели</div>
              <div className="text-sm font-semibold text-slate-100">{data.summary.weeklyFocus}</div>
            </div>
          </div>
        </OfficePanel>

        <OfficePanel title="Команды штаба в Telegram" eyebrow="HQ команды">
          <div className="space-y-3">
            {data.commands.map((command) => (
              <div key={command.slug} className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-mono text-sm font-semibold text-slate-100">{command.command}</div>
                  <ToneBadge tone="low">{command.title}</ToneBadge>
                </div>
                <div className="mt-2 text-sm leading-relaxed text-slate-400">{command.intent}</div>
                <div className="mt-3 text-xs text-slate-500">{command.output}</div>
              </div>
            ))}
          </div>
        </OfficePanel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <OfficePanel title="Пример краткого брифа" eyebrow="Образец отчета">
          <pre className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{data.renders.brief.text}</pre>
        </OfficePanel>

        <OfficePanel title="Очередь эскалаций" eyebrow="Маршрутизация">
          <div className="space-y-3">
            {data.escalationRules.map((rule) => (
              <div key={`${rule.trigger}-${rule.route}`} className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-4">
                <div className="text-sm font-semibold text-slate-100">{rule.trigger}</div>
                <div className="mt-2 text-sm text-slate-300">{rule.route}</div>
                <div className="mt-2 text-xs leading-relaxed text-slate-500">{rule.reason}</div>
              </div>
            ))}
          </div>
        </OfficePanel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <OfficePanel title="Ритм штабных ритуалов" eyebrow="HQ ритуалы">
          <div className="space-y-3">
            {data.routines.map((routine) => (
              <div key={`${routine.title}-${routine.cadence}`} className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-100">{routine.title}</div>
                  <span className="font-mono text-xs text-slate-500">{routine.cadence}</span>
                </div>
                <div className="mt-2 text-sm text-slate-300">{routine.owner}</div>
                <div className="mt-2 text-sm leading-relaxed text-slate-400">{routine.output}</div>
              </div>
            ))}
          </div>
        </OfficePanel>

        <OfficePanel title="Немедленная очередь" eyebrow="Для основателя">
          <div className="space-y-4 text-sm text-slate-300">
            <div>
              <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">Что изменилось</div>
              <ul className="space-y-2 text-slate-400">
                {data.cards.changed.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">Риски</div>
              <ul className="space-y-2 text-slate-400">
                {data.cards.risks.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">Следующие действия по владельцам</div>
              <ul className="space-y-2 text-slate-400">
                {data.cards.nextActions.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
        </OfficePanel>
      </div>
    </div>
  )
}
