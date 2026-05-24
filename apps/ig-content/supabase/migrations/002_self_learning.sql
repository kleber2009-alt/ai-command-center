-- Self-improving content system — knowledge base, feedback, learnings, logs.
-- Layered on top of 001_init.sql. All tables RLS-scoped to the owner.

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- content_library — knowledge base. Holds the user's own content, competitor
-- references, offers, cases, reviews, prompts and hooks, each embedded for
-- semantic retrieval. Auto-grows: published content is ingested with metrics.
-- ---------------------------------------------------------------------------
create table if not exists public.content_library (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  type              text not null,            -- reels|carousel|post|story|dm|offer|case|review|prompt|reference|hook
  source            text not null default 'own', -- own|competitor|reference
  topic             text,
  hook              text,
  content           text,
  cta               text,
  format            text,
  visual_style      text,
  metrics           jsonb default '{}'::jsonb,
  performance_score numeric not null default 0,
  embedding         vector(1536),
  -- link back to generated content when auto-ingested
  content_day_id    uuid references public.content_days(id) on delete set null,
  content_type      text,                     -- reels|carousel for auto-ingested rows
  created_at        timestamptz not null default now()
);
create index if not exists content_library_user_id_idx on public.content_library(user_id);
create index if not exists content_library_score_idx on public.content_library(user_id, performance_score desc);
-- one auto-ingested row per (day, content_type)
create unique index if not exists content_library_day_type_uniq
  on public.content_library(content_day_id, content_type)
  where content_day_id is not null;
-- approximate-NN index for cosine similarity search
create index if not exists content_library_embedding_idx
  on public.content_library using hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- feedback — user rating of generated content (1..5) + reason tags.
-- ---------------------------------------------------------------------------
create table if not exists public.feedback (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  content_id    uuid,                          -- reels.id or carousels.id
  content_type  text,                          -- reels|carousel
  rating        integer not null check (rating between 1 and 5),
  feedback_tags jsonb default '[]'::jsonb,
  comment       text,
  created_at    timestamptz not null default now()
);
create index if not exists feedback_user_id_idx on public.feedback(user_id);

-- ---------------------------------------------------------------------------
-- agent_learnings — persistent memory: insights the system derives over time.
-- ---------------------------------------------------------------------------
create table if not exists public.agent_learnings (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.users(id) on delete cascade,
  learning_type      text,                     -- hook|topic|format|cta|style|timing|general
  insight            text not null,
  source_content_ids jsonb default '[]'::jsonb,
  confidence         numeric not null default 50, -- 0..100
  created_at         timestamptz not null default now()
);
create index if not exists agent_learnings_user_id_idx on public.agent_learnings(user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- generation_logs — full RAG trace of every generation for audit + learning.
-- ---------------------------------------------------------------------------
create table if not exists public.generation_logs (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.users(id) on delete cascade,
  campaign_id        uuid references public.campaigns(id) on delete cascade,
  content_day_id     uuid references public.content_days(id) on delete cascade,
  agent_type         text not null,
  input_context      jsonb,
  retrieved_examples jsonb,
  generated_output   jsonb,
  user_rating        integer,
  final_status       text,
  created_at         timestamptz not null default now()
);
create index if not exists generation_logs_user_id_idx on public.generation_logs(user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- performance score helper (mirrors lib/scoring.ts; usable from SQL jobs)
--   views*0.2 + saves*2 + shares*3 + comments*1.5 + follows*5 + leads*10
-- ---------------------------------------------------------------------------
create or replace function public.calc_performance_score(m jsonb)
returns numeric language sql immutable as $$
  select round(
    coalesce((m->>'views')::numeric,    0) * 0.2 +
    coalesce((m->>'saves')::numeric,    0) * 2   +
    coalesce((m->>'shares')::numeric,   0) * 3   +
    coalesce((m->>'comments')::numeric, 0) * 1.5 +
    coalesce((m->>'follows')::numeric,  0) * 5   +
    coalesce((m->>'leads')::numeric,    0) * 10
  );
$$;

-- ---------------------------------------------------------------------------
-- match_content_library — cosine-similarity top-k over the caller's library.
-- SECURITY INVOKER (default) so RLS restricts rows to the authenticated user.
-- ---------------------------------------------------------------------------
create or replace function public.match_content_library(
  query_embedding vector(1536),
  match_count integer default 15
)
returns table (
  id uuid,
  type text,
  source text,
  topic text,
  hook text,
  content text,
  cta text,
  format text,
  performance_score numeric,
  similarity float
)
language sql stable as $$
  select cl.id, cl.type, cl.source, cl.topic, cl.hook, cl.content, cl.cta,
         cl.format, cl.performance_score,
         1 - (cl.embedding <=> query_embedding) as similarity
  from public.content_library cl
  where cl.embedding is not null
  order by cl.embedding <=> query_embedding
  limit match_count;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.content_library enable row level security;
alter table public.feedback        enable row level security;
alter table public.agent_learnings enable row level security;
alter table public.generation_logs enable row level security;

drop policy if exists content_library_owner on public.content_library;
create policy content_library_owner on public.content_library
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists feedback_owner on public.feedback;
create policy feedback_owner on public.feedback
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists agent_learnings_owner on public.agent_learnings;
create policy agent_learnings_owner on public.agent_learnings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists generation_logs_owner on public.generation_logs;
create policy generation_logs_owner on public.generation_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
