-- ============================================================
-- AI Command Center · Migration 019 · Viral Discover Onboarding
-- ============================================================
-- Расширяет viral_discover_configs для guided-wizard'а
-- в отдельном bot'е @your_parser_bot:
--   • onboarding_stage — текущий шаг wizard'а после /start
--   • paused_until      — пауза по команде /pause
--   • bot               — какой бот доставляет результаты
--                         ('office' | 'parser') — по умолчанию parser
--
-- Применяется вручную:
--   docker exec -i aisales-postgres psql -U aisales -d aisales \
--     < 019_viral_discover_onboarding.sql
-- ============================================================

ALTER TABLE viral_discover_configs
  ADD COLUMN IF NOT EXISTS onboarding_stage VARCHAR(32) NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS paused_until     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bot              VARCHAR(16) NOT NULL DEFAULT 'parser';

-- CHECK через DO-блок (CHECK добавляется отдельно, чтобы существующие строки прошли)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'viral_discover_configs_stage_chk'
  ) THEN
    ALTER TABLE viral_discover_configs
      ADD CONSTRAINT viral_discover_configs_stage_chk
      CHECK (onboarding_stage IN ('new','ask_niche','ask_competitors','ask_hashtags','confirm','ready'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'viral_discover_configs_bot_chk'
  ) THEN
    ALTER TABLE viral_discover_configs
      ADD CONSTRAINT viral_discover_configs_bot_chk
      CHECK (bot IN ('office','parser'));
  END IF;
END $$;

-- Все существующие конфиги (если есть) — уже настроенные office-юзеры.
UPDATE viral_discover_configs
   SET onboarding_stage = 'ready', bot = 'office'
 WHERE onboarding_stage = 'ready' AND bot = 'parser';
-- ↑ no-op для пустой таблицы; страховка для случая ручной правки defaults.
