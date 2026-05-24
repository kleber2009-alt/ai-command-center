import { complete, extractJson } from './anthropic'
import type { Campaign } from '@/types/database'
import { isDemo } from './demo/store'
import {
  demoPlan,
  demoReels,
  demoCarousel,
  demoVisualBrief,
  demoAnalytics,
} from './demo/agents'

// ---------------------------------------------------------------------------
// Shared types for agent outputs
// ---------------------------------------------------------------------------
export interface PlanDay {
  day_number: number
  topic: string
  reels_idea: string
  carousel_idea: string
  main_hook: string
  daily_meaning: string
  cta: string
  reach_rationale?: string
}

export interface ReelsOutput {
  title?: string
  hooks: string[]
  main_script: string
  video_structure: string[]
  b_roll_ideas: string[]
  caption: string
  cta: string
  hashtags: string[]
  visual_brief?: string
}

export interface CarouselOutput {
  cover_title: string
  slides: { slide: number; title?: string; body: string }[]
  caption: string
  cta: string
  design_prompt: string
  hashtags: string[]
}

export interface VisualBriefOutput {
  concept: string
  composition: string
  color_palette: string
  typography: string
  image_prompt: string
  designer_brief: string
}

export interface AnalyticsOutput {
  best_topics: string[]
  best_hooks: string[]
  best_formats: string[]
  reach_patterns: string[]
  saves_patterns: string[]
  repeat: string[]
  remove: string[]
  recommendations: string[]
  next_7_days: string[]
}

