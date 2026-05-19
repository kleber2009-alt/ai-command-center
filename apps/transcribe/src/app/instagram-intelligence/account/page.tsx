'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Search, Loader2, AlertCircle, TrendingUp, Users, Eye, Heart, MessageCircle, Zap, Lightbulb, BarChart2 } from 'lucide-react'
import { apiFetch } from '@/lib/telegram'

// ─── Types (mirror backend) ────────────────────────────────────────────────────

type Reel = {
  id: string; shortcode: string; instagram_url: string
  caption: string | null; views_count: number; likes_count: number
  comments_count: number; viral_score: number; thumbnail_url: string | null
  published_at: string | null; audio_title: string | null
}

type Hook = { text: string; score: number; type: string; reelUrl?: string }
type ViralPattern = { pattern: string; frequency: number; why: string }
type ContentIdea = { title: string; hook: string; format: string; topic: string; notes?: string }

type Account = {
  id: string; username: string; full_name: string | null
  followers_count: number | null; bio: string | null; is_verified: boolean
}

type Analysis = {
  summary: string
  strengths: string[]; weaknesses: string[]
  content_pillars: string[]
  avg_stats: { views: number; likes: number; comments: number; eng_rate: string }
  top_hooks: Hook[]; top_topics: string[]
  viral_patterns: ViralPattern[]
  recommendations: string[]; weak_points: string[]
  content_ideas: ContentIdea[]
}

type Result = { account: Account; topReels: Reel[]; analysis: Analysis; report: { id: string } | null }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

const HOOK_TYPE_LABELS: Record<string, string> = {
  pain: 'Боль', benefit: 'Выгода', intrigue: 'Интрига', conflict: 'Конфликт',
  fear: 'Страх', social_proof: 'Соц. доказательство', contrast: 'Контраст', provocation: 'Провокация',
}

const HOOK_TYPE_COLORS: Record<string, string> = {
  pain: 'bg-red-50 text-red-600', benefit: 'bg-green-50 text-green-600',
  intrigue: 'bg-purple-50 text-purple-600', conflict: 'bg-orange-50 text-orange-600',
  fear: 'bg-red-50 text-red-500', social_proof: 'bg-blue-50 text-blue-600',
  contrast: 'bg-yellow-50 text-yellow-700', provocation: 'bg-pink-50 text-pink-600',
}

