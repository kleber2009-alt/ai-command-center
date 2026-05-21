// AI analysis service for Instagram Intelligence module.
// Uses the same raw-fetch Anthropic pattern as /api/transcribe/generate.

import type { InstagramReel, InstagramAccount } from './instagram-db'

// ─── Types ────────────────────────────────────────────────────────────────────

export type HookAnalysis = {
  text: string
  score: number       // 1-10
  type: string        // pain | benefit | intrigue | conflict | fear | social_proof | contrast | provocation
  reelUrl?: string
}

export type ViralPattern = {
  pattern: string
  frequency: number   // how many top reels share it
  why: string         // why it likely worked
  structure?: {       // optional per spec
    hook?: string
    setup?: string
    value?: string
    twist?: string
    cta?: string
  }
}

export type ContentIdea = {
  title: string
  hook: string
  format: string      // reel | carousel | series
  topic: string
  notes?: string
}

export type AccountAnalysisResult = {
  summary: string
  strengths: string[]
  weaknesses: string[]
  content_pillars: string[]
  posting_frequency: string
  avg_stats: { views: number; likes: number; comments: number; eng_rate: string }
  top_hooks: HookAnalysis[]
  top_topics: string[]
  viral_patterns: ViralPattern[]
  recommendations: string[]
  weak_points: string[]
  content_ideas: ContentIdea[]
}

export type TrendAnalysisResult = {
  niche_overview: string
  top_topics: string[]
  trending_formats: string[]
  top_hooks: HookAnalysis[]
  trending_audios: string[]
  viral_patterns: ViralPattern[]
  pain_points: string[]
  angles: string[]
  content_ideas: ContentIdea[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractJson(text: string): unknown {
  const stripped = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim()
  const start = stripped.indexOf('{')
  if (start === -1) throw new Error('No JSON object in model response')

  // Find matching closing brace via depth tracking (handles truncated JSON better)
  let depth = 0
  let end = -1
  let inStr = false
  let escape = false
  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i]
    if (escape) { escape = false; continue }
    if (ch === '\\' && inStr) { escape = true; continue }
    if (ch === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (ch === '{') depth++
    else if (ch === '}') { depth--; if (depth === 0) { end = i; break } }
  }

  if (end === -1) throw new Error('Unterminated JSON object in model response')
  return JSON.parse(stripped.slice(start, end + 1))
}

async function claudeHaiku(prompt: string, maxTokens = 4096): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY не настроен')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Anthropic (${res.status}): ${t.slice(0, 200)}`)
  }

  const data = await res.json()
  const text = data.content?.[0]?.text ?? ''
  if (!text) throw new Error('Пустой ответ от Anthropic')
  return text
}

function reelSummary(r: InstagramReel): string {
  const cap = r.caption ? r.caption.slice(0, 200) : '—'
  const hooks = r.transcript ? r.transcript.slice(0, 300) : cap
  return `[${r.shortcode}] views:${r.views_count} likes:${r.likes_count} comments:${r.comments_count} viral:${r.viral_score}\nHook/caption: ${hooks}`
}

// ─── Account Analysis ─────────────────────────────────────────────────────────

