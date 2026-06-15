import { OfficePageHeader, OfficePanel, ToneBadge } from '@/components/office/office-primitives'
import { getOfficeMemoryPageData } from '@/lib/office-server'

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

const MEMORY_KIND_LABELS: Record<string, string> = {
  weekly_review: 'недельный разбор',
  incident: 'инцидент',
  research: 'ресерч',
  customer_voice: 'голос клиента',
  playbook: 'плейбук',
  decision: 'решение',
  product_learning: 'продуктовый вывод',
}

function agentLabel(value: string) {
  return AGENT_LABELS[value] || value
}

function memoryKindLabel(value: string) {
  return MEMORY_KIND_LABELS[value] || value
}

export default async function OfficeMemoryPage() {
  const data = await getOfficeMemoryPageData()

  return (
    <div className="space-y-6">
      <OfficePageHeader
        title="Память офиса"
        description="Долгая память офиса: недельные разборы, инциденты, голос клиента, исследовательские выводы и журнал действий. Это слой, который делает агентскую систему умнее с каждой неделей."
        extra={<ToneBadge tone={data.fallback ? 'medium' : 'approved'}>{data.fallback ? 'резервный режим' : 'данные из БД'}</ToneBadge>}
      />

      {data.fallback ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100/80">
          Память и журнал уже подключены к серверному чтению, но пока могут жить на резервных данных до накатки схемы.
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      <OfficePanel title="Записи памяти" eyebrow="office_memory_entries">
          <div className="space-y-3">
            {data.memory.map((entry) => (
              <div key={entry.id} className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <ToneBadge tone="low">{memoryKindLabel(entry.kind)}</ToneBadge>
                  <span className="text-xs text-slate-500">{entry.project}</span>
                </div>
                <div className="mt-3 text-sm font-semibold text-slate-100">{entry.title}</div>
                <div className="mt-1 text-sm leading-relaxed text-slate-400">{entry.summary}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {entry.tags.map((tag) => (
                    <span key={tag} className="rounded-full border border-slate-700/50 bg-slate-800/60 px-2 py-1 text-[11px] text-slate-300">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="mt-3 text-xs text-slate-500">создано агентом: {agentLabel(entry.createdBy)}</div>
              </div>
            ))}
          </div>
        </OfficePanel>

        <OfficePanel title="Журнал действий" eyebrow="office_journal_entries">
          <div className="space-y-3">
            {data.journal.map((entry) => (
              <div key={entry.id} className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-4">
                <div className="font-mono text-xs text-slate-500">{entry.action}</div>
                <div className="mt-2 text-sm leading-relaxed text-slate-200">{entry.narrative}</div>
                <div className="mt-3 text-xs text-slate-500">
                  {agentLabel(entry.actor)} · {entry.target} · {entry.createdAt}
                </div>
              </div>
            ))}
          </div>
        </OfficePanel>
      </div>
    </div>
  )
}
