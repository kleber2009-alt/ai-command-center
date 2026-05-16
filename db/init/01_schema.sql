-- ═══════════════════════════════════════════════════════════════════
-- 01_schema.sql — единая стартовая схема для self-hosted Postgres.
-- ───────────────────────────────────────────────────────────────────
-- Применяется автоматически при первом старте контейнера postgres
-- (см. docker-compose.yml: вольюм db/init → /docker-entrypoint-initdb.d).
--
-- Объединяет миграции, которые раньше жили в supabase/migrations/:
--   001_transcripts.sql
--   002_generations.sql (alter)
--   003_me.sql           (RAG: profile + documents + chunks + RPC)
--   003_tasks.sql
--
-- Плюс таблицы для ai-office-project voice-функций:
--   voices, voice_generations
--
-- Идемпотентно: можно перезапустить, ничего не сломает.
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;
create extension if not exists vector;

-- ── transcripts ──────────────────────────────────────────────────────
create table if not exists transcripts (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  url          text not null,
  title        text,
  source       text,           -- 'youtube' | 'deepgram' | 'ytdlp+deepgram'
  language     text,
  duration     numeric,
  transcript   text not null,
  paragraphs   jsonb,           -- [{ text, start, end }]
  summary      text,
  bullets      jsonb,           -- string[]
  translation  jsonb,           -- { lang: 'en'|'ru', text: string }
  generations  jsonb            -- { carousel?, 'reels-new'?, 'reels-remix'?, 'tg-post'? }
);

create index if not exists transcripts_created_at_idx on transcripts (created_at desc);

-- ── tasks (project board /admin) ─────────────────────────────────────
create table if not exists tasks (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  title       text not null,
  description text,
  status      text not null default 'backlog'
              check (status in ('backlog', 'in_progress', 'blocked', 'done')),
  priority    text not null default 'medium'
              check (priority in ('low', 'medium', 'high')),
  stage       text,
  position    int  not null default 0
);

create index if not exists tasks_status_position_idx on tasks (status, position);
create index if not exists tasks_stage_idx on tasks (stage);

create or replace function tasks_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists tasks_set_updated_at_trigger on tasks;
create trigger tasks_set_updated_at_trigger
  before update on tasks
  for each row execute function tasks_set_updated_at();

-- ── me_profile (singleton) ───────────────────────────────────────────
create table if not exists me_profile (
  id          text primary key default 'singleton',
  bio         text default '',
  projects    text default '',
  academy     text default '',
  social      text default '',
  voice       text default '',
  custom      jsonb default '{}'::jsonb,
  updated_at  timestamptz default now()
);

insert into me_profile (id) values ('singleton')
on conflict (id) do nothing;

-- ── me_documents + me_chunks (RAG) ───────────────────────────────────
create table if not exists me_documents (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  source_type   text not null check (source_type in ('paste', 'file', 'transcript')),
  source_meta   jsonb default '{}'::jsonb,
  original_text text not null,
  char_count    int  not null default 0,
  chunk_count   int  not null default 0,
  created_at    timestamptz default now()
);

create index if not exists me_documents_created_at_idx on me_documents (created_at desc);

create table if not exists me_chunks (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references me_documents(id) on delete cascade,
  chunk_index int  not null,
  content     text not null,
  embedding   vector(1536) not null,
  created_at  timestamptz default now()
);

create index if not exists me_chunks_document_id_idx on me_chunks (document_id);
create index if not exists me_chunks_embedding_idx on me_chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create or replace function match_me_chunks(
  query_embedding vector(1536),
  match_count int default 8
)
returns table (
  id uuid,
  document_id uuid,
  document_title text,
  chunk_index int,
  content text,
  similarity float
)
language sql stable
as $$
  select
    c.id,
    c.document_id,
    d.title as document_title,
    c.chunk_index,
    c.content,
    1 - (c.embedding <=> query_embedding) as similarity
  from me_chunks c
  join me_documents d on d.id = c.document_id
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- ── voices + voice_generations (ai-office voice-clone / voice-generate) ──
create table if not exists voices (
  id                uuid primary key default gen_random_uuid(),
  owner_handle      text not null,
  display_name      text not null,
  provider          text not null default 'elevenlabs',
  provider_voice_id text not null,
  sample_seconds    int,
  created_at        timestamptz not null default now(),
  archived_at       timestamptz
);

create index if not exists voices_owner_active_idx
  on voices (owner_handle) where archived_at is null;
create index if not exists voices_owner_archived_idx
  on voices (owner_handle, archived_at desc);

create table if not exists voice_generations (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  voice_id     uuid references voices(id) on delete set null,
  owner_handle text not null,
  text         text not null,
  audio_path   text,                  -- путь относительно VOICE_NOTES_DIR
  audio_url    text,                  -- публичный URL (через nginx или /files/...)
  status       text not null default 'generated',
  source       text,
  meta         jsonb default '{}'::jsonb
);

create index if not exists voice_generations_owner_idx
  on voice_generations (owner_handle, created_at desc);
