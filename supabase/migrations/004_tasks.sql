-- Project task board for /admin
-- Run once in Supabase SQL Editor.

create extension if not exists pgcrypto;

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
  position     int not null default 0
);

create index if not exists tasks_status_position_idx on tasks (status, position);
create index if not exists tasks_stage_idx on tasks (stage);

-- Auto-bump updated_at on row changes.
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
