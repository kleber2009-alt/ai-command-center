-- Daily Instagram digests. One row per (contact, generated_at).
-- Same shape as tg-agent's tg_digests, but contact-scoped instead of chat-scoped.

CREATE TABLE IF NOT EXISTS ig_digests (
  id BIGSERIAL PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  window_hours INTEGER NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  messages_count INTEGER NOT NULL,
  payload_json JSONB NOT NULL,
  summary_md TEXT NOT NULL,
  delivered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ig_digests_contact
  ON ig_digests(contact_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ig_digests_generated
  ON ig_digests(generated_at DESC);
