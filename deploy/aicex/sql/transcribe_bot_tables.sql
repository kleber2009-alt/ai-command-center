-- Tables the transcribe bot writes to (src/lib/users-db.ts) that no
-- migration in the repo creates: they only existed on the lost server.
-- Columns follow the INSERT/SELECT statements in users-db.ts.

CREATE TABLE IF NOT EXISTS stars_payments (
  id                          BIGSERIAL PRIMARY KEY,
  user_id                     UUID REFERENCES users(id) ON DELETE SET NULL,
  telegram_payment_charge_id  TEXT NOT NULL UNIQUE,
  provider_payment_charge_id  TEXT,
  stars_amount                INTEGER NOT NULL,
  tier                        TEXT NOT NULL,
  days_granted                INTEGER NOT NULL,
  payload                     JSONB,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clone_drafts (
  telegram_user_id    BIGINT PRIMARY KEY,
  chat_id             BIGINT NOT NULL,
  source_url          TEXT,
  competitor_account  TEXT,
  state               TEXT NOT NULL,
  photo_id            INTEGER,
  pending_file_id     TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
