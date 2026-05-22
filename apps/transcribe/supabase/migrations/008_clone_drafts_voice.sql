-- ============================================================
-- transcribe · Migration 008 · clone_drafts.voice_id
-- ============================================================
-- Цель: /clone теперь спрашивает не только фото-аватар, но и голос
-- (по аналогии с фото-меню — список обученных + «новый» + дефолтный).
-- Выбранный голос фиксируется в draft до момента dispatch.
--
-- voice_id хранит ElevenLabs voice_id из clone_user_voices.eleven_voice_id
-- (отдельная таблица в БД `aisales`). NULL = использовать HEYGEN дефолт
-- (env HEYGEN_DEFAULT_VOICE_ID).
--
-- DB: aio (infra-postgres-1).
-- Applied via:
--   docker exec -i infra-postgres-1 psql -U aio -d aio \
--     < apps/transcribe/supabase/migrations/008_clone_drafts_voice.sql
-- ============================================================

ALTER TABLE clone_drafts
  ADD COLUMN IF NOT EXISTS voice_id TEXT;

COMMENT ON COLUMN clone_drafts.voice_id IS
  'ElevenLabs voice_id chosen for /clone before dispatch. NULL = HeyGen default voice.';
