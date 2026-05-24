// Default campaign template (spec §13) — prefilled in the create form.
export const DEFAULT_CAMPAIGN = {
  title: '30 Days With Claude',
  topic:
    'How I study Claude and automate content, sales and business systems',
  goal: 'Increase reach, followers and client acquisition',
  duration: 30,
  target_audience:
    'Entrepreneurs, creators, marketers and online businesses interested in AI',
  offer: 'AI implementation consulting',
  lead_magnet: '10 Claude prompts that replace marketers and strategists',
  tone_of_voice: 'Expert, energetic, storytelling-driven',
  cta: 'Follow for the full 30-day Claude experiment',
}

export const DURATION_OPTIONS = [30, 60, 90] as const

export const CONTENT_DAY_STATUSES = [
  'idea',
  'generated',
  'in_review',
  'ready',
  'published',
  'needs_revision',
] as const

export const STATUS_LABELS: Record<string, string> = {
  idea: 'Идея',
  generated: 'Сгенерировано',
  in_review: 'На ревью',
  ready: 'Готово',
  published: 'Опубликовано',
  needs_revision: 'Нужны правки',
  draft: 'Черновик',
  active: 'Активна',
  completed: 'Завершена',
  archived: 'В архиве',
}
