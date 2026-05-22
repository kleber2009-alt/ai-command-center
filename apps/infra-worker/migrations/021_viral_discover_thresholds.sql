-- ============================================================
-- AI Command Center · Migration 021 · Viral Discover Thresholds
-- ============================================================
-- Абсолютные пороги для отбора «жирного» контента в нише:
--   • min_plays    — нижняя граница просмотров (для рилсов)
--   • min_likes    — нижняя граница лайков (proxy для репостов —
--                    Instagram больше не отдаёт share count публично)
--   • min_comments — нижняя граница комментариев
--
-- Применяется в handler'е ДО classify: если пост не достигает всех
-- трёх порогов — он отброшен. Юзер регулирует через /thresholds в
-- парсер-боте.
--
-- Применяется вручную:
--   docker exec -i aisales-postgres psql -U aisales -d aisales \
--     < 021_viral_discover_thresholds.sql
-- ============================================================

ALTER TABLE viral_discover_configs
  ADD COLUMN IF NOT EXISTS min_plays    INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_likes    INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_comments INT NOT NULL DEFAULT 0;

-- По запросу пользователя (2026-05-21): применить пороги 100K/1K/500
-- ко всем существующим конфигам (сейчас это один юзер с нишей «Нейросети»).
UPDATE viral_discover_configs
   SET min_plays    = 100000,
       min_likes    = 1000,
       min_comments = 500
 WHERE min_plays = 0 AND min_likes = 0 AND min_comments = 0;
