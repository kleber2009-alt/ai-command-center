-- ============================================================
-- AI Command Center · Migration 017 · plan_prices.team slug
-- ============================================================
-- Landing pricing.html объявляет 4 тарифа: Free / Pro / Team /
-- Enterprise. Free и Enterprise — без Stars (Free=demo,
-- Enterprise=contactSales). Pro и Team — оплачиваются.
-- plan_prices пока имеет 'pro'; 'builder'/'architect' оставлены
-- как внутренние плановые тарифы (более полное предложение).
-- Чтобы кнопка Team на landing'е работала end-to-end, добавляем
-- slug 'team' с ценой landing'а.
--
-- Stars price = 250 (≈ landing'овые 4990₽ по соотношению pro 100⭐/1990₽).
--
-- Applied via:
--   docker exec -i aisales-postgres psql -U aisales -d aisales \
--     < 017_plan_team.sql
-- ============================================================

INSERT INTO plan_prices (plan, price_stars, price_rub, display_name, active)
VALUES ('team', 250, 4990, 'Team · 5 мест · 10 агентов', TRUE)
ON CONFLICT (plan) DO UPDATE
  SET price_stars  = EXCLUDED.price_stars,
      price_rub    = EXCLUDED.price_rub,
      display_name = EXCLUDED.display_name,
      active       = TRUE,
      updated_at   = NOW();

-- platform_subscriptions.plan имеет CHECK constraint — расширяем allowed-set.
ALTER TABLE platform_subscriptions
  DROP CONSTRAINT IF EXISTS platform_subscriptions_plan_check;

ALTER TABLE platform_subscriptions
  ADD CONSTRAINT platform_subscriptions_plan_check
  CHECK (plan IN ('pro', 'team', 'builder', 'architect'));
