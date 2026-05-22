-- ═══════════════════════════════════════════════════════════════════
-- 005_binding_tokens.sql — Phase 5 · Commit 3 (handle verification)
-- ───────────────────────────────────────────────────────────────────
-- One-time tokens that prove a Telegram chat owns a given handle.
-- Issued by /api/voice-binding-token (after voice creation in
-- /persona-train), consumed by /api/tg-voice-webhook on /start.
--
-- Run AFTER 003_voice.sql + 004_voice_bot.sql.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.voice_binding_tokens (
  token            text primary key,
  owner_handle     text not null,
  voice_id         uuid references public.voices(id) on delete cascade,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null default (now() + interval '1 hour'),
  used_at          timestamptz,
  used_by_chat_id  bigint
);

create index if not exists voice_binding_tokens_owner_idx
  on public.voice_binding_tokens (owner_handle, created_at desc);
create index if not exists voice_binding_tokens_expires_idx
  on public.voice_binding_tokens (expires_at)
  where used_at is null;

alter table public.voice_binding_tokens enable row level security;

-- Anon никогда не должен видеть токены (это секреты).
-- Никаких политик SELECT для anon → запрещено по умолчанию.
-- Writes — только через service-key (Netlify Functions).

-- ── Auto-cleanup hint ──
-- Опционально: запустить вручную раз в день, чтобы чистить старое:
--   delete from public.voice_binding_tokens
--   where expires_at < now() - interval '7 days';
-- ═══════════════════════════════════════════════════════════════════
