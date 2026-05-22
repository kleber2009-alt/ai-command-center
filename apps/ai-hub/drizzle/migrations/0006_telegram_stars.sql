-- Telegram Stars billing.
-- Adds stars_price to payment_packages and seeds defaults for the four standard
-- packs. Rate: 1⭐ ≈ $0.013 (Telegram official mid-2025), rounded to clean numbers.

ALTER TABLE payment_packages
  ADD COLUMN IF NOT EXISTS stars_price integer;

UPDATE payment_packages SET stars_price = 750   WHERE slug = 'starter' AND stars_price IS NULL;
UPDATE payment_packages SET stars_price = 2300  WHERE slug = 'creator' AND stars_price IS NULL;
UPDATE payment_packages SET stars_price = 5300  WHERE slug = 'pro'     AND stars_price IS NULL;
UPDATE payment_packages SET stars_price = 15000 WHERE slug = 'studio'  AND stars_price IS NULL;
