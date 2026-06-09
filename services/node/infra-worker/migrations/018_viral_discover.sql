-- ============================================================
-- AI Command Center · Migration 018 · Viral Discover
-- ============================================================
-- Ежедневный «парсер залетевших постов» для твоей ниши:
-- handler raz в день скрейпит конкурентов + хэштеги через Apify,
-- ранжирует посты по velocity (views/h, eng/h), прогоняет топ-10
-- (5 reels + 5 carousels) через Claude с описанием ниши клиента,
-- шлёт результат файлом deliverable'а в TG.
--
-- Применяется вручную:
--   docker exec -i aisales-postgres psql -U aisales -d aisales \
--     < 018_viral_discover.sql
-- ============================================================

-- ───────────────────────────────────────────────────────────
-- viral_discover_configs — настройки парсинга на юзера
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS viral_discover_configs (
  user_id              UUID PRIMARY KEY REFERENCES platform_users(id) ON DELETE CASCADE,
  tg_chat_id           BIGINT,                       -- куда слать (override: иначе берём platform_users.tg_chat_id)
  niche_description    TEXT,                          -- "коуч по продажам в B2B, аудитория — собственники малого бизнеса"
  language             VARCHAR(8)   NOT NULL DEFAULT 'ru',
  competitors          TEXT[]       NOT NULL DEFAULT '{}',  -- ['@expert_one', '@expert_two']
  hashtags             TEXT[]       NOT NULL DEFAULT '{}',  -- ['salescoaching', 'b2bsales']
  enabled              BOOLEAN      NOT NULL DEFAULT TRUE,
  posted_within_days   INT          NOT NULL DEFAULT 7,
  reels_count          INT          NOT NULL DEFAULT 5,
  carousels_count      INT          NOT NULL DEFAULT 5,
  per_target_limit     INT          NOT NULL DEFAULT 25,    -- сколько постов брать с каждого источника
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION trg_viral_discover_configs_touch()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS viral_discover_configs_touch ON viral_discover_configs;
CREATE TRIGGER viral_discover_configs_touch
  BEFORE UPDATE ON viral_discover_configs
  FOR EACH ROW EXECUTE FUNCTION trg_viral_discover_configs_touch();

-- ───────────────────────────────────────────────────────────
-- viral_discover_runs — история запусков и результатов
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS viral_discover_runs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES platform_users(id) ON DELETE CASCADE,
  tg_chat_id      BIGINT,
  ran_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  reels           JSONB        NOT NULL DEFAULT '[]'::jsonb,
  carousels       JSONB        NOT NULL DEFAULT '[]'::jsonb,
  posts_scanned   INTEGER,
  claude_summary  TEXT,
  deliverable_id  UUID,
  tg_message_id   BIGINT,
  last_error      TEXT
);
CREATE INDEX IF NOT EXISTS idx_viral_discover_runs_user
  ON viral_discover_runs(user_id, ran_at DESC);

GRANT SELECT ON viral_discover_configs TO claude_ro;
GRANT SELECT ON viral_discover_runs    TO claude_ro;

-- ───────────────────────────────────────────────────────────
-- schedule_rule — раз в день в 05:00 UTC (08:00 МСК)
-- system_wide: handler сам выбирает юзеров с включённым конфигом.
-- ───────────────────────────────────────────────────────────
INSERT INTO schedule_rules (kind, cron_expr, user_filter, payload_template, enabled)
SELECT 'viral_discover',
       '0 5 * * *',
       '{"system_wide": true}'::jsonb,
       '{}'::jsonb,
       TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM schedule_rules WHERE kind = 'viral_discover'
);
