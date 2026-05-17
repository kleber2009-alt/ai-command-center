-- ============================================================
-- AI Command Center · Migration 008 · Revenue goals
-- ============================================================
-- Хранит месячные цели по выручке. Убирает хардкод
-- {achieved: 7200000, monthGoal: 10000000, dailyNeeded: 140000,
--  goalPercent: 72} из src/app/api/metrics/route.ts.
--
-- Колонка currency_rate — курс доллара к выбранной валюте на момент
-- постановки цели. MRR в БД хранится в долларах, цели — в рублях
-- (потому что бизнес-планирование в рублях), поэтому нужен курс
-- для конверсии.
--
-- Один ряд на (month, currency). Уникальность гарантирует, что цель
-- одной валюты не задублируется.

CREATE TABLE IF NOT EXISTS revenue_goals (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  month         DATE         NOT NULL,   -- первое число месяца, например 2026-05-01
  currency      VARCHAR(3)   NOT NULL DEFAULT 'RUB',
  target        BIGINT       NOT NULL,   -- цель в указанной валюте, без копеек
  currency_rate NUMERIC(10,4) NOT NULL DEFAULT 1,  -- сколько единиц `currency` за $1
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(month, currency)
);

CREATE INDEX IF NOT EXISTS idx_revenue_goals_month
  ON revenue_goals(month DESC);

-- Seed: цель на текущий месяц (₽10M при курсе 90 ₽/$)
INSERT INTO revenue_goals (month, currency, target, currency_rate)
VALUES (date_trunc('month', NOW())::date, 'RUB', 10000000, 90)
ON CONFLICT (month, currency) DO NOTHING;