function ViralBadge({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-green-100 text-green-700' : score >= 40 ? 'bg-yellow-100 text-yellow-700' : 'bg-apple-bg-soft text-apple-muted'
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}><Zap className="h-3 w-3" />{score}</span>
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AccountAnalyzerPage() {
  const [username, setUsername] = useState('')
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d')
  const [mode, setMode] = useState<'quick' | 'deep'>('quick')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [tab, setTab] = useState<'reels' | 'hooks' | 'patterns' | 'ideas'>('reels')

  async function analyze() {
    const u = username.trim().replace(/^@/, '')
    if (!u) return
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await apiFetch('/api/instagram/analyze-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, period, mode }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      setResult(data as Result)
    } catch (e: any) {
      setError(e?.message ?? 'Ошибка анализа')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-apple-bg-soft pb-32">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-apple-line bg-white/90 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Link href="/instagram-intelligence" className="flex h-8 w-8 items-center justify-center rounded-full bg-apple-bg-soft">
            <ChevronLeft className="h-4 w-4 text-apple-ink" />
          </Link>
          <h1 className="font-semibold text-apple-ink">Анализ аккаунта</h1>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 pt-5">
        {/* Form */}
        <div className="rounded-apple bg-white p-5 shadow-apple">
          <div className="mb-4">
            <label className="mb-1.5 block text-sm font-medium text-apple-ink">Instagram username</label>
            <div className="flex items-center gap-2">
              <span className="text-apple-muted">@</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && analyze()}
                placeholder="example"
                className="flex-1 rounded-xl border border-apple-line bg-apple-bg-soft px-3 py-2.5 text-sm text-apple-ink placeholder-apple-faint outline-none focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20"
              />
            </div>
          </div>

          <div className="mb-4 flex gap-3">
            <div className="flex-1">
              <label className="mb-1.5 block text-xs font-medium text-apple-muted">Период</label>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as typeof period)}
                className="w-full rounded-xl border border-apple-line bg-apple-bg-soft px-3 py-2 text-sm text-apple-ink outline-none"
              >
                <option value="7d">7 дней</option>
                <option value="30d">30 дней</option>
                <option value="90d">90 дней</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="mb-1.5 block text-xs font-medium text-apple-muted">Режим</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as typeof mode)}
                className="w-full rounded-xl border border-apple-line bg-apple-bg-soft px-3 py-2 text-sm text-apple-ink outline-none"
              >
                <option value="quick">Быстрый (30 Reels)</option>
                <option value="deep">Глубокий (50 Reels)</option>
              </select>
            </div>
          </div>

          <button
            onClick={analyze}
            disabled={loading || !username.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-apple-blue py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Анализирую…</> : <><Search className="h-4 w-4" />Анализировать</>}
          </button>

          {loading && (
            <p className="mt-3 text-center text-xs text-apple-muted">
              Apify собирает Reels, AI анализирует… ~1-3 минуты
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
            {/* Account card */}
            <div className="rounded-apple bg-white p-5 shadow-apple">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-apple-ink">@{result.account.username}</span>
                    {result.account.is_verified && (
                      <span className="rounded-full bg-blue-500 px-1.5 py-0.5 text-[10px] font-bold text-white">✓</span>
                    )}
                  </div>
                  {result.account.full_name && (
                    <div className="text-sm text-apple-muted">{result.account.full_name}</div>
                  )}
                </div>
                <div className="flex shrink-0 gap-4 text-center">
                  {result.account.followers_count != null && (
                    <div>
                      <div className="text-base font-semibold text-apple-ink">{fmt(result.account.followers_count)}</div>
                      <div className="text-xs text-apple-muted">подписчики</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Avg stats row */}
              <div className="mt-4 grid grid-cols-4 divide-x divide-apple-line rounded-xl bg-apple-bg-soft">
                {[
                  { icon: Eye, label: 'views', value: fmt(result.analysis.avg_stats.views) },
                  { icon: Heart, label: 'likes', value: fmt(result.analysis.avg_stats.likes) },
                  { icon: MessageCircle, label: 'comments', value: fmt(result.analysis.avg_stats.comments) },
                  { icon: BarChart2, label: 'eng.', value: result.analysis.avg_stats.eng_rate },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="flex flex-col items-center py-2.5">
                    <Icon className="mb-0.5 h-3.5 w-3.5 text-apple-faint" />
                    <div className="text-sm font-semibold text-apple-ink">{value}</div>
                    <div className="text-[10px] text-apple-faint">{label}</div>
                  </div>
                ))}
              </div>

              {/* Summary */}
              <p className="mt-4 text-sm leading-relaxed text-apple-muted">{result.analysis.summary}</p>

              {/* Strengths / weaknesses */}
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <div className="mb-1.5 text-xs font-semibold text-green-600">Сильные стороны</div>
                  <ul className="space-y-1">
                    {result.analysis.strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-apple-muted">
                        <span className="mt-0.5 text-green-500">✓</span>{s}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="mb-1.5 text-xs font-semibold text-red-500">Слабые стороны</div>
                  <ul className="space-y-1">
                    {result.analysis.weaknesses.map((s, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-apple-muted">
                        <span className="mt-0.5 text-red-400">×</span>{s}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex rounded-xl bg-apple-bg-soft p-1">
              {(['reels', 'hooks', 'patterns', 'ideas'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${tab === t ? 'bg-white text-apple-ink shadow-apple-sm' : 'text-apple-muted'}`}
                >
                  {t === 'reels' ? 'Reels' : t === 'hooks' ? 'Хуки' : t === 'patterns' ? 'Паттерны' : 'Идеи'}
                </button>
              ))}
            </div>

            {/* Tab: Top Reels */}
            {tab === 'reels' && (
              <div className="space-y-2">
                {result.topReels.slice(0, 15).map((r) => (
                  <a
                    key={r.id}
                    href={r.instagram_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-apple bg-white p-3.5 shadow-apple transition hover:shadow-apple-lg"
                  >
                    {r.thumbnail_url && (
                      <img src={r.thumbnail_url} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-xs text-apple-muted">{r.caption ?? '—'}</p>
                      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-apple-faint">
                        <span className="flex items-center gap-0.5"><Eye className="h-3 w-3" />{fmt(r.views_count)}</span>
                        <span className="flex items-center gap-0.5"><Heart className="h-3 w-3" />{fmt(r.likes_count)}</span>
                      </div>
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
                    {/* Score bar */}
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
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-apple-blue/10 text-xs font-bold text-apple-blue">
                        {p.frequency}×
                      </div>
                      <div>
                        <p className="font-medium text-apple-ink">{p.pattern}</p>
                        <p className="mt-1 text-xs text-apple-muted">{p.why}</p>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Recommendations */}
                <div className="rounded-apple bg-white p-4 shadow-apple">
                  <h3 className="mb-3 text-sm font-semibold text-apple-ink">Рекомендации</h3>
                  <ul className="space-y-2">
                    {result.analysis.recommendations.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-apple-muted">
                        <span className="mt-0.5 shrink-0 text-apple-blue">→</span>{r}
                      </li>
                    ))}
                  </ul>
                </div>
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