function campaignContext(c: Campaign): string {
  return [
    `Title: ${c.title}`,
    `Topic: ${c.topic ?? ''}`,
    `Goal: ${c.goal ?? ''}`,
    `Target audience: ${c.target_audience ?? ''}`,
    `Offer: ${c.offer ?? ''}`,
    `Lead magnet: ${c.lead_magnet ?? ''}`,
    `Tone of voice: ${c.tone_of_voice ?? 'Expert, energetic, storytelling-driven'}`,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// 7.1 Content Strategist Agent
// ---------------------------------------------------------------------------
function ragBlock(ragContext?: string): string {
  return ragContext ? `\n\n${ragContext}\n` : ''
}

export async function runStrategist(c: Campaign, ragContext?: string): Promise<PlanDay[]> {
  if (isDemo()) return demoPlan(c.duration)
  const system =
    'You are an Instagram content strategist for an AI entrepreneur. ' +
    'You design serial, story-driven campaigns that increase reach, engagement, ' +
    'authority, followers and leads. You ALWAYS reply with valid JSON only — no prose.'

  const user = `Create a serial content campaign that increases reach, engagement, authority, followers and leads.

Campaign Topic:
${c.topic ?? ''}

Goal:
${c.goal ?? ''}

Target Audience:
${c.target_audience ?? ''}

Offer:
${c.offer ?? ''}

Lead Magnet:
${c.lead_magnet ?? ''}
${ragBlock(ragContext)}
Generate a ${c.duration}-day content plan. The days must function as ONE story: each
day continues the previous one and teases the next, with a recognizable, repeated CTA.

Tone: energetic, expert, slightly provocative, storytelling-driven, serial-style.

Return ONLY a JSON array of exactly ${c.duration} objects with this shape:
[
  {
    "day_number": 1,
    "topic": "",
    "reels_idea": "",
    "carousel_idea": "",
    "main_hook": "",
    "daily_meaning": "",
    "cta": "",
    "reach_rationale": ""
  }
]`

  // 30-day plan w/ 8 fields per day ≈ 8K tokens — the prior 8192 cap clipped
  // mid-array at ~30K chars. 16384 gives comfortable headroom up to ~60 days.
  const raw = await complete(system, user, 16384)
  const days = extractJson<PlanDay[]>(raw)
  if (!Array.isArray(days)) throw new Error('Strategist did not return an array')
  return days
}

// ---------------------------------------------------------------------------
// 7.2 Reels Writer Agent
// ---------------------------------------------------------------------------
export async function runReelsWriter(args: {
  topic: string
  campaign: Campaign
  goal: string
  ragContext?: string
}): Promise<ReelsOutput> {
  if (isDemo()) return demoReels(args.topic)
  const system =
    'You are a viral Instagram Reels scriptwriter who maximizes retention and ' +
    'hook strength. You ALWAYS reply with valid JSON only — no prose.'

  const user = `Topic:
${args.topic}

Campaign Context:
${campaignContext(args.campaign)}

Goal:
${args.goal}
${ragBlock(args.ragContext)}
Write a 45–60 second Instagram Reels script.
Structure: 1) Hook in first 2 seconds 2) Problem 3) Demonstration 4) Insight 5) Value 6) CTA.

Return ONLY this JSON:
{
  "title": "",
  "hooks": ["5 distinct scroll-stopping hook options"],
  "main_script": "full spoken talking-head script",
  "video_structure": ["scene-by-scene beats with on-screen text"],
  "b_roll_ideas": [],
  "caption": "",
  "cta": "",
  "hashtags": [],
  "visual_brief": "short visual direction"
}`

  const raw = await complete(system, user, 4096)
  return extractJson<ReelsOutput>(raw)
}

// ---------------------------------------------------------------------------
// 7.3 Carousel Architect Agent
// ---------------------------------------------------------------------------
export async function runCarouselArchitect(args: {
  topic: string
  campaign: Campaign
  goal: string
  ragContext?: string
}): Promise<CarouselOutput> {
  if (isDemo()) return demoCarousel(args.topic)
  const system =
    'You are an Instagram carousel strategist who creates save-worthy, ' +
    'engagement-optimized slide decks. You ALWAYS reply with valid JSON only — no prose.'

  const user = `Topic:
${args.topic}

Campaign Context:
${campaignContext(args.campaign)}

Goal:
${args.goal}
${ragBlock(args.ragContext)}
Generate a carousel with 8–10 slides.
Structure: 1) Hook cover 2) Pain amplification 3) Common mistake 4) New approach
5) Framework 6) Example 7) Prompt or instruction 8) Conclusion 9) CTA.

Return ONLY this JSON:
{
  "cover_title": "",
  "slides": [{ "slide": 1, "title": "", "body": "" }],
  "caption": "",
  "cta": "",
  "design_prompt": "",
  "hashtags": []
}`

  // 10 slides with detailed bodies + design_prompt + hashtags can blow past 4K.
  const raw = await complete(system, user, 8192)
  return extractJson<CarouselOutput>(raw)
}

// ---------------------------------------------------------------------------
// 7.4 Visual Director Agent
// ---------------------------------------------------------------------------
export async function runVisualDirector(args: {
  contentType: string
  topic: string
}): Promise<VisualBriefOutput> {
  if (isDemo()) return demoVisualBrief(args.topic)
  const system =
    'You are an art director for premium AI content. Brand style: premium tech, ' +
    'cinematic, futuristic, creator economy, high contrast, dark UI, modern dashboards. ' +
    'You ALWAYS reply with valid JSON only — no prose.'

  const user = `Create a visual brief for: ${args.contentType}
Topic: ${args.topic}

Return ONLY this JSON:
{
  "concept": "",
  "composition": "",
  "color_palette": "",
  "typography": "",
  "image_prompt": "ready-to-use Midjourney / AI image prompt",
  "designer_brief": ""
}`

  const raw = await complete(system, user, 2048)
  return extractJson<VisualBriefOutput>(raw)
}

// ---------------------------------------------------------------------------
// 7.5 Analytics Agent
// ---------------------------------------------------------------------------
export async function runAnalytics(metricsData: unknown): Promise<AnalyticsOutput> {
  if (isDemo()) return demoAnalytics()
  const system =
    'You are an Instagram content analyst. You find what works and give concrete, ' +
    'actionable next steps. You ALWAYS reply with valid JSON only — no prose.'

  const user = `Analyze these metrics (JSON):
${JSON.stringify(metricsData, null, 2)}

Find: best topics, best hooks, best formats, highest-reach patterns, highest-saves
patterns, what to repeat, what to remove, and recommendations for the next 7 days.

Return ONLY this JSON:
{
  "best_topics": [],
  "best_hooks": [],
  "best_formats": [],
  "reach_patterns": [],
  "saves_patterns": [],
  "repeat": [],
  "remove": [],
  "recommendations": [],
  "next_7_days": []
}`

  const raw = await complete(system, user, 3072)
  return extractJson<AnalyticsOutput>(raw)
}
