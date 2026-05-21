'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, TrendingUp, Plus, X, Loader2, AlertCircle, Zap, Eye, Heart, MessageCircle, Music } from 'lucide-react'
import { apiFetch } from '@/lib/telegram'

// ─── Types ────────────────────────────────────────────────────────────────────

type Reel = {
  id: string; shortcode: string; instagram_url: string
  caption: string | null; views_count: number; likes_count: number
  comments_count: number; viral_score: number; thumbnail_url: string | null
  audio_title: string | null; account_id: string
}

type Hook = { text: string; score: number; type: string }
type ViralPattern = { pattern: string; frequency: number; why: string }
type ContentIdea = { title: string; hook: string; format: string; topic: string; notes?: string }

type Analysis = {
  niche_overview: string
  top_topics: string[]; trending_formats: string[]
  top_hooks: Hook[]; trending_audios: string[]
  viral_patterns: ViralPattern[]
  pain_points: string[]; angles: string[]
  content_ideas: ContentIdea[]
}

type Result = { topReels: Reel[]; analysis: Analysis; report: { id: string } | null }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

const HOOK_TYPE_COLORS: Record<string, string> = {
  pain: 'bg-red-50 text-red-600', benefit: 'bg-green-50 text-green-600',
  intrigue: 'bg-purple-50 text-purple-600', conflict: 'bg-orange-50 text-orange-600',
  fear: 'bg-red-50 text-red-500', social_proof: 'bg-blue-50 text-blue-600',
  contrast: 'bg-yellow-50 text-yellow-700', provocation: 'bg-pink-50 text-pink-600',
}
const HOOK_TYPE_LABELS: Record<string, string> = {
  pain: 'Боль', benefit: 'Выгода', intrigue: 'Интрига', conflict: 'Конфликт',
  fear: 'Страх', social_proof: 'Соц. д-во', contrast: 'Контраст', provocation: 'Провокация',
}

