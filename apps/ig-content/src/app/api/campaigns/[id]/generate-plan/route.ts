import { NextRequest, NextResponse } from 'next/server'
import { requireUser, jsonError, GENERATION_ERROR } from '@/lib/api'
import { runStrategist } from '@/lib/agents'
import type { Campaign } from '@/types/database'

// Generates the full serial plan for a campaign and stores one content_days
// row per day. Existing days for the campaign are replaced.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { user, supabase } = auth

  const { data: campaign, error: campErr } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', params.id)
    .single()

  if (campErr || !campaign) return jsonError('Campaign not found', 404)

  let plan
  try {
    plan = await runStrategist(campaign as Campaign)
  } catch (err) {
    console.error('strategist failed:', err)
    return jsonError(GENERATION_ERROR, 502)
  }

  // Persist the raw agent output for auditing / regeneration.
  await supabase.from('ai_outputs').insert({
    user_id: user.id,
    campaign_id: campaign.id,
    agent_type: 'strategist',
    prompt: `plan:${campaign.duration}`,
    response: plan,
  })

  // Replace any previously generated days.
  await supabase.from('content_days').delete().eq('campaign_id', campaign.id)

  const today = new Date()
  const rows = plan.map((d, i) => {
    const date = new Date(today)
    date.setDate(today.getDate() + i)
    return {
      campaign_id: campaign.id,
      day_number: d.day_number ?? i + 1,
      date: date.toISOString().slice(0, 10),
      topic: d.topic,
      main_hook: d.main_hook,
      daily_meaning: d.daily_meaning,
      cta: d.cta,
      reels_idea: d.reels_idea,
      carousel_idea: d.carousel_idea,
      status: 'idea' as const,
    }
  })

  const { data: inserted, error: insErr } = await supabase
    .from('content_days')
    .insert(rows)
    .select('*')

  if (insErr) return jsonError(insErr.message, 500)
  return NextResponse.json({ days: inserted, count: inserted?.length ?? 0 })
}
