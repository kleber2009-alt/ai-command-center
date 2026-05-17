// Types for the apps/tg-agent tables (see supabase/migrations/005_tg_agent.sql).
// Kept in the transcribe app so the admin UI can render them without
// pulling tg-agent's dependencies.

export const LEAD_STATUSES = [
  'new',
  'cold',
  'warm',
  'hot',
  'buyer',
  'support',
  'negative',
] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

export const STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'Новый',
  cold: 'Холодный',
  warm: 'Тёплый',
  hot: 'Горячий',
  buyer: 'Купил',
  support: 'Поддержка',
  negative: 'Негатив',
}

export const STATUS_COLOR: Record<LeadStatus, string> = {
  new: 'bg-slate-700/40 text-slate-300',
  cold: 'bg-sky-500/15 text-sky-300',
  warm: 'bg-amber-500/15 text-amber-300',
  hot: 'bg-orange-500/20 text-orange-300',
  buyer: 'bg-emerald-500/15 text-emerald-300',
  support: 'bg-indigo-500/15 text-indigo-300',
  negative: 'bg-rose-500/15 text-rose-300',
}

export const MESSAGE_CLASSES = [
  'GENERAL_CHAT',
  'QUESTION',
  'PRODUCT_INTEREST',
  'PRICE_REQUEST',
  'OBJECTION',
  'BUYING_INTENT',
  'NEGATIVE',
  'SUPPORT_REQUEST',
  'OWNER_REQUEST',
  'SPAM',
] as const
export type MessageClass = (typeof MESSAGE_CLASSES)[number]

export const ACTIONS = [
  'IGNORE',
  'REPLY',
  'REPLY_SOFT',
  'REPLY_AND_NOTIFY',
  'NOTIFY_ONLY',
  'DRAFT_FOR_OWNER',
] as const
export type Action = (typeof ACTIONS)[number]

export type ChatRow = {
  chat_id: number
  title: string | null
  auto_reply: boolean
  created_at: string
  updated_at: string
}

export type ChatSummary = ChatRow & {
  total_messages: number
  hot_leads: number
  last_message_at: string | null
}

export type UserRow = {
  chat_id: number
  user_id: number
  username: string | null
  first_name: string | null
  last_name: string | null
  status: LeadStatus
  status_updated_at: string
  last_seen_at: string
  created_at: string
}

export type MessageRow = {
  id: number
  chat_id: number
  user_id: number | null
  telegram_message_id: number
  text: string
  class: MessageClass | null
  confidence: number | null
  action: Action | null
  reasoning: string | null
  response: string | null
  created_at: string
}

// Hot lead = anyone we should look at first. Mirrors the
// notification triggers in apps/tg-agent/src/notifier.ts.
export const HOT_LEAD_STATUSES: ReadonlySet<LeadStatus> = new Set<LeadStatus>(['hot', 'buyer'])
