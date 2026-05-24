import { NextRequest, NextResponse } from 'next/server'
import { requireUser, jsonError, GENERATION_ERROR } from '@/lib/api'
import { runReelsWriter, runVisualDirector } from '@/lib/agents'
import { retrieveContext } from '@/lib/knowledge'
import type { Campaign } from '@/types/database'

// Generates (or regenerates) the Reels script + visual brief for a day,
// upserting a single reels row keyed on content_day_id.
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

  const topic = day.reels_idea || day.topic || campaign.topic || ''

  const rag = await retrieveContext(supabase, user.id, topic, campaign as Campaign)

  let reels
  let brief
  try {
    reels = await runReelsWriter({
      topic,
      campaign: campaign as Campaign,
      goal: campaign.goal ?? '',
      ragContext: rag.text,
    })
    brief = await runVisualDirector({ contentType: 'Instagram Reels', topic })
  } catch (err) {
    console.error('reels generation failed:', err)
    return jsonError(GENERATION_ERROR, 502)
  }

  await supabase.from('ai_outputs').insert([
    {
      user_id: user.id,
      campaign_id: campaign.id,
      content_day_id: day.id,
      agent_type: 'reels_writer',
      prompt: topic,
      response: reels,
    },
    {
      user_id: user.id,
      campaign_id: campaign.id,
      content_day_id: day.id,
      agent_type: 'visual_director',
      prompt: topic,
      response: brief,
    },
  ])

  const row = {
    content_day_id: day.id,
    title: reels.title ?? day.topic,
    hooks: reels.hooks ?? [],
    main_script: reels.main_script ?? '',
    video_structure: reels.video_structure ?? [],
    b_roll_ideas: reels.b_roll_ideas ?? [],
    caption: reels.caption ?? '',
    cta: reels.cta ?? '',
    hashtags: reels.hashtags ?? [],
    visual_brief: reels.visual_brief
      ? `${reels.visual_brief}\n\nImage prompt: ${brief.image_prompt}`
      : brief.image_prompt,
    status: 'generated',
  }

  const { data: existing } = await supabase
    .from('reels')
    .select('id')
    .eq('content_day_id', day.id)
    .maybeSingle()

  const { data: saved, error: saveErr } = existing
    ? await supabase.from('reels').update(row).eq('id', existing.id).select('*').single()
    : await supabase.from('reels').insert(row).select('*').single()

  if (saveErr) return jsonError(saveErr.message, 500)

  await supabase.from('generation_logs').insert({
    user_id: user.id,
    campaign_id: campaign.id,
    content_day_id: day.id,
    agent_type: 'reels_writer',
    input_context: { topic, goal: campaign.goal ?? '' },
    retrieved_examples: { best: rag.best, worst: rag.worst, learnings: rag.learnings, avoid: rag.avoidTags },
    generated_output: reels,
    final_status: 'generated',
  })

  if (day.status === 'idea') {
    await supabase.from('content_days').update({ status: 'generated' }).eq('id', day.id)
  }

  return NextResponse.json({ reel: saved, visual_brief: brief })
}
