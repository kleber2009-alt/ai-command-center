-- Phase 1: users + quota tables

-- Users registered via Telegram Mini App
CREATE TABLE users (
  id                     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id            BIGINT       UNIQUE NOT NULL,
  username               TEXT,
  first_name             TEXT,
  subscription_tier      TEXT         NOT NULL DEFAULT 'free',
  stripe_customer_id     TEXT         UNIQUE,
  stripe_subscription_id TEXT,
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Monthly transcription quota per user
-- minutes_limit = -1 means unlimited (team tier)
CREATE TABLE user_quotas (
  user_id       UUID          PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  minutes_used  NUMERIC(10,2) NOT NULL DEFAULT 0,
  minutes_limit NUMERIC(10,2) NOT NULL DEFAULT 60,
  resets_at     TIMESTAMPTZ   NOT NULL DEFAULT (date_trunc('month', now()) + INTERVAL '1 month'),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Link transcripts to users (nullable — existing rows stay without owner)
ALTER TABLE transcripts ADD COLUMN user_id UUID REFERENCES users(id);
CREATE INDEX transcripts_user_id_idx ON transcripts (user_id);

-- Minutes per tier
CREATE OR REPLACE FUNCTION tier_minutes_limit(p_tier TEXT)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_tier
    WHEN 'pro'  THEN 600
    WHEN 'team' THEN -1
    ELSE 60
  END;
$$;

-- Upsert quota row; sync limit with tier; reset counter if billing cycle rolled over
CREATE OR REPLACE FUNCTION ensure_quota(p_user_id UUID, p_tier TEXT)
RETURNS user_quotas LANGUAGE plpgsql AS $$
DECLARE v_row user_quotas;
BEGIN
  INSERT INTO user_quotas (user_id, minutes_limit)
  VALUES (p_user_id, tier_minutes_limit(p_tier))
  ON CONFLICT (user_id) DO UPDATE
    SET minutes_limit = tier_minutes_limit(p_tier),
        updated_at    = now();

  UPDATE user_quotas
  SET minutes_used = 0,
      resets_at    = date_trunc('month', now()) + INTERVAL '1 month',
      updated_at   = now()
  WHERE user_id = p_user_id
    AND resets_at <= now();

  SELECT * INTO v_row FROM user_quotas WHERE user_id = p_user_id;
  RETURN v_row;
END;
$$;

-- Atomically increment minutes_used
CREATE OR REPLACE FUNCTION add_minutes_used(p_user_id UUID, p_minutes NUMERIC)
RETURNS void LANGUAGE sql AS $$
  UPDATE user_quotas
  SET minutes_used = minutes_used + p_minutes,
      updated_at   = now()
  WHERE user_id = p_user_id;
$$;
