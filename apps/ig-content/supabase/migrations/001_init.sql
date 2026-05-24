-- Instagram Serial Content Automation System — initial schema
-- All tables are scoped to the authenticated user via row-level security.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- users — mirror of auth.users, populated by trigger on signup
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  name       text,
  created_at timestamptz not null default now()
);

-- Keep public.users in sync with auth.users.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- campaigns
-- ---------------------------------------------------------------------------
create table if not exists public.campaigns (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  title           text not null,
  topic           text,
  goal            text,
  duration        integer not null default 30,
  target_audience text,
  offer           text,
  lead_magnet     text,
  tone_of_voice   text,
  cta             text,
  platform        text default 'instagram',
  formats         jsonb default '["reels","carousel"]'::jsonb,
  content_pillars jsonb default '[]'::jsonb,
  status          text not null default 'draft',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists campaigns_user_id_idx on public.campaigns(user_id);

-- ---------------------------------------------------------------------------
-- content_days
-- ---------------------------------------------------------------------------
create table if not exists public.content_days (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references public.campaigns(id) on delete cascade,
  day_number    integer not null,
  date          date,
  topic         text,
  main_hook     text,
  daily_meaning text,
  cta           text,
  reels_idea    text,
  carousel_idea text,
  status        text not null default 'idea',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (campaign_id, day_number)
);
create index if not exists content_days_campaign_id_idx on public.content_days(campaign_id);

-- ---------------------------------------------------------------------------
-- reels
-- ---------------------------------------------------------------------------
create table if not exists public.reels (
  id              uuid primary key default gen_random_uuid(),
  content_day_id  uuid not null references public.content_days(id) on delete cascade,
  title           text,
  hooks           jsonb default '[]'::jsonb,
  main_script     text,
  video_structure jsonb default '[]'::jsonb,
  b_roll_ideas    jsonb default '[]'::jsonb,
  caption         text,
  cta             text,
  hashtags        jsonb default '[]'::jsonb,
  visual_brief    text,
  status          text not null default 'generated',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists reels_content_day_id_idx on public.reels(content_day_id);

-- ---------------------------------------------------------------------------
-- carousels
-- ---------------------------------------------------------------------------
create table if not exists public.carousels (
  id             uuid primary key default gen_random_uuid(),
  content_day_id uuid not null references public.content_days(id) on delete cascade,
  cover_title    text,
  slides         jsonb default '[]'::jsonb,
  caption        text,
  cta            text,
  design_prompt  text,
  hashtags       jsonb default '[]'::jsonb,
  status         text not null default 'generated',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists carousels_content_day_id_idx on public.carousels(content_day_id);

-- ---------------------------------------------------------------------------
-- metrics
-- ---------------------------------------------------------------------------
create table if not exists public.metrics (
  id             uuid primary key default gen_random_uuid(),
  content_day_id uuid not null references public.content_days(id) on delete cascade,
  content_type   text not null,
  views          integer default 0,
  likes          integer default 0,
  comments       integer default 0,
  saves          integer default 0,
  shares         integer default 0,
  follows        integer default 0,
  leads          integer default 0,
  published_at   timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists metrics_content_day_id_idx on public.metrics(content_day_id);

-- ---------------------------------------------------------------------------
-- ai_outputs — audit log of every agent invocation
-- ---------------------------------------------------------------------------
create table if not exists public.ai_outputs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade,
  campaign_id    uuid references public.campaigns(id) on delete cascade,
  content_day_id uuid references public.content_days(id) on delete cascade,
  agent_type     text not null,
  prompt         text,
  response       jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists ai_outputs_user_id_idx on public.ai_outputs(user_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['campaigns','content_days','reels','carousels'] loop
    execute format(
      'drop trigger if exists touch_%1$s on public.%1$s;
       create trigger touch_%1$s before update on public.%1$s
       for each row execute function public.touch_updated_at();', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.users        enable row level security;
alter table public.campaigns    enable row level security;
alter table public.content_days enable row level security;
alter table public.reels        enable row level security;
alter table public.carousels    enable row level security;
alter table public.metrics      enable row level security;
alter table public.ai_outputs   enable row level security;

-- users: a row is visible only to itself
drop policy if exists users_self on public.users;
create policy users_self on public.users
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- campaigns: owned directly by the user
drop policy if exists campaigns_owner on public.campaigns;
create policy campaigns_owner on public.campaigns
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- content_days: owned through the parent campaign
drop policy if exists content_days_owner on public.content_days;
create policy content_days_owner on public.content_days
  for all using (
    exists (select 1 from public.campaigns c
            where c.id = content_days.campaign_id and c.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.campaigns c
            where c.id = content_days.campaign_id and c.user_id = auth.uid())
  );

-- helper predicate for day-scoped tables
-- reels
drop policy if exists reels_owner on public.reels;
create policy reels_owner on public.reels
  for all using (
    exists (select 1 from public.content_days d
              join public.campaigns c on c.id = d.campaign_id
            where d.id = reels.content_day_id and c.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.content_days d
              join public.campaigns c on c.id = d.campaign_id
            where d.id = reels.content_day_id and c.user_id = auth.uid())
  );

-- carousels
drop policy if exists carousels_owner on public.carousels;
create policy carousels_owner on public.carousels
  for all using (
    exists (select 1 from public.content_days d
              join public.campaigns c on c.id = d.campaign_id
            where d.id = carousels.content_day_id and c.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.content_days d
              join public.campaigns c on c.id = d.campaign_id
            where d.id = carousels.content_day_id and c.user_id = auth.uid())
  );

-- metrics
drop policy if exists metrics_owner on public.metrics;
create policy metrics_owner on public.metrics
  for all using (
    exists (select 1 from public.content_days d
              join public.campaigns c on c.id = d.campaign_id
            where d.id = metrics.content_day_id and c.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.content_days d
              join public.campaigns c on c.id = d.campaign_id
            where d.id = metrics.content_day_id and c.user_id = auth.uid())
  );

-- ai_outputs
drop policy if exists ai_outputs_owner on public.ai_outputs;
create policy ai_outputs_owner on public.ai_outputs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
