-- Single bootstrap script for self-hosted Postgres.
-- Loaded automatically by the official postgres docker image on first
-- start (any *.sql in /docker-entrypoint-initdb.d/ is executed once).
-- For manual runs: psql "$DATABASE_URL" -f db/init.sql

create extension if not exists pgcrypto;
create extension if not exists vector;

-- ============================================================
-- transcripts: /transcribe history + cached generations
-- ============================================================
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

-- ============================================================
-- tasks: kanban board at /admin
-- ============================================================
create table if not exists tasks (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  title        text not null,
  description  text,
  status       text not null default 'backlog'
               check (status in ('backlog', 'in_progress', 'blocked', 'done')),
  priority     text not null default 'medium'
               check (priority in ('low', 'medium', 'high')),
  stage        text,
  project      text not null default 'general',
  position     int not null default 0
);

create index if not exists tasks_status_position_idx on tasks (status, position);
create index if not exists tasks_stage_idx on tasks (stage);
create index if not exists tasks_project_idx on tasks (project);

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

-- ============================================================
-- me: second-brain profile + document library + RAG chunks
-- ============================================================
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

create table if not exists me_documents (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  source_type   text not null check (source_type in ('paste', 'file', 'transcript')),
  source_meta   jsonb default '{}'::jsonb,
  original_text text not null,
  char_count    int not null default 0,
  chunk_count   int not null default 0,
  created_at    timestamptz default now()
);

create index if not exists me_documents_created_at_idx
  on me_documents (created_at desc);

create table if not exists me_chunks (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references me_documents(id) on delete cascade,
  chunk_index   int not null,
  content       text not null,
  embedding     vector(1536) not null,
  created_at    timestamptz default now()
);

create index if not exists me_chunks_document_id_idx
  on me_chunks (document_id);

create index if not exists me_chunks_embedding_idx on me_chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);
