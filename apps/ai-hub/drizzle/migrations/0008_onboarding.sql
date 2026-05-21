-- Onboarding state. First login → /onboard if completed_at IS NULL.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamp,
  ADD COLUMN IF NOT EXISTS niche text;
