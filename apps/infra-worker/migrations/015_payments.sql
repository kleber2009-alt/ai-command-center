-- ============================================================
-- AI Command Center · Migration 015 · Payments via Telegram Stars
-- ============================================================
-- Closes schema gap #1 from pipeline audit: no price/payments
-- table → MRR/ARR uncomputable. Adds:
--   · plan_prices       — Stars + RUB price per plan
--   · payments          — every successful Stars charge
--   · platform_subscriptions extensions (expires_at, payment_id,
--                                         price_stars, last_payment_id)
--
-- Applied via:
--   docker exec -i aisales-postgres psql -U aisales -d aisales \
--     < 015_payments.sql
-- ============================================================

-- ───────────────────────────────────────────────────────────
-- plan_prices — single source of truth for what each plan costs
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plan_prices (
  plan         VARCHAR(32)  PRIMARY KEY,
  price_stars  INTEGER      NOT NULL,        -- amount charged via Telegram Stars
  price_rub    INTEGER      NOT NULL,        -- editorial/display price in roubles
  display_name VARCHAR(64)  NOT NULL,
  active       BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO plan_prices (plan, price_stars, price_rub, display_name)
VALUES
  ('pro',       100, 1990,  'Pro · 5 агентов'),
  ('builder',   300, 5900,  'Builder · 10 агентов · ежедневный артефакт'),
  ('architect', 750, 14900, 'Architect · автономная команда + еженедельный голос')
ON CONFLICT (plan) DO UPDATE
  SET price_stars  = EXCLUDED.price_stars,
      price_rub    = EXCLUDED.price_rub,
      display_name = EXCLUDED.display_name,
      updated_at   = NOW();

-- ───────────────────────────────────────────────────────────
-- payments — every successful Telegram Stars charge
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                      UUID,                       -- nullable: payment may arrive before user_id resolved
  tg_chat_id                   BIGINT       NOT NULL,      -- always known from successful_payment
  plan                         VARCHAR(32)  NOT NULL,
  amount_stars                 INTEGER      NOT NULL,
  currency                     VARCHAR(8)   NOT NULL DEFAULT 'XTR',  -- Telegram Stars currency code
  status                       VARCHAR(16)  NOT NULL DEFAULT 'pending'
                                            CHECK (status IN ('pending','paid','failed','refunded')),
  invoice_payload              VARCHAR(255) NOT NULL,      -- our internal correlation id (UUID)
  tg_payment_charge_id         VARCHAR(255),               -- Telegram's id for the Stars charge
  provider_payment_charge_id   VARCHAR(255),               -- echoed from Telegram
  raw_update                   JSONB,                      -- full successful_payment update for audit
  created_at                   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  paid_at                      TIMESTAMPTZ
);

-- Idempotency: never double-charge from the same TG payment id
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_tg_charge
  ON payments (tg_payment_charge_id) WHERE tg_payment_charge_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_payload
  ON payments (invoice_payload);
CREATE INDEX IF NOT EXISTS idx_payments_user
  ON payments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_status
  ON payments (status, created_at DESC);

-- ───────────────────────────────────────────────────────────
-- platform_subscriptions — extend with expiry + payment linkage
-- ───────────────────────────────────────────────────────────
ALTER TABLE platform_subscriptions
  ADD COLUMN IF NOT EXISTS expires_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_payment_id  UUID,
  ADD COLUMN IF NOT EXISTS price_stars      INTEGER;

CREATE INDEX IF NOT EXISTS idx_platform_subs_expires
  ON platform_subscriptions (expires_at) WHERE status = 'active';

-- ───────────────────────────────────────────────────────────
-- claude_ro grants for new tables
-- ───────────────────────────────────────────────────────────
GRANT SELECT ON plan_prices, payments TO claude_ro;