function ViralBadge({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-green-100 text-green-700' : score >= 40 ? 'bg-yellow-100 text-yellow-700' : 'bg-apple-bg-soft text-apple-muted'
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}><Zap className="h-3 w-3" />{score}</span>
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TrendResearchPage() {
  const [niche, setNiche] = useState('')
  const [competitors, setCompetitors] = useState<string[]>([''])
  const [language, setLanguage] = useState('ru')
  const [geo, setGeo] = useState('global')
  const [limit, setLimit] = useState(20)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [tab, setTab] = useState<'reels' | 'hooks' | 'patterns' | 'ideas'>('reels')

  function addCompetitor() {
    if (competitors.length < 10) setCompetitors((c) => [...c, ''])
  }
  function removeCompetitor(i: number) {
    setCompetitors((c) => c.filter((_, j) => j !== i))
  }
  function setCompetitor(i: number, val: string) {
    setCompetitors((c) => c.map((v, j) => (j === i ? val : v)))
  }

  async function research() {
    const validComp = competitors.map((c) => c.trim().replace(/^@/, '')).filter(Boolean)
    if (!niche.trim() || validComp.length === 0) return
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await apiFetch('/api/instagram/trend-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche: niche.trim(), competitors: validComp, language, geo, limit }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      setResult(data as Result)
    } catch (e: any) {
      setError(e?.message ?? 'Ошибка ресёрча')
    } finally {
      setLoading(false)
    }
  }

  const validCount = competitors.filter((c) => c.trim()).length

  return (
    <main className="min-h-screen bg-apple-bg-soft pb-32">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-apple-line bg-white/90 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Link href="/instagram-intelligence" className="flex h-8 w-8 items-center justify-center rounded-full bg-apple-bg-soft">
            <ChevronLeft className="h-4 w-4 text-apple-ink" />
          </Link>
          <h1 className="font-semibold text-apple-ink">Тренд-ресёрч</h1>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 pt-5">
        {/* Form */}
        <div className="rounded-apple bg-white p-5 shadow-apple">
          {/* Niche */}
          <div className="mb-4">
            <label className="mb-1.5 block text-sm font-medium text-apple-ink">Ниша</label>
            <input
              type="text"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              placeholder="AI маркетинг, нутрициология, SMM…"
              className="w-full rounded-xl border border-apple-line bg-apple-bg-soft px-3 py-2.5 text-sm text-apple-ink placeholder-apple-faint outline-none focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20"
            />
          </div>

          {/* Competitors */}
          <div className="mb-4">
            <label className="mb-1.5 block text-sm font-medium text-apple-ink">
              Конкуренты <span className="text-apple-muted">({validCount}/10)</span>
            </label>
            <div className="space-y-2">
              {competitors.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-sm text-apple-muted">@</span>
                  <input
                    type="text"
                    value={c}
                    onChange={(e) => setCompetitor(i, e.target.value)}
                    placeholder={`аккаунт ${i + 1}`}
                    className="flex-1 rounded-xl border border-apple-line bg-apple-bg-soft px-3 py-2 text-sm text-apple-ink placeholder-apple-faint outline-none focus:border-apple-blue"
                  />
                  {competitors.length > 1 && (
                    <button onClick={() => removeCompetitor(i)} className="text-apple-faint hover:text-red-500">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              {competitors.length < 10 && (
                <button onClick={addCompetitor} className="flex items-center gap-1.5 text-sm text-apple-blue">
                  <Plus className="h-4 w-4" />Добавить аккаунт
                </button>
              )}
            </div>
          </div>

          {/* Options row */}
          <div className="mb-4 flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-apple-muted">Язык</label>
              <select value={language} onChange={(e) => setLanguage(e.target.value)}
                className="w-full rounded-xl border border-apple-line bg-apple-bg-soft px-3 py-2 text-sm text-apple-ink outline-none">
                <option value="ru">Русский</option>
                <option value="en">English</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-apple-muted">Гео</label>
              <select value={geo} onChange={(e) => setGeo(e.target.value)}
                className="w-full rounded-xl border border-apple-line bg-apple-bg-soft px-3 py-2 text-sm text-apple-ink outline-none">
                <option value="global">Global</option>
                <option value="ru">Россия/СНГ</option>
                <option value="us">USA</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-apple-muted">Reels / акк.</label>
              <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}
                className="w-full rounded-xl border border-apple-line bg-apple-bg-soft px-3 py-2 text-sm text-apple-ink outline-none">
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={30}>30</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>

          <button
            onClick={research}
            disabled={loading || !niche.trim() || validCount === 0}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Анализирую конкурентов…</> : <><TrendingUp className="h-4 w-4" />Запустить ресёрч</>}
          </button>

          {loading && (
            <p className="mt-3 text-center text-xs text-apple-muted">
              Собираю Reels со всех аккаунтов, считаю viral score, AI анализирует… ~2-4 мин
            </p>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 flex items-start gap-3 rounded-apple bg-red-50 p-4">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <span className="text-sm text-red-700">{error}</span>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="mt-5 space-y-4 animate-slide-in">
            {/* Niche overview */}
            <div className="rounded-apple bg-white p-4 shadow-apple">
              <h2 className="mb-2 text-sm font-semibold text-apple-ink">Обзор ниши</h2>
              <p className="text-sm leading-relaxed text-apple-muted">{result.analysis.niche_overview}</p>

              {/* Topic clusters */}
              <div className="mt-4">
                <div className="mb-2 text-xs font-semibold text-apple-ink">Топ темы</div>
                <div className="flex flex-wrap gap-1.5">
                  {result.analysis.top_topics.map((t, i) => (
                    <span key={i} className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">{t}</span>
                  ))}
                </div>
              </div>

              {/* Pain points */}
              {result.analysis.pain_points.length > 0 && (
                <div className="mt-3">
                  <div className="mb-2 text-xs font-semibold text-apple-ink">Боли аудитории</div>
                  <div className="flex flex-wrap gap-1.5">
                    {result.analysis.pain_points.map((p, i) => (
                      <span key={i} className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600">{p}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Trending audios */}
              {result.analysis.trending_audios.length > 0 && (
                <div className="mt-3 flex items-start gap-2">
                  <Music className="mt-0.5 h-3.5 w-3.5 shrink-0 text-purple-500" />
                  <div>
                    <div className="mb-1 text-xs font-semibold text-apple-ink">Трендовое аудио</div>
                    <div className="text-xs text-apple-muted">{result.analysis.trending_audios.join(' · ')}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="flex rounded-xl bg-apple-bg-soft p-1">
              {(['reels', 'hooks', 'patterns', 'ideas'] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${tab === t ? 'bg-white text-apple-ink shadow-apple-sm' : 'text-apple-muted'}`}>
                  {t === 'reels' ? 'Топ Reels' : t === 'hooks' ? 'Хуки' : t === 'patterns' ? 'Паттерны' : 'Идеи'}
                </button>
              ))}
            </div>

            {/* Tab: Top Reels */}
            {tab === 'reels' && (
              <div className="space-y-2">
                {result.topReels.slice(0, 20).map((r) => (
                  <a key={r.id} href={r.instagram_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-apple bg-white p-3.5 shadow-apple transition hover:shadow-apple-lg">
                    {r.thumbnail_url && (
                      <img src={r.thumbnail_url} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-xs text-apple-muted">{r.caption ?? '—'}</p>
                      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-apple-faint">
                        <span className="flex items-center gap-0.5"><Eye className="h-3 w-3" />{fmt(r.views_count)}</span>
                        <span className="flex items-center gap-0.5"><Heart className="h-3 w-3" />{fmt(r.likes_count)}</span>
                        <span className="flex items-center gap-0.5"><MessageCircle className="h-3 w-3" />{fmt(r.comments_count)}</span>
                      </div>
                      {r.audio_title && (
                        <p className="mt-1 flex items-center gap-1 text-[10px] text-purple-500">
                          <Music className="h-2.5 w-2.5" />{r.audio_title}
                        </p>
                      )}
                    </div>
                    <ViralBadge score={r.viral_score} />
                  </a>
                ))}
              </div>
            )}

            {/* Tab: Hooks */}
            {tab === 'hooks' && (
              <div className="space-y-3">
                {result.analysis.top_hooks.map((h, i) => (
                  <div key={i} className="rounded-apple bg-white p-4 shadow-apple">
                    <div className="flex items-start justify-between gap-3">
                      <p className="flex-1 text-sm font-medium text-apple-ink">"{h.text}"</p>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${HOOK_TYPE_COLORS[h.type] ?? 'bg-apple-bg-soft text-apple-muted'}`}>
                          {HOOK_TYPE_LABELS[h.type] ?? h.type}
                        </span>
                        <span className="flex items-center gap-0.5 text-xs font-bold text-apple-ink">
                          <Zap className="h-3 w-3 text-yellow-500" />{h.score}/10
                        </span>
                      </div>
                    </div>
                    <div className="mt-2.5 h-1.5 rounded-full bg-apple-bg-soft">
                      <div className="h-1.5 rounded-full bg-apple-blue" style={{ width: `${h.score * 10}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Tab: Viral Patterns */}
            {tab === 'patterns' && (
              <div className="space-y-3">
                {result.analysis.viral_patterns.map((p, i) => (
                  <div key={i} className="rounded-apple bg-white p-4 shadow-apple">
                    <div className="flex items-start gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-700">
                        {p.frequency}×
                      </div>
                      <div>
                        <p className="font-medium text-apple-ink">{p.pattern}</p>
                        <p className="mt-1 text-xs text-apple-muted">{p.why}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {/* Angles */}
                {result.analysis.angles.length > 0 && (
                  <div className="rounded-apple bg-white p-4 shadow-apple">
                    <h3 className="mb-3 text-sm font-semibold text-apple-ink">Углы подачи</h3>
                    <ul className="space-y-2">
                      {result.analysis.angles.map((a, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-apple-muted">
                          <span className="mt-0.5 shrink-0 text-green-600">→</span>{a}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Tab: Content Ideas */}
            {tab === 'ideas' && (
              <div className="space-y-3">
                {result.analysis.content_ideas.map((idea, i) => (
                  <div key={i} className="rounded-apple bg-white p-4 shadow-apple">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="font-medium text-apple-ink">{idea.title}</span>
                      <span className="rounded-full bg-apple-bg-soft px-2 py-0.5 text-[10px] font-medium text-apple-muted">{idea.format}</span>
                    </div>
                    <p className="mb-1 text-xs font-medium text-apple-blue">"{idea.hook}"</p>
                    <p className="text-xs text-apple-muted">{idea.topic}{idea.notes ? ' · ' + idea.notes : ''}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
