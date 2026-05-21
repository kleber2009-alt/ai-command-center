-- ═══════════════════════════════════════════════════════════════════
-- persona-train migration 001
-- ───────────────────────────────────────────────────────────────────
-- Runs against infra-postgres-1.aio (shared with ai-office). Adds the
-- voice_samples table for incremental training and avatar tables. Does
-- NOT touch existing voices / voice_binding_tokens / voice_bot_users /
-- voice_generations — those stay as-is so the ai-office bot keeps
-- working unchanged.
-- ═══════════════════════════════════════════════════════════════════

-- ─── voice_samples ──────────────────────────────────────────────────
-- Each row = one user-uploaded audio chunk (voice note, file upload,
-- or web recording) attributed to an owner_handle. When the total of
-- consumed=false rows for an owner crosses AUTO_RETRAIN_SECONDS, the
-- /api/voice/train endpoint sends them all to ElevenLabs as a fresh
-- IVC and marks the rows consumed.

create table if not exists voice_samples (
  id                uuid primary key default gen_random_uuid(),
  owner_handle      text not null,
  source            text not null,           -- 'tg' | 'web' | 'upload'
  storage_kind      text not null,           -- 'fs' | 's3'
  storage_path      text not null,           -- relative path or s3 key
  mime_type         text not null,
  byte_size         integer not null,
  duration_seconds  numeric(10,2),
  tg_chat_id        bigint,
  tg_message_id     bigint,
  tg_file_id        text,
  consumed          boolean not null default false,
  consumed_at       timestamptz,
  consumed_voice_id uuid references voices(id) on delete set null,
  meta              jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists voice_samples_owner_idx
  on voice_samples (owner_handle, consumed, created_at desc);

create index if not exists voice_samples_tg_idx
  on voice_samples (tg_chat_id, created_at desc);

-- ─── avatar_samples (kruzhki) ───────────────────────────────────────
-- Telegram video notes (round 1-minute clips) used as source material
-- for HeyGen/Higgsfield avatar training. Same accumulator pattern.

create table if not exists avatar_samples (
  id                uuid primary key default gen_random_uuid(),
  owner_handle      text not null,
  source            text not null,           -- 'tg' | 'web' | 'upload'
  storage_kind      text not null,           -- 'fs' | 's3'
  storage_path      text not null,
  mime_type         text not null,
  byte_size         integer not null,
  duration_seconds  numeric(10,2),
  width             integer,
  height            integer,
  tg_chat_id        bigint,
  tg_message_id     bigint,
  tg_file_id        text,
  consumed          boolean not null default false,
  consumed_at       timestamptz,
  consumed_avatar_id uuid,                   -- FK set after avatars table created
  meta              jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists avatar_samples_owner_idx
  on avatar_samples (owner_handle, consumed, created_at desc);

-- ─── avatars (HeyGen / Higgsfield trained characters) ───────────────
create table if not exists avatars (
  id                uuid primary key default gen_random_uuid(),
  owner_handle      text not null,
  display_name      text,
  provider          text not null,           -- 'heygen' | 'higgsfield'
  provider_avatar_id text not null,
  preview_url       text,
  status            text not null default 'pending',  -- pending|training|ready|failed
  source_seconds    integer,
  meta              jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  archived_at       timestamptz
);

create index if not exists avatars_owner_idx on avatars (owner_handle);
create unique index if not exists avatars_owner_active_uniq
  on avatars (owner_handle, provider) where archived_at is null;

alter table avatar_samples
  add constraint avatar_samples_avatar_fk
  foreign key (consumed_avatar_id) references avatars(id) on delete set null;

-- ─── voice_analyses (output of voice_analyzer.py port) ──────────────
create table if not exists voice_analyses (
  id                uuid primary key default gen_random_uuid(),
  owner_handle      text not null,
  source_sample_ids uuid[],
  transcript_chars  integer,
  profile           jsonb not null,          -- structured brand-voice profile
  model             text not null,
  cost_usd          numeric(10,4),
  input_tokens      integer,
  output_tokens     integer,
  elapsed_ms        integer,
  created_at        timestamptz not null default now()
);

create index if not exists voice_analyses_owner_idx
  on voice_analyses (owner_handle, created_at desc);
