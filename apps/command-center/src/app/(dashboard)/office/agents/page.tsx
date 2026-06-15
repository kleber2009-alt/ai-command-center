import { OfficePageHeader, OfficePanel, ToneBadge } from '@/components/office/office-primitives'
import { getOfficeAgentsPageData } from '@/lib/office-server'

export const dynamic = 'force-dynamic'

const SOURCE_KIND_LABELS: Record<string, string> = {
  app: 'приложение',
  service: 'сервис',
  marketing: 'маркетинг',
  ops: 'операции',
}

function sourceKindLabel(value: string) {
  return SOURCE_KIND_LABELS[value] || value
}

export default async function OfficeAgentsPage() {
  const data = await getOfficeAgentsPageData()

  return (
    <div className="space-y-6">
      <OfficePageHeader
        title="Команда агентов"
        description="Постоянная агентская команда, ее зоны ответственности, ритм работы и системы, из которых каждый агент должен читать сигналы."
        extra={<ToneBadge tone={data.fallback ? 'medium' : 'approved'}>{data.fallback ? 'резервный режим' : 'данные из БД'}</ToneBadge>}
      />

      {data.fallback ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100/80">
          Состав команды и реестр источников уже читаются через серверный слой, но пока отдаются из резервных seed-данных.
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {data.agents.map((agent) => (
          <OfficePanel key={agent.slug} title={agent.name} eyebrow={agent.kind}>
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-slate-400">{agent.mission}</p>
              <div>
                <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">Ритм</div>
                <div className="text-sm text-slate-200">{agent.cadence}</div>
              </div>
              <div>
                <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">Каналы</div>
                <div className="flex flex-wrap gap-2">
                  {agent.channels.map((channel) => (
                    <ToneBadge key={channel} tone="low">
                      {channel}
                    </ToneBadge>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">Системы-источники</div>
                <ul className="space-y-1.5 text-sm text-slate-300">
                  {agent.sourceSystems.map((system) => (
                    <li key={system} className="font-mono text-xs text-slate-400">
                      {system}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </OfficePanel>
        ))}
      </div>

      <OfficePanel title="Реестр источников событий" eyebrow="Что питает офис">
        <div className="space-y-3">
          {data.sources.map((source) => (
            <div key={source.slug} className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-100">{source.name}</div>
                  <div className="mt-1 font-mono text-xs text-slate-500">{source.repoPath}</div>
                </div>
                <ToneBadge tone="low">{sourceKindLabel(source.kind)}</ToneBadge>
              </div>
              <div className="mb-2 mt-4 text-[10px] uppercase tracking-[0.2em] text-slate-500">Отдает события</div>
              <div className="flex flex-wrap gap-2">
                {source.emits.map((eventType) => (
                  <span key={eventType} className="rounded-full border border-slate-700/50 bg-slate-800/60 px-2 py-1 font-mono text-[11px] text-slate-300">
                    {eventType}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </OfficePanel>
    </div>
  )
}
