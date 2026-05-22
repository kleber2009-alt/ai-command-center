-- ═══════════════════════════════════════════════════════════════════
-- 004_voice_bot.sql — Phase 5 · Commit 2 (TG voice composer bot)
-- ───────────────────────────────────────────────────────────────────
-- Adds bot-user mapping and extends voice_generations with TG fields.
-- Run AFTER 003_voice.sql in Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════

-- ── Bot users: TG chat ↔ owner_handle (voice) ──
create table if not exists public.voice_bot_users (
  tg_chat_id     bigint primary key,
  tg_user_id     bigint,
  tg_username    text,
  owner_handle   text not null,
  preferences    jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

create index if not exists voice_bot_users_owner_idx
  on public.voice_bot_users (owner_handle);

alter table public.voice_bot_users enable row level security;
-- Writes только через service-key (RLS блокирует anon по умолчанию).
drop policy if exists voice_bot_users_anon_select on public.voice_bot_users;
create policy voice_bot_users_anon_select
  on public.voice_bot_users for select using (true);

-- ── Extend voice_generations with TG provenance ──
alter table public.voice_generations
  add column if not exists tg_chat_id    bigint,
  add column if not exists tg_message_id bigint,
  add column if not exists recipient_chat_id bigint;

create index if not exists voice_generations_tg_idx
  on public.voice_generations (tg_chat_id, created_at desc);

-- ───────────────────────────────────────────────────────────────────
-- Откат (если нужно):
--   drop table if exists public.voice_bot_users;
--   alter table public.voice_generations
--     drop column if exists tg_chat_id,
--     drop column if exists tg_message_id,
--     drop column if exists recipient_chat_id;
-- ═══════════════════════════════════════════════════════════════════
