import { NextResponse } from 'next/server'
import { requireUser, jsonError, GENERATION_ERROR } from '@/lib/api'
import { fetchMetrics, summarize } from '@/lib/analytics'
import { runAnalytics } from '@/lib/agents'

// Runs the Analytics agent over the user's published metrics and returns
// structured recommendations.
export async function POST() {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { user, supabase } = auth

  const rows = await fetchMetrics(supabase)
  if (rows.length === 0) {
    return jsonError('Нет данных для анализа. Сначала добавьте метрики опубликованного контента.', 400)
  }

  const payload = rows.map((r) => ({
    type: r.content_type,
    topic: r.content_days?.topic,
    hook: r.content_days?.main_hook,
    views: r.views,
    likes: r.likes,
    comments: r.comments,
    saves: r.saves,
    shares: r.shares,
    follows: r.follows,
    leads: r.leads,
  }))

  let analysis
  try {
    analysis = await runAnalytics(payload)
  } catch (err) {
    console.error('analytics agent failed:', err)
    return jsonError(GENERATION_ERROR, 502)
  }

  await supabase.from('ai_outputs').insert({
    user_id: user.id,
    agent_type: 'analytics',
    prompt: `analyze:${rows.length} rows`,
    response: analysis,
  })

  return NextResponse.json({ analysis, summary: summarize(rows) })
}
