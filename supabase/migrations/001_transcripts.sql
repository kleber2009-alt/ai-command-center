-- Run this once in Supabase SQL Editor
-- Stores transcripts produced by /api/transcribe

create extension if not exists pgcrypto;

create table if not exists transcripts (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  url           text not null,
  title         text,
  source        text,          -- 'youtube' | 'deepgram'
  language      text,           -- detected or requested language code
  duration      numeric,        -- seconds
  transcript    text not null,
  paragraphs    jsonb,          -- [{ text, start, end }]
  summary       text,
  bullets       jsonb,          -- string[]
  translation   jsonb           -- { lang: 'en'|'ru', text: string }
);

create index if not exists transcripts_created_at_idx on transcripts (created_at desc);
