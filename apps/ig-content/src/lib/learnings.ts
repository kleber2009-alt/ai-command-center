import type { SupabaseClient } from '@supabase/supabase-js'
import { complete, extractJson } from './anthropic'
import { fetchMetrics } from './analytics'
import { performanceScore } from './scoring'
import { isDemo } from './demo/store'
import { demoLearnings } from './demo/agents'

export interface DerivedLearning {
  learning_type: string
  insight: string
  confidence: number
}

// Weekly learning summary: condenses metrics + feedback + generation outcomes
// into durable insights and persists them to agent_learnings.
export async function runWeeklyLearning(
  supabase: SupabaseClient,
  userId: string,
): Promise<DerivedLearning[]> {
  let learnings: DerivedLearning[]

  if (isDemo()) {
    learnings = demoLearnings()
  } else {
    const rows = await fetchMetrics(supabase)
    const metricsPayload = rows.map((r) => ({
      type: r.content_type,
      topic: r.content_days?.topic,
      hook: r.content_days?.main_hook,
      score: performanceScore(r),
      views: r.views,
      saves: r.saves,
      shares: r.shares,
      comments: r.comments,
      follows: r.follows,
      leads: r.leads,
    }))

    const { data: feedback } = await supabase
      .from('feedback')
      .select('rating, feedback_tags, comment, content_type')
      .order('created_at', { ascending: false })
      .limit(50)

    if (metricsPayload.length === 0 && (!feedback || feedback.length === 0)) {
      return []
    }

    const system =
      'You are a content performance analyst building an Instagram creator\'s ' +
      'persistent memory. Derive concise, durable, non-obvious learnings that will ' +
      'improve future content. You ALWAYS reply with valid JSON only — no prose.'

    const user = `Metrics (each has a performance_score; higher is better):
${JSON.stringify(metricsPayload, null, 2)}

User feedback on generated content (rating 1-5, with reason tags):
${JSON.stringify(feedback ?? [], null, 2)}

Produce 4-8 learnings. Each must be specific and actionable (about hooks, topics,
formats, CTAs, style or timing). Set confidence 0-100 based on how much evidence
supports it.

Return ONLY a JSON array:
[{ "learning_type": "hook|topic|format|cta|style|timing|general", "insight": "", "confidence": 70 }]`

    const raw = await complete(system, user, 2048)
    const parsed = extractJson<DerivedLearning[]>(raw)
    learnings = Array.isArray(parsed) ? parsed : []
  }

  if (learnings.length === 0) return []

  const rows = learnings.map((l) => ({
    user_id: userId,
    learning_type: l.learning_type ?? 'general',
    insight: l.insight,
    confidence: Math.max(0, Math.min(100, Number(l.confidence) || 50)),
    source_content_ids: [],
  }))

  const { data } = await supabase.from('agent_learnings').insert(rows).select('*')
  return (data ?? learnings) as DerivedLearning[]
}
