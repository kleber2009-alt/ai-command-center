// Hand-written types mirroring supabase/migrations/001_init.sql.
// Regenerate with `supabase gen types typescript` once linked to a project.

export type ContentDayStatus =
  | 'idea'
  | 'generated'
  | 'in_review'
  | 'ready'
  | 'published'
  | 'needs_revision'

export type CampaignStatus = 'draft' | 'active' | 'completed' | 'archived'

export type ContentType = 'reels' | 'carousel'

export type AgentType =
  | 'strategist'
  | 'reels_writer'
  | 'carousel_architect'
  | 'visual_director'
  | 'analytics'

export interface User {
  id: string
  email: string | null
  name: string | null
  created_at: string
}

export interface Campaign {
  id: string
  user_id: string
  title: string
  topic: string | null
  goal: string | null
  duration: number
  target_audience: string | null
  offer: string | null
  lead_magnet: string | null
  tone_of_voice: string | null
  cta: string | null
  platform: string | null
  formats: string[]
  content_pillars: string[]
  status: CampaignStatus
  created_at: string
  updated_at: string
}

export interface ContentDay {
  id: string
  campaign_id: string
  day_number: number
  date: string | null
  topic: string | null
  main_hook: string | null
  daily_meaning: string | null
  cta: string | null
  reels_idea: string | null
  carousel_idea: string | null
  status: ContentDayStatus
  created_at: string
  updated_at: string
}

export interface Reel {
  id: string
  content_day_id: string
  title: string | null
  hooks: string[]
  main_script: string | null
  video_structure: string[]
  b_roll_ideas: string[]
  caption: string | null
  cta: string | null
  hashtags: string[]
  visual_brief: string | null
  status: string
  created_at: string
  updated_at: string
}

export interface Carousel {
  id: string
  content_day_id: string
  cover_title: string | null
  slides: CarouselSlide[]
  caption: string | null
  cta: string | null
  design_prompt: string | null
  hashtags: string[]
  status: string
  created_at: string
  updated_at: string
}

export interface CarouselSlide {
  slide: number
  title?: string
  body: string
}

export interface Metric {
  id: string
  content_day_id: string
  content_type: ContentType
  views: number
  likes: number
  comments: number
  saves: number
  shares: number
  follows: number
  leads: number
  published_at: string | null
  created_at: string
}

export interface AiOutput {
  id: string
  user_id: string
  campaign_id: string | null
  content_day_id: string | null
  agent_type: AgentType
  prompt: string | null
  response: unknown
  created_at: string
}

// --- Self-learning subsystem (migration 002) ---

export type LibrarySource = 'own' | 'competitor' | 'reference'

export type LibraryType =
  | 'reels'
  | 'carousel'
  | 'post'
  | 'story'
  | 'dm'
  | 'offer'
  | 'case'
  | 'review'
  | 'prompt'
  | 'reference'
  | 'hook'

export interface ContentLibraryItem {
  id: string
  user_id: string
  type: LibraryType
  source: LibrarySource
  topic: string | null
  hook: string | null
  content: string | null
  cta: string | null
  format: string | null
  visual_style: string | null
  metrics: Record<string, number>
  performance_score: number
  content_day_id: string | null
  content_type: string | null
  created_at: string
}

export interface Feedback {
  id: string
  user_id: string
  content_id: string | null
  content_type: string | null
  rating: number
  feedback_tags: string[]
  comment: string | null
  created_at: string
}

export type LearningType =
  | 'hook'
  | 'topic'
  | 'format'
  | 'cta'
  | 'style'
  | 'timing'
  | 'general'

export interface AgentLearning {
  id: string
  user_id: string
  learning_type: LearningType | string
  insight: string
  source_content_ids: string[]
  confidence: number
  created_at: string
}

export interface GenerationLog {
  id: string
  user_id: string
  campaign_id: string | null
  content_day_id: string | null
  agent_type: string
  input_context: unknown
  retrieved_examples: unknown
  generated_output: unknown
  user_rating: number | null
  final_status: string | null
  created_at: string
}
