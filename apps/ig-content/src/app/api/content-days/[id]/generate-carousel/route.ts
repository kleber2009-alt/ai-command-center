import { NextRequest, NextResponse } from 'next/server'
import { requireUser, jsonError, GENERATION_ERROR } from '@/lib/api'
import { runCarouselArchitect } from '@/lib/agents'
import { retrieveContext } from '@/lib/knowledge'
import type { Campaign } from '@/types/database'

// Generates (or regenerates) the carousel for a day, upserting a single
// carousels row keyed on content_day_id.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { user, supabase } = auth

  const { data: day, error: dayErr } = await supabase
    .from('content_days')
    .select('*')
    .eq('id', params.id)
    .single()
  if (dayErr || !day) return jsonError('Content day not found', 404)

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', day.campaign_id)
    .single()
  if (!campaign) return jsonError('Campaign not found', 404)

  const topic = day.carousel_idea || day.topic || campaign.topic || ''

  const rag = await retrieveContext(supabase, user.id, topic, campaign as Campaign)

  let carousel
  try {
    carousel = await runCarouselArchitect({
      topic,
      campaign: campaign as Campaign,
      goal: campaign.goal ?? '',
      ragContext: rag.text,
    })
  } catch (err) {
    console.error('carousel generation failed:', err)
    return jsonError(GENERATION_ERROR, 502)
  }

  await supabase.from('ai_outputs').insert({
    user_id: user.id,
    campaign_id: campaign.id,
    content_day_id: day.id,
    agent_type: 'carousel_architect',
    prompt: topic,
    response: carousel,
  })

  const row = {
    content_day_id: day.id,
    cover_title: carousel.cover_title ?? day.topic,
    slides: carousel.slides ?? [],
    caption: carousel.caption ?? '',
    cta: carousel.cta ?? '',
    design_prompt: carousel.design_prompt ?? '',
    hashtags: carousel.hashtags ?? [],
    status: 'generated',
  }

  const { data: existing } = await supabase
    .from('carousels')
    .select('id')
    .eq('content_day_id', day.id)
    .maybeSingle()

  const { data: saved, error: saveErr } = existing
    ? await supabase.from('carousels').update(row).eq('id', existing.id).select('*').single()
    : await supabase.from('carousels').insert(row).select('*').single()

  if (saveErr) return jsonError(saveErr.message, 500)

  await supabase.from('generation_logs').insert({
    user_id: user.id,
    campaign_id: campaign.id,
    content_day_id: day.id,
    agent_type: 'carousel_architect',
    input_context: { topic, goal: campaign.goal ?? '' },
    retrieved_examples: { best: rag.best, worst: rag.worst, learnings: rag.learnings, avoid: rag.avoidTags },
    generated_output: carousel,
    final_status: 'generated',
  })

  if (day.status === 'idea') {
    await supabase.from('content_days').update({ status: 'generated' }).eq('id', day.id)
  }

  return NextResponse.json({ carousel: saved })
}
