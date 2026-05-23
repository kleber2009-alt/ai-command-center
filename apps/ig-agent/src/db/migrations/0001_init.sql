-- Initial schema for ig-agent. Mirrors the user-provided DDL exactly,
-- with two infrastructure additions (schema_migrations + updated_at trigger).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Migration tracking. migrate.ts skips rows already in here.
CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Instagram subscribers (contacts).
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sendpulse_contact_id TEXT UNIQUE NOT NULL,
  ig_username TEXT,
  ig_user_id TEXT,
  first_name TEXT,
  last_name TEXT,
  profile_pic_url TEXT,

  lead_status TEXT DEFAULT 'new',          -- new, warm, hot, customer, lost
  qualification TEXT,                      -- A, B, C, D
  tags TEXT[],
  custom_fields JSONB,

  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- All messages (incoming + outgoing).
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,

  direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  source TEXT NOT NULL CHECK (source IN ('user', 'ai_agent', 'manual', 'flow')),

  text TEXT,
  media_url TEXT,
  media_type TEXT,

  ai_model TEXT,
  ai_prompt_version TEXT,
  ai_tokens_used INTEGER,
  ai_confidence FLOAT,

  intent TEXT,
  sentiment TEXT,

  sendpulse_message_id TEXT,
  raw_payload JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversation sessions.
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id),
  status TEXT DEFAULT 'active',            -- active, closed, escalated

  ai_handled BOOLEAN DEFAULT true,
  human_takeover_at TIMESTAMPTZ,

  outcome TEXT,                            -- sale, no_sale, abandoned, escalated
  sale_amount NUMERIC,

  started_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

-- One active conversation per contact at a time. Enforced by partial index
-- so closed conversations can stack up historically.
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_active_per_contact
  ON conversations (contact_id) WHERE status = 'active';

-- AI analyst recommendations.
CREATE TABLE IF NOT EXISTS ai_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id),
  conversation_id UUID REFERENCES conversations(id),

  type TEXT,                               -- next_message, action, segment_change, warning
  content TEXT NOT NULL,
  priority TEXT DEFAULT 'normal',

  applied BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Prompt versions (for A/B + audit trail).
CREATE TABLE IF NOT EXISTS prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT UNIQUE NOT NULL,
  system_prompt TEXT NOT NULL,
  segment TEXT,
  active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_contact ON messages(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(lead_status);
CREATE INDEX IF NOT EXISTS idx_contacts_last_message ON contacts(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommendations_contact ON ai_recommendations(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_contact ON conversations(contact_id, started_at DESC);

-- Keep contacts.updated_at fresh on every UPDATE.
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contacts_touch_updated_at ON contacts;
CREATE TRIGGER contacts_touch_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Seed a default responder prompt so v0.1 has something to use.
INSERT INTO prompt_versions (version, system_prompt, segment, active)
VALUES (
  'v0.1-default',
  'Ты — AI-ассистент в Instagram Direct. Отвечай дружелюбно, кратко (1–3 предложения), на языке собеседника. Не выдумывай факты. Если не знаешь — предложи вернуться позже или передать сообщение владельцу.',
  NULL,
  true
)
ON CONFLICT (version) DO NOTHING;
