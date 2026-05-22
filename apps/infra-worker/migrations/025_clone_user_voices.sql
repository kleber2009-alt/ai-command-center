-- ============================================================
-- AI Command Center · Migration 025 · clone_user_voices
-- ============================================================
-- Цель: разрешить клиентам обучать свой голос через /voice в
-- transcribe-боте и использовать его в /clone, не выжигая
-- HeyGen-овский voice provider quota (с одним общим голосом
-- на всех клиентов «Voice provider quota exceeded» приходит
-- регулярно — см. pipeline e2042e44-… от 2026-05-22).
--
-- Стратегия:
--   • owner (tg_chat_id = OWNER_TELEGRAM_ID) — `voice.type = 'text'`
--     + HeyGen voice_id `93d1ab8db88b479ca452e31897389118` (fast path).
--   • клиент с обученным голосом — ElevenLabs TTS(script) → mp3 →
--     HeyGen asset upload → `voice.type = 'audio'`, audio_asset_id.
--   • клиент без голоса — текущий env-fallback (HEYGEN_DEFAULT_VOICE_ID).
--
-- Applied via:
--   docker exec -i aisales-postgres psql -U aisales -d aisales \
--     < apps/infra-worker/migrations/025_clone_user_voices.sql
-- ============================================================

-- ── 1. Сами обученные голоса клиентов /clone ───────────────────
-- telegram_user_id (не platform_users.id), потому что /clone-юзер
-- может не быть зарегистрирован в AI Office. Один юзер может
-- переобучить голос — берём самый свежий (ORDER BY created_at DESC).
CREATE TABLE IF NOT EXISTS clone_user_voices (
  id                 SERIAL PRIMARY KEY,
  telegram_user_id   BIGINT       NOT NULL,
  name               TEXT         NOT NULL,
  eleven_voice_id    TEXT         NOT NULL,
  provider           TEXT         NOT NULL DEFAULT 'elevenlabs',
  source_file_id     TEXT,            -- TG file_id исходного сэмпла (для отладки)
  sample_bytes       INT,             -- размер сэмпла, для аналитики «насколько длинный»
  status             TEXT         NOT NULL DEFAULT 'ready'
                                  CHECK (status IN ('ready', 'failed')),
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS clone_user_voices_tg_idx
  ON clone_user_voices(telegram_user_id, created_at DESC);

-- ── 2. eleven_voice_id на pipeline ─────────────────────────────
-- Резолвим один раз в dispatch (а не в каждом тике воркера), чтобы
-- pipeline видел тот голос, который был у юзера на момент /clone.
-- Если клиент позже переобучил — старые pipelines продолжат играть
-- старым голосом, новые подхватят новый.
ALTER TABLE viral_pipelines
  ADD COLUMN IF NOT EXISTS eleven_voice_id TEXT;

-- Замечание: state-machine /clone и /voice (clone_drafts.state ∈
-- {awaiting_photo_choice, awaiting_photo, awaiting_name,
-- awaiting_voice_audio}) живёт в БД `aio` (infra-postgres-1) у
-- transcribe-бота. CHECK constraint там не стоит — новое значение
-- `awaiting_voice_audio` появится автоматически при первом INSERT.
