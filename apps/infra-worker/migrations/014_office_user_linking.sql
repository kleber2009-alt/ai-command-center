-- ============================================================
-- AI Command Center · Migration 014 · Office user linking
-- ============================================================
-- Назначение: связать platform_users с Telegram, чтобы scheduler
-- мог рассылать утренние планёрки без ручных INSERT в scheduled_jobs.
-- Также фиксирует пост-013 hotfix (deliverables.user_id NULLABLE)
-- в виде идемпотентного DDL.
--
-- Применяется вручную:
--   docker exec -i aisales-postgres psql -U aisales -d aisales \
--     < 014_office_user_linking.sql
-- ============================================================

-- ───────────────────────────────────────────────────────────
-- platform_users.tg_chat_id — линковка Telegram → product user
-- ───────────────────────────────────────────────────────────
ALTER TABLE platform_users
  ADD COLUMN IF NOT EXISTS tg_chat_id BIGINT;

-- UNIQUE через partial index (NULL'ы не считаются конфликтом)
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_users_tg_chat_id
  ON platform_users (tg_chat_id) WHERE tg_chat_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_platform_users_tg_present
  ON platform_users (signed_up_at DESC) WHERE tg_chat_id IS NOT NULL;

-- ───────────────────────────────────────────────────────────
-- Hotfix-as-migration: deliverables.user_id NULLABLE
-- (applied live during 013 debugging — re-state here so re-runs
-- of the schema arrive at the same state)
-- ───────────────────────────────────────────────────────────
ALTER TABLE deliverables ALTER COLUMN user_id DROP NOT NULL;

-- ───────────────────────────────────────────────────────────
-- Seed: первый реальный пользователь — Илья (фаундер)
-- email отделён от demo_user_*@example.com pattern; tg_chat_id
-- известен. Идемпотентно через ON CONFLICT (email).
-- ───────────────────────────────────────────────────────────
INSERT INTO platform_users (email, name, tg_chat_id)
VALUES ('ilia.paliy@icloud.com', 'Илья', 1280515130)
ON CONFLICT (email) DO UPDATE SET tg_chat_id = EXCLUDED.tg_chat_id;

-- ───────────────────────────────────────────────────────────
-- claude_ro grants — новый столбец автоматически наследует
-- existing GRANT SELECT, но на всякий случай переподтверждаем
-- ───────────────────────────────────────────────────────────
GRANT SELECT ON platform_users TO claude_ro;
