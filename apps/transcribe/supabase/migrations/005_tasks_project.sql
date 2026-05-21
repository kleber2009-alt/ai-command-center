-- Add `project` column to tasks for monorepo project boards.
-- Run once in Supabase SQL Editor.

alter table tasks
  add column if not exists project text not null default 'general';

create index if not exists tasks_project_idx on tasks (project);
