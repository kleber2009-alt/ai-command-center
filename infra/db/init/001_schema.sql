-- ═══════════════════════════════════════════════════════════════════
-- infra/db/init/001_schema.sql — full schema for self-hosted Postgres
-- ───────────────────────────────────────────────────────────────────
-- Replaces all Supabase migrations (001_transcripts, 002_generations,
-- ai-office-project/supabase/migrations/003..005) with a single source
-- of truth. Postgres-only — no Supabase storage.buckets / RLS /
-- auth.uid() references.
--
-- This file is auto-applied on first start of the postgres container
-- (Docker mounts ./db/init/*.sql to /docker-entrypoint-initdb.d/).
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ───────────────────────────────────────────────────────────────────
-- Transcripts (was: ai-command-center/supabase/migrations/001_+002_)
-- ───────────────────────────────────────────────────────────────────
create table if not exists transcripts (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  url           text not null,
  title         text,
  source        text,
  language      text,
  duration      numeric,
  transcript    text not null,
  paragraphs    jsonb,
  summary       text,
  bullets       jsonb,
  translation   jsonb,
  generations   jsonb
);

create index if not exists transcripts_created_at_idx
  on transcripts (created_at desc);

-- ───────────────────────────────────────────────────────────────────
-- Leads (was: implicit Supabase `leads` table, used by config.js)
-- ───────────────────────────────────────────────────────────────────
create table if not exists leads (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  niche              text,
  to_improve         jsonb default '[]'::jsonb,
  current_revenue    text,
  goal               text,
  main_problem       text,
  recommended_agents jsonb default '[]'::jsonb,
  name               text,
  email              text,
  telegram           text,
  source             text,
  ref_data           jsonb
);

create index if not exists leads_created_at_idx on leads (created_at desc);
create index if not exists leads_email_idx       on leads (lower(email));

-- ───────────────────────────────────────────────────────────────────
-- Voices (was: ai-office-project/supabase/migrations/003_voice.sql)
-- ───────────────────────────────────────────────────────────────────
create table if not exists voices (
  id                 uuid primary key default gen_random_uuid(),
  owner_handle       text not null,
  display_name       text,
  provider           text not null default 'elevenlabs',
  provider_voice_id  text not null,
  sample_seconds     int,
  created_at         timestamptz not null default now(),
  archived_at        timestamptz
);

create unique index if not exists voices_owner_active_uniq
  on voices (owner_handle)
  where archived_at is null;
create index if not exists voices_owner_idx on voices (owner_handle);

create table if not exists voice_generations (
  id                uuid primary key default gen_random_uuid(),
  voice_id          uuid references voices(id) on delete set null,
  owner_handle      text not null,
  text              text not null,
  audio_path        text,
  audio_url         text,
  duration_ms       int,
  status            text not null default 'generated',
  source            text,
  meta              jsonb default '{}'::jsonb,
  tg_chat_id        bigint,
  tg_message_id     bigint,
  recipient_chat_id bigint,
  created_at        timestamptz not null default now()
);

create index if not exists voice_generations_owner_idx
  on voice_generations (owner_handle, created_at desc);
create index if not exists voice_generations_tg_idx
  on voice_generations (tg_chat_id, created_at desc);

-- ───────────────────────────────────────────────────────────────────
-- Voice bot users (was: 004_voice_bot.sql)
-- ───────────────────────────────────────────────────────────────────
create table if not exists voice_bot_users (
  tg_chat_id     bigint primary key,
  tg_user_id     bigint,
  tg_username    text,
  owner_handle   text not null,
  preferences    jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

create index if not exists voice_bot_users_owner_idx
  on voice_bot_users (owner_handle);

-- ───────────────────────────────────────────────────────────────────
-- Voice binding tokens (was: 005_binding_tokens.sql)
-- ───────────────────────────────────────────────────────────────────
create table if not exists voice_binding_tokens (
  token            text primary key,
  owner_handle     text not null,
  voice_id         uuid references voices(id) on delete cascade,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null default (now() + interval '1 hour'),
  used_at          timestamptz,
  used_by_chat_id  bigint
);

create index if not exists voice_binding_tokens_owner_idx
  on voice_binding_tokens (owner_handle, created_at desc);
create index if not exists voice_binding_tokens_expires_idx
  on voice_binding_tokens (expires_at)
  where used_at is null;
