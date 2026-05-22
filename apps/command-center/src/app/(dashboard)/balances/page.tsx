'use client'
import { useEffect, useRef, useState } from 'react'
import { RefreshCw, ExternalLink, AlertCircle, CheckCircle2, MinusCircle, XCircle, Radio } from 'lucide-react'

type ProviderStatus = 'ok' | 'low' | 'empty' | 'error' | 'no-api'
type ProviderCategory = 'llm' | 'video' | 'voice' | 'data' | 'media' | 'payment'

type Balance = { value: number | null; unit: string; display: string }
type ProviderResult = {
  slug: string
  name: string
  category: ProviderCategory
  status: ProviderStatus
  balance: Balance | null
  used?: Balance
  total?: Balance
  detail?: string
  dashboardUrl?: string
  error?: string
  fetchedAt: string
}

const POLL_INTERVAL_MS = 15_000  // авто-poll каждые 15 секунд

const STATUS_STYLE: Record<ProviderStatus, { bg: string; text: string; border: string; label: string; Icon: any }> = {
  ok:       { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', label: 'OK',         Icon: CheckCircle2 },
  low:      { bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/20',   label: 'мало',       Icon: AlertCircle },
  empty:    { bg: 'bg-rose-500/10',    text: 'text-rose-400',    border: 'border-rose-500/20',    label: 'пусто',      Icon: XCircle },
  error:    { bg: 'bg-rose-500/10',    text: 'text-rose-400',    border: 'border-rose-500/20',    label: 'ошибка',     Icon: XCircle },
  'no-api': { bg: 'bg-slate-500/10',   text: 'text-slate-400',   border: 'border-slate-500/20',   label: 'без API',    Icon: MinusCircle },
}

const CATEGORY: Record<ProviderCategory, { label: string; color: string }> = {
  llm:     { label: 'LLM',               color: 'text-indigo-400' },
  video:   { label: 'Video',             color: 'text-fuchsia-400' },
  voice:   { label: 'Voice',             color: 'text-cyan-400' },
  data:    { label: 'Data / scraping',   color: 'text-amber-400' },
  media:   { label: 'Media gen',         color: 'text-emerald-400' },
  payment: { label: 'Payment',           color: 'text-rose-400' },
}

export default function BalancesPage() {
  const [providers, setProviders] = useState<ProviderResult[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [cachedAt, setCachedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [secondsSince, setSecondsSince] = useState<number>(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const inFlight = useRef<boolean>(false)

  async function load(force = false, opts: { silent?: boolean } = {}) {
    if (inFlight.current) return
    inFlight.current = true
    if (!opts.silent) {
      if (providers.length === 0) setLoading(true)
      else setRefreshing(true)
    }
    setError(null)
    try {
      const r = await fetch(`/api/balances${force ? '?refresh=1' : ''}`, { cache: 'no-store' })
      const d = await r.json()
      if (d.error) setError(d.error)
      setProviders(d.providers ?? [])
      setCachedAt(d.cachedAt ?? null)
      setSecondsSince(0)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setLoading(false); setRefreshing(false)
      inFlight.current = false
    }
  }

  // initial fetch + auto-polling every 15s
  useEffect(() => {
    load(true)

    function startPoll() {
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = setInterval(() => {
        if (document.visibilityState === 'visible') {
          load(true, { silent: true })
        }
      }, POLL_INTERVAL_MS)
    }
    startPoll()

    // tick "обновлено X сек назад" каждую секунду
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => setSecondsSince(s => s + 1), 1000)

    // когда вкладка возвращается из фона — сразу refresh
    function onVis() {
      if (document.visibilityState === 'visible') load(true, { silent: true })
    }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (timerRef.current) clearInterval(timerRef.current)
      document.removeEventListener('visibilitychange', onVis)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const live   = providers.filter(p => ['ok', 'low', 'empty'].includes(p.status))
  const noApi  = providers.filter(p => p.status === 'no-api')
  const failed = providers.filter(p => p.status === 'error')

  const totalUsd = live.reduce((s, p) => p.balance?.unit === 'USD' ? s + (p.balance.value ?? 0) : s, 0)
  const lowCount = providers.filter(p => p.status === 'low' || p.status === 'empty').length

  return (
    <div className="animate-slide-in space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-100">Балансы интеграций</h1>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[10px] uppercase tracking-wider font-mono text-emerald-400">
              <span className="relative flex w-1.5 h-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-emerald-500" />
              </span>
              Live · 15s
            </span>
            {refreshing && (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-mono text-slate-500">
                <RefreshCw className="w-3 h-3 animate-spin" /> опрашиваю
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading
              ? 'Опрашиваю провайдеров…'
              : <>
                  {providers.length} подключено · live: {live.length} · без API: {noApi.length}
                  {failed.length > 0 && <> · ошибок: {failed.length}</>}
                  <span className="ml-2 font-mono text-[10px] text-slate-600">
                    · обновлено {secondsSince === 0 ? 'только что' : `${secondsSince}s назад`}
                  </span>
                </>}
          </p>
        </div>
        <button onClick={() => load(true)} disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-slate-400 border border-slate-700/50 hover:border-slate-600 hover:text-slate-300 transition-all disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Обновить
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-300">
          {error}
        </div>
      )}

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Stripe доступно" value={`$${totalUsd.toFixed(2)}`} hint="доступный к выводу баланс" tone="emerald" />
        <SummaryCard label="Подключено" value={String(providers.length)} hint="API-ключей настроено" tone="indigo" />
        <SummaryCard label="С балансом" value={String(live.length)} hint="отдают цифры через API" tone="cyan" />
        <SummaryCard label="Требует внимания" value={String(lowCount + failed.length)} hint="мало / пусто / ошибки" tone={lowCount + failed.length > 0 ? 'rose' : 'slate'} />
      </div>

      {/* Live group */}
      {live.length > 0 && (
        <Section title="С балансом через API" count={live.length}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {live.map(p => <ProviderCard key={p.slug} p={p} pulse={refreshing} />)}
          </div>
        </Section>
      )}

      {/* No-API group */}
      {noApi.length > 0 && (
        <Section title="Без публичного балансового API" count={noApi.length}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {noApi.map(p => <ProviderCard key={p.slug} p={p} pulse={false} />)}
          </div>
        </Section>
      )}

      {/* Errors group */}
      {failed.length > 0 && (
        <Section title="Не удалось опросить" count={failed.length} accent="rose">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {failed.map(p => <ProviderCard key={p.slug} p={p} pulse={refreshing} />)}
          </div>
        </Section>
      )}

      {providers.length === 0 && !loading && (
        <div className="text-center py-12 text-sm text-slate-500">
          Ни один провайдер не настроен. Проверь env-ключи в docker-compose.
        </div>
      )}

      <div className="text-center text-[10px] font-mono text-slate-600 pt-2">
        автообновление каждые 15 секунд · кеш сервера 10s · приостанавливается во вкладке в фоне
      </div>
    </div>
  )
}

function SummaryCard({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: 'emerald' | 'indigo' | 'cyan' | 'slate' | 'rose' }) {
  const toneCls = {
    emerald: 'text-emerald-300',
    indigo:  'text-indigo-300',
    cyan:    'text-cyan-300',
    slate:   'text-slate-300',
    rose:    'text-rose-300',
  }[tone]
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
      <div className="text-[10px] uppercase tracking-wider font-mono text-slate-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 tabular-nums transition-colors ${toneCls}`}>{value}</div>
      <div className="text-[11px] text-slate-500 mt-0.5">{hint}</div>
    </div>
  )
}

function Section({ title, count, accent, children }: { title: string; count: number; accent?: 'rose'; children: React.ReactNode }) {
  const dot = accent === 'rose' ? 'bg-rose-500' : 'bg-slate-600'
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 px-1">
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        <h2 className="text-xs uppercase tracking-wider font-mono text-slate-400">{title}</h2>
        <span className="text-[10px] font-mono text-slate-600">· {count}</span>
        <div className="flex-1 border-b border-slate-800 ml-2" />
      </div>
      {children}
    </div>
  )
}

function ProviderCard({ p, pulse }: { p: ProviderResult; pulse: boolean }) {
  const s = STATUS_STYLE[p.status]
  const cat = CATEGORY[p.category]
  const Icon = s.Icon

  // % used (if total available)
  let pct: number | null = null
  if (p.total?.value && p.used?.value != null && p.total.value > 0) {
    pct = Math.min(100, Math.max(0, (p.used.value / p.total.value) * 100))
  }

  return (
    <div className={`bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 hover:border-slate-600 transition-all flex flex-col relative overflow-hidden`}>
      {/* refresh pulse line */}
      {pulse && p.status !== 'no-api' && (
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/60 to-transparent animate-[pulse_1.4s_ease-in-out_infinite]" />
      )}

      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-100">{p.name}</h3>
            <span className={`text-[10px] font-mono ${cat.color}`}>{cat.label}</span>
          </div>
          {p.detail && <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{p.detail}</p>}
        </div>
        <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded border ${s.bg} ${s.text} ${s.border}`}>
          <Icon className="w-3 h-3" />
          {s.label}
        </span>
      </div>

      <div className="my-2">
        {p.balance ? (
          <div key={p.balance.display} className="font-mono tabular-nums text-2xl text-slate-100 animate-[fadeIn_.3s_ease-out]">
            {p.balance.display}
          </div>
        ) : p.status === 'error' ? (
          <div className="font-mono text-xs text-rose-400/80 break-all">{p.error}</div>
        ) : (
          <div className="font-mono text-sm text-slate-500 italic">баланс через UI</div>
        )}
        {p.used && p.total && (
          <div className="text-[10px] font-mono text-slate-500 mt-1">
            использовано {p.used.display} из {p.total.display}
          </div>
        )}
      </div>

      {pct != null && (
        <div className="mb-3">
          <div className="h-1.5 bg-slate-700/40 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                pct > 90 ? 'bg-rose-500' : pct > 70 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="text-[10px] font-mono text-slate-500 mt-1 text-right">{pct.toFixed(0)}% использовано</div>
        </div>
      )}

      {p.dashboardUrl && (
        <a
          href={p.dashboardUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-auto inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-300 border border-slate-700/50 hover:border-slate-600 hover:bg-slate-700/20 transition-all"
        >
          Открыть dashboard <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  )
}
