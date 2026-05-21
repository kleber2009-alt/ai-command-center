-- ============================================================
-- AI Command Center · Migration 016 · Subscription lifecycle
-- ============================================================
-- Adds:
--   · platform_subscriptions.reminder_sent_at — чтоб не спамить
--     reminder'ом каждый день в 3-day-window перед expires_at.
--   · schedule_rule subscription_expiry_check — system-wide cron
--     один раз в сутки 06:00 UTC (09:00 МСК). Handler сам сканит
--     все active subs, expire-ит просроченные, шлёт reminder за
--     3 дня до конца. Идемпотентен.
--
-- Applied via:
--   docker exec -i aisales-postgres psql -U aisales -d aisales \
--     < 016_subscription_lifecycle.sql
-- ============================================================

ALTER TABLE platform_subscriptions
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_platform_subs_active_expires
  ON platform_subscriptions (expires_at)
  WHERE status = 'active' AND expires_at IS NOT NULL;

INSERT INTO schedule_rules (kind, cron_expr, user_filter, payload_template, enabled)
SELECT
  'subscription_expiry_check',
  '0 6 * * *',                      -- 06:00 UTC = 09:00 МСК
  '{"system_wide": true}'::jsonb,
  '{}'::jsonb,
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM schedule_rules WHERE kind = 'subscription_expiry_check');
