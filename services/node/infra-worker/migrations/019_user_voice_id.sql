-- ============================================================
-- AI Command Center · Migration 018 · platform_users.voice_id
-- ============================================================
-- Закрывает gap #4 customer journey (см. project_customer_journey.md):
-- Day-0 "момент истины" с КЛИЕНТСКИМ голосовым клоном
-- (а не дефолтным Charlotte). Онбординг-шаг 11 записывает 30-60 сек
-- голоса → ElevenLabs Instant Voice Cloning → возвращает voice_id →
-- сохраняем сюда. welcome_voice handler читает user.voice_id и
-- передаёт в renderVoice(text, voice_id).
--
-- Также добавляем voice_pending_link для случая когда юзер записал
-- голос в анкете до того как заплатил (онбординг ≠ платёж по времени).
-- Бридж по email или tg_chat_id, см. handlers/welcome_sequence.
--
-- Applied via:
--   docker exec -i aisales-postgres psql -U aisales -d aisales \
--     < 018_user_voice_id.sql
-- ============================================================

ALTER TABLE platform_users
  ADD COLUMN IF NOT EXISTS voice_id VARCHAR(64);

-- Бридж: голос записан в онбординге до того, как юзер привязан к chat_id.
-- Когда оплата приходит → welcome_sequence лукапит сюда по email или
-- tg_chat_id и копирует voice_id в platform_users.
CREATE TABLE IF NOT EXISTS pending_voice_clones (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       VARCHAR(255),
  tg_chat_id  BIGINT,
  voice_id    VARCHAR(64)  NOT NULL,
  name        VARCHAR(64),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pending_voice_email
  ON pending_voice_clones (email) WHERE email IS NOT NULL AND consumed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pending_voice_chat
  ON pending_voice_clones (tg_chat_id) WHERE tg_chat_id IS NOT NULL AND consumed_at IS NULL;

GRANT SELECT ON pending_voice_clones TO claude_ro;