export async function analyzeAccount(
  account: InstagramAccount,
  reels: InstagramReel[],
): Promise<AccountAnalysisResult> {
  const top = reels.slice(0, 15)
  const avgViews = reels.length ? Math.round(reels.reduce((s, r) => s + r.views_count, 0) / reels.length) : 0
  const avgLikes = reels.length ? Math.round(reels.reduce((s, r) => s + r.likes_count, 0) / reels.length) : 0
  const avgComments = reels.length ? Math.round(reels.reduce((s, r) => s + r.comments_count, 0) / reels.length) : 0
  const engRate = avgViews > 0 ? (((avgLikes + avgComments) / avgViews) * 100).toFixed(1) + '%' : '—'

  const reelsList = top.map(reelSummary).join('\n\n')

  const prompt = `Ты — топ-эксперт по контент-стратегии в Instagram. Анализируй данные ниже и дай глубокий отчёт.

Аккаунт: @${account.username}
Подписчики: ${account.followers_count ?? '?'}
Подписки: ${account.following_count ?? '?'}
Постов: ${account.posts_count ?? '?'}
Биография: ${account.bio ?? '—'}

Средние метрики (${reels.length} Reels):
  views: ${avgViews}, likes: ${avgLikes}, comments: ${avgComments}, eng_rate: ${engRate}

Топ Reels по viral score:
${reelsList}

Верни ТОЛЬКО валидный JSON (без markdown-обёртки):
{
  "summary": "2-3 абзаца об аккаунте, тональности, позиционировании",
  "strengths": ["сила 1", "сила 2", ...],
  "weaknesses": ["слабость 1", ...],
  "content_pillars": ["тема/опора 1", ...],
  "posting_frequency": "оценка частоты постинга",
  "top_hooks": [
    { "text": "первая фраза/хук", "score": 8, "type": "pain|benefit|intrigue|conflict|fear|social_proof|contrast|provocation", "reelUrl": "https://..." },
    ...
  ],
  "top_topics": ["тема 1", "тема 2", ...],
  "viral_patterns": [
    { "pattern": "описание паттерна", "frequency": 3, "why": "почему сработало", "structure": { "hook": "...", "setup": "...", "value": "...", "twist": "...", "cta": "..." } },
    ...
  ],
  "recommendations": ["что усилить", "что убрать", ...],
  "weak_points": ["что мешает росту", ...],
  "content_ideas": [
    { "title": "название идеи", "hook": "первая фраза", "format": "reel|carousel|series", "topic": "тема", "notes": "детали" },
    ...10 идей...
  ]
}`

  const raw = await claudeHaiku(prompt, 8000)
  const parsed = extractJson(raw) as AccountAnalysisResult

  // Attach avg_stats (computed server-side, not by LLM)
  parsed.avg_stats = { views: avgViews, likes: avgLikes, comments: avgComments, eng_rate: engRate }

  return parsed
}

// ─── Trend Research ───────────────────────────────────────────────────────────

export async function analyzeTrends(
  niche: string,
  reels: InstagramReel[],
  language = 'ru',
): Promise<TrendAnalysisResult> {
  const top = reels.slice(0, 30)
  const reelsList = top.map(reelSummary).join('\n\n')

  // Collect unique audios for trending audio detection
  const audioMap = new Map<string, number>()
  for (const r of reels) {
    if (r.audio_title) {
      audioMap.set(r.audio_title, (audioMap.get(r.audio_title) ?? 0) + 1)
    }
  }
  const topAudios = Array.from(audioMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([title, count]) => `"${title}" (${count}×)`)
    .join(', ')

  const prompt = `Ты — эксперт по вирусному контенту и трендам в Instagram. Ниша: ${niche}. Язык: ${language}.

Проанализируй ${reels.length} Reels от конкурентов. Определи паттерны вирусности, тренды, лучшие хуки.

Топ Reels по viral score:
${reelsList}

Встречающиеся аудио/музыка:
${topAudios || '—'}

Верни ТОЛЬКО валидный JSON:
{
  "niche_overview": "краткий обзор ниши и конкуренции",
  "top_topics": ["топ-тема 1", ...],
  "trending_formats": ["формат 1 (сколько раз)", ...],
  "top_hooks": [
    { "text": "хук", "score": 9, "type": "pain|benefit|intrigue|conflict|fear|social_proof|contrast|provocation" },
    ...10 хуков...
  ],
  "trending_audios": ["аудио 1", ...],
  "viral_patterns": [
    { "pattern": "паттерн", "frequency": 5, "why": "почему работает", "structure": { "hook": "...", "value": "...", "cta": "..." } },
    ...
  ],
  "pain_points": ["боль аудитории 1", ...],
  "angles": ["угол подачи 1", ...],
  "content_ideas": [
    { "title": "идея", "hook": "хук для идеи", "format": "reel|carousel|series", "topic": "тема", "notes": "детали" },
    ...10 идей...
  ]
}`

  const raw = await claudeHaiku(prompt, 8000)
  return extractJson(raw) as TrendAnalysisResult
}
