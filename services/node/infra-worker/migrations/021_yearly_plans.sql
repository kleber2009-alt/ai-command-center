-- ============================================================
-- AI Command Center · Migration 021 · Yearly billing plans
-- ============================================================
-- Landing pricing.html имеет toggle Помесячно/Годовой и заявляет
-- скидку «-2 мес» при оплате за год. До этого момента билинг
-- работал только месячно (30 дней). Эта миграция добавляет:
--   · plan_prices.duration_days — продолжительность одной подписки
--   · yearly слаги: pro_year, team_year, builder_year, architect_year
--   · CHECK constraint расширяется на новые слаги
--
-- billing.js должен теперь брать продление из plan_prices.duration_days
-- вместо хардкода '30 days'.
--
-- Цены синхронизированы с landing:
--   pro_year       19 900 ₽ ≈  1000 ⭐ (10 мес × 100, скидка 2 мес)
--   team_year      49 900 ₽ ≈  2500 ⭐ (10 мес × 250)
--   builder_year   59 000 ₽ ≈  3000 ⭐ (10 мес × 300)
--   architect_year 149 000 ₽ ≈ 7500 ⭐ (10 мес × 750)
--
-- Applied via:
--   docker exec -i aisales-postgres psql -U aisales -d aisales \
--     < 021_yearly_plans.sql
-- ============================================================

ALTER TABLE plan_prices
  ADD COLUMN IF NOT EXISTS duration_days INTEGER NOT NULL DEFAULT 30;

-- Yearly slugs
INSERT INTO plan_prices (plan, price_stars, price_rub, display_name, duration_days, active)
VALUES
  ('pro_year',       1000, 19900,  'Pro · 12 месяцев (экономия 3 980 ₽)',        365, TRUE),
  ('team_year',      2500, 49900,  'Team · 12 месяцев (экономия 9 980 ₽)',       365, TRUE),
  ('builder_year',   3000, 59000,  'Builder · 12 месяцев (экономия 11 800 ₽)',   365, TRUE),
  ('architect_year', 7500, 149000, 'Architect · 12 месяцев (экономия 29 800 ₽)', 365, TRUE)
ON CONFLICT (plan) DO UPDATE
  SET price_stars   = EXCLUDED.price_stars,
      price_rub     = EXCLUDED.price_rub,
      display_name  = EXCLUDED.display_name,
      duration_days = EXCLUDED.duration_days,
      active        = TRUE,
      updated_at    = NOW();

-- Расширяем CHECK constraint на все слаги (monthly + yearly).
ALTER TABLE platform_subscriptions
  DROP CONSTRAINT IF EXISTS platform_subscriptions_plan_check;

ALTER TABLE platform_subscriptions
  ADD CONSTRAINT platform_subscriptions_plan_check
  CHECK (plan IN (
    'pro', 'team', 'builder', 'architect',
    'pro_year', 'team_year', 'builder_year', 'architect_year'
  ));
