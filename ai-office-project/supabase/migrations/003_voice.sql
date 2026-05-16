-- ═══════════════════════════════════════════════════════════════════
-- 003_voice.sql — Phase 5 (voice clones)
-- ───────────────────────────────────────────────────────────────────
-- Запускать вручную в Supabase SQL Editor.
-- Требует расширения pgcrypto (есть по умолчанию в Supabase).
-- ═══════════════════════════════════════════════════════════════════

-- ── Таблица: один голос на одного владельца ──
-- owner_handle: Telegram-юзернейм или email — пока без auth (см. PHASE_5.md)
create table if not exists public.voices (
  id               uuid primary key default gen_random_uuid(),
  owner_handle     text not null,                    -- @username или email
  display_name     text,                             -- "Илья" / "Мой голос"
  provider         text not null default 'elevenlabs',
  provider_voice_id text not null,                   -- voice_id от провайдера
  sample_seconds   int,                              -- длительность загруженного аудио
  created_at       timestamptz not null default now(),
  archived_at      timestamptz
);

create unique index if not exists voices_owner_active_uniq
  on public.voices (owner_handle)
  where archived_at is null;

create index if not exists voices_owner_idx on public.voices (owner_handle);

-- ── Лог генераций ──
create table if not exists public.voice_generations (
  id               uuid primary key default gen_random_uuid(),
  voice_id         uuid references public.voices(id) on delete set null,
  owner_handle     text not null,                    -- денормализовано для быстрых выборок
  text             text not null,
  audio_path       text,                             -- путь в Storage bucket voice-notes/
  audio_url        text,                             -- public URL (signed если приватный bucket)
  duration_ms      int,
  status           text not null default 'generated',-- generated|approved|sent|rejected|failed
  source           text,                             -- 'persona-train' | 'tg-bot' | 'api'
  meta             jsonb default '{}'::jsonb,        -- model_id, voice_settings, error и т.д.
  created_at       timestamptz not null default now()
);

create index if not exists voice_generations_owner_idx
  on public.voice_generations (owner_handle, created_at desc);

-- ── RLS ──
alter table public.voices enable row level security;
alter table public.voice_generations enable row level security;

-- Anon может ЧИТАТЬ свои голоса (по owner_handle через REST-фильтр).
-- Это безопасно: voice_id не секрет, использовать его всё равно можно
-- только через серверный proxy с ELEVENLABS_API_KEY.
drop policy if exists voices_anon_select on public.voices;
create policy voices_anon_select on public.voices
  for select using (true);

-- Anon НЕ должен INSERT/UPDATE/DELETE напрямую — только через
-- Netlify Functions с SUPABASE_SERVICE_KEY (bypass RLS).
-- Политик для writes нет → anon заблокирован по умолчанию.

drop policy if exists voice_generations_anon_select on public.voice_generations;
create policy voice_generations_anon_select on public.voice_generations
  for select using (true);

-- ── Storage bucket: voice-notes ──
-- Создаётся через Dashboard → Storage → New bucket (public). Имя: voice-notes
-- ИЛИ через SQL ниже (требует прав на storage.buckets):
insert into storage.buckets (id, name, public)
values ('voice-notes', 'voice-notes', true)
on conflict (id) do nothing;

-- Storage policy: public read для voice-notes (для preview в браузере).
-- Writes только через service-key.
drop policy if exists "voice-notes public read" on storage.objects;
create policy "voice-notes public read"
  on storage.objects for select
  using (bucket_id = 'voice-notes');

-- ───────────────────────────────────────────────────────────────────
-- Откат (не запускай если не уверен):
--   drop table if exists public.voice_generations;
--   drop table if exists public.voices;
--   delete from storage.buckets where id = 'voice-notes';
-- ═══════════════════════════════════════════════════════════════════
