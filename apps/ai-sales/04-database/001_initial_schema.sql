-- AI Sales System: первичная схема БД
-- Применяется командой: docker exec -i aisales-postgres psql -U aisales -d aisales < 001_initial_schema.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- USERS

CREATE TYPE user_role AS ENUM ('admin', 'manager', 'viewer');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role user_role NOT NULL DEFAULT 'viewer',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);

-- CLIENTS

CREATE TYPE funnel_stage AS ENUM (
  'hello', 'discovery', 'pitch', 'objections',
  'close', 'followup', 'closed_won', 'closed_lost'
);

CREATE TYPE client_segment AS ENUM (
  'segment_a', 'segment_b', 'segment_c', 'unknown'
);

CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ig_username VARCHAR(255),
  ig_user_id VARCHAR(100),
  tg_username VARCHAR(255),
  tg_user_id BIGINT,
  phone VARCHAR(50),
  email VARCHAR(255),
  display_name VARCHAR(255),
  segment client_segment NOT NULL DEFAULT 'unknown',
  funnel_stage funnel_stage NOT NULL DEFAULT 'hello',
  qual_score INT NOT NULL DEFAULT 0 CHECK (qual_score BETWEEN 0 AND 100),
  predicted_deal_amount DECIMAL(10,2),
  source VARCHAR(100),
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  consent_given_at TIMESTAMPTZ,
  first_contact_at TIMESTAMPTZ,
  last_contact_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clients_ig_user_id ON clients(ig_user_id);
CREATE INDEX idx_clients_tg_user_id ON clients(tg_user_id);
CREATE INDEX idx_clients_segment ON clients(segment);
CREATE INDEX idx_clients_funnel_stage ON clients(funnel_stage);
CREATE INDEX idx_clients_qual_score ON clients(qual_score DESC);
CREATE INDEX idx_clients_tags ON clients USING gin(tags);

-- CONVERSATIONS

CREATE TYPE conversation_channel AS ENUM ('ig', 'tg');
CREATE TYPE conversation_status AS ENUM (
  'active', 'paused', 'closed', 'escalated'
);

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  channel conversation_channel NOT NULL,
  status conversation_status NOT NULL DEFAULT 'active',
  external_id VARCHAR(255),
  agent_is_active BOOLEAN NOT NULL DEFAULT true,
  last_message_at TIMESTAMPTZ,
  message_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(client_id, channel)
);

CREATE INDEX idx_conversations_client ON conversations(client_id);
CREATE INDEX idx_conversations_status ON conversations(status);
CREATE INDEX idx_conversations_last_msg ON conversations(last_message_at DESC);

-- MESSAGES

CREATE TYPE message_direction AS ENUM ('in', 'out');
CREATE TYPE message_type AS ENUM ('text', 'audio', 'video', 'image', 'file');
CREATE TYPE message_author AS ENUM ('client', 'agent_ig', 'agent_tg', 'human');

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  external_id VARCHAR(255),
  direction message_direction NOT NULL,
  type message_type NOT NULL DEFAULT 'text',
  author message_author NOT NULL,
  content TEXT,
  media_url VARCHAR(500),
  media_metadata JSONB DEFAULT '{}'::jsonb,
  agent_model VARCHAR(100),
  prompt_version VARCHAR(50),
  tokens_used INT,
  latency_ms INT,
  cost_usd DECIMAL(10,6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_client ON messages(client_id, created_at DESC);
CREATE INDEX idx_messages_external ON messages(external_id);

-- ACTIONS

CREATE TYPE action_type AS ENUM (
  'stage_transition', 'escalation', 'agent_paused',
  'agent_resumed', 'human_takeover', 'tag_added',
  'tag_removed', 'note_added', 'segment_changed'
);

CREATE TABLE actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action_type action_type NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  triggered_by VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_actions_client ON actions(client_id, created_at DESC);
CREATE INDEX idx_actions_type ON actions(action_type);

-- ANALYTICS

CREATE TABLE analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  score INT NOT NULL CHECK (score BETWEEN 0 AND 100),
  checklist JSONB NOT NULL DEFAULT '{}'::jsonb,
  recommendations TEXT,
  missed_signals TEXT[],
  analyst_model VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_analytics_conversation ON analytics(conversation_id, created_at DESC);

-- AGENTS

CREATE TYPE agent_role_type AS ENUM (
  'ig_manager', 'tg_manager', 'analyst', 'head_of_sales'
);

CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role agent_role_type NOT NULL,
  name VARCHAR(255) NOT NULL,
  model VARCHAR(100) NOT NULL,
  system_prompt TEXT NOT NULL,
  prompt_version VARCHAR(50) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agents_role_active ON agents(role, is_active);

-- AUDIT LOG

CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID,
  action VARCHAR(100) NOT NULL,
  changes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);

-- AUTO UPDATE updated_at

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_agents_updated_at
  BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
