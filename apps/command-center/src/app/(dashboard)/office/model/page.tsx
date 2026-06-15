import { OfficePageHeader, OfficePanel, ToneBadge } from '@/components/office/office-primitives'
import { getOfficeModelData } from '@/lib/office-server'

export const dynamic = 'force-dynamic'

export default async function OfficeModelPage() {
  const data = await getOfficeModelData()

  return (
    <div className="space-y-6">
      <OfficePageHeader
        title="Модель office-core"
        description="Каноническая модель данных для событий, задач, решений, памяти и журналов. Эта страница связывает UI-скелет с документами и будущими Postgres-таблицами."
        extra={<ToneBadge tone="approved">сервер готов</ToneBadge>}
      />

      <OfficePanel title="Базовые таблицы" eyebrow="SQL-каркас">
        <div className="grid gap-3 lg:grid-cols-2">
          {data.tables.map((table) => (
            <div key={table.name} className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="font-mono text-sm font-semibold text-slate-100">{table.name}</div>
                <ToneBadge tone="approved">смоделировано</ToneBadge>
              </div>
              <div className="mt-2 text-sm leading-relaxed text-slate-400">{table.purpose}</div>
            </div>
          ))}
        </div>
      </OfficePanel>

      <div className="grid gap-6 xl:grid-cols-2">
        <OfficePanel title="Каноническая спецификация" eyebrow="Документы">
          <ul className="space-y-3 text-sm text-slate-300">
            <li>
              <span className="font-mono text-indigo-300">docs/OFFICE_CORE_DATA_MODEL.md</span>
              <div className="mt-1 text-slate-400">Описание сущностей, целей и связей между агентами, событиями, задачами, решениями и памятью.</div>
            </li>
            <li>
              <span className="font-mono text-indigo-300">docs/sql/office-core-postgres.sql</span>
              <div className="mt-1 text-slate-400">Черновая SQL-схема для будущего office-core в Postgres.</div>
            </li>
            <li>
              <span className="font-mono text-indigo-300">apps/command-center/src/lib/office-core.ts</span>
              <div className="mt-1 text-slate-400">Типы и резервные данные, на которых уже стоит интерфейсный скелет.</div>
            </li>
            <li>
              <span className="font-mono text-indigo-300">apps/command-center/src/lib/office-server.ts</span>
              <div className="mt-1 text-slate-400">Серверный слой, который читает Postgres и откатывается на резервный режим при отсутствии office-core.</div>
            </li>
          </ul>
        </OfficePanel>

        <OfficePanel title="Следующие шаги разработки" eyebrow="Реализация">
          <ol className="list-inside list-decimal space-y-3 text-sm text-slate-300">
            <li>Накатить `018_office_core.sql` и `019_office_core_seed.sql` в рабочую БД.</li>
            <li>Добавить действия одобрения, отложения и отклонения поверх `PATCH /api/office/decisions`.</li>
            <li>Нормализовать события из `tg-agent`, `ig-agent`, `persona-studio`, `infra-worker`.</li>
            <li>Сделать входящие решения двусторонними: веб-апрув плюс Telegram `/approve`.</li>
            <li>Добавить недельные брифы и постмортемы инцидентов в `office_memory_entries`.</li>
          </ol>
        </OfficePanel>
      </div>
    </div>
  )
}
