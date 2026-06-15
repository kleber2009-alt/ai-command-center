-- ============================================================
-- AI Command Center · Migration 018 · Office core
-- ============================================================
-- Канонический storage layer для Web Office и Telegram HQ:
-- события, задачи, решения, память, журналы и daily briefs.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'office_agent_kind') THEN
    CREATE TYPE office_agent_kind AS ENUM (
      'chief_of_staff',
      'product',
      'growth',
      'research',
      'sales',
      'support',
      'ops',
      'finance'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'office_event_severity') THEN
    CREATE TYPE office_event_severity AS ENUM ('critical', 'high', 'medium', 'low');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'office_task_status') THEN
    CREATE TYPE office_task_status AS ENUM ('new', 'triaged', 'in_progress', 'blocked', 'waiting_approval', 'done', 'canceled');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'office_task_priority') THEN
    CREATE TYPE office_task_priority AS ENUM ('p0', 'p1', 'p2', 'p3');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'office_decision_status') THEN
    CREATE TYPE office_decision_status AS ENUM ('pending', 'approved', 'rejected', 'deferred', 'expired');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'office_memory_kind') THEN
    CREATE TYPE office_memory_kind AS ENUM (
      'weekly_review',
      'incident',
      'research',
      'customer_voice',
      'playbook',
      'decision',
      'product_learning'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS office_agents (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug              TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  kind              office_agent_kind NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active',
  mission           TEXT NOT NULL DEFAULT '',
  cadence           TEXT NOT NULL DEFAULT '',
  primary_channels  TEXT[] NOT NULL DEFAULT '{}',
  source_systems    TEXT[] NOT NULL DEFAULT '{}',
  default_scope     JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS office_event_sources (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug              TEXT NOT NULL UNIQUE,
  system_kind       TEXT NOT NULL,
  display_name      TEXT NOT NULL,
  repo_path         TEXT,
  owner_agent_slug  TEXT REFERENCES office_agents(slug) ON UPDATE CASCADE ON DELETE SET NULL,
  enabled           BOOLEAN NOT NULL DEFAULT TRUE,
  emits             TEXT[] NOT NULL DEFAULT '{}',
  config            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS office_events (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id         UUID REFERENCES office_event_sources(id) ON UPDATE CASCADE ON DELETE SET NULL,
  event_type        TEXT NOT NULL,
  severity          office_event_severity NOT NULL DEFAULT 'medium',
  title             TEXT NOT NULL,
  summary           TEXT NOT NULL DEFAULT '',
  payload           JSONB NOT NULL DEFAULT '{}'::jsonb,
  project_slug      TEXT,
  dedupe_key        TEXT,
  occurred_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ingested_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS office_events_dedupe_key_idx
  ON office_events(dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS office_events_project_slug_idx ON office_events(project_slug);
CREATE INDEX IF NOT EXISTS office_events_event_type_idx ON office_events(event_type);
CREATE INDEX IF NOT EXISTS office_events_occurred_at_idx ON office_events(occurred_at DESC);

CREATE TABLE IF NOT EXISTS office_event_deliveries (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id          UUID NOT NULL REFERENCES office_events(id) ON UPDATE CASCADE ON DELETE CASCADE,
  agent_slug        TEXT NOT NULL REFERENCES office_agents(slug) ON UPDATE CASCADE ON DELETE CASCADE,
  channel           TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'queued',
  delivered_at      TIMESTAMPTZ,
  acknowledged_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS office_event_deliveries_event_id_idx ON office_event_deliveries(event_id);
CREATE INDEX IF NOT EXISTS office_event_deliveries_agent_slug_idx ON office_event_deliveries(agent_slug);

CREATE TABLE IF NOT EXISTS office_tasks (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kind              TEXT NOT NULL,
  status            office_task_status NOT NULL DEFAULT 'new',
  priority          office_task_priority NOT NULL DEFAULT 'p2',
  title             TEXT NOT NULL,
  summary           TEXT NOT NULL DEFAULT '',
  description       TEXT NOT NULL DEFAULT '',
  project_slug      TEXT,
  owner_agent_slug  TEXT REFERENCES office_agents(slug) ON UPDATE CASCADE ON DELETE SET NULL,
  source_event_id   UUID REFERENCES office_events(id) ON UPDATE CASCADE ON DELETE SET NULL,
  due_at            TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS office_tasks_status_idx ON office_tasks(status);
CREATE INDEX IF NOT EXISTS office_tasks_priority_idx ON office_tasks(priority);
CREATE INDEX IF NOT EXISTS office_tasks_project_slug_idx ON office_tasks(project_slug);
CREATE INDEX IF NOT EXISTS office_tasks_owner_agent_slug_idx ON office_tasks(owner_agent_slug);

CREATE TABLE IF NOT EXISTS office_task_links (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id           UUID NOT NULL REFERENCES office_tasks(id) ON UPDATE CASCADE ON DELETE CASCADE,
  link_kind         TEXT NOT NULL,
  link_ref          TEXT NOT NULL,
  label             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS office_task_links_task_id_idx ON office_task_links(task_id);

CREATE TABLE IF NOT EXISTS office_decisions (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title                 TEXT NOT NULL,
  summary               TEXT NOT NULL DEFAULT '',
  status                office_decision_status NOT NULL DEFAULT 'pending',
  project_slug          TEXT,
  requested_by_agent_slug TEXT REFERENCES office_agents(slug) ON UPDATE CASCADE ON DELETE SET NULL,
  source_task_id        UUID REFERENCES office_tasks(id) ON UPDATE CASCADE ON DELETE SET NULL,
  recommended_option_key TEXT,
  resolved_option_key   TEXT,
  requested_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at           TIMESTAMPTZ,
  resolution_note       TEXT
);

CREATE INDEX IF NOT EXISTS office_decisions_status_idx ON office_decisions(status);
CREATE INDEX IF NOT EXISTS office_decisions_project_slug_idx ON office_decisions(project_slug);

CREATE TABLE IF NOT EXISTS office_decision_options (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  decision_id       UUID NOT NULL REFERENCES office_decisions(id) ON UPDATE CASCADE ON DELETE CASCADE,
  option_key        TEXT NOT NULL,
  label             TEXT NOT NULL,
  tradeoffs         TEXT NOT NULL DEFAULT '',
  is_recommended    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS office_decision_options_unique_idx
  ON office_decision_options(decision_id, option_key);

CREATE TABLE IF NOT EXISTS office_memory_entries (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kind                office_memory_kind NOT NULL,
  title               TEXT NOT NULL,
  summary             TEXT NOT NULL DEFAULT '',
  body_markdown       TEXT NOT NULL DEFAULT '',
  project_slug        TEXT,
  tags                TEXT[] NOT NULL DEFAULT '{}',
  importance          INTEGER NOT NULL DEFAULT 50,
  created_by_agent_slug TEXT REFERENCES office_agents(slug) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS office_memory_entries_kind_idx ON office_memory_entries(kind);
CREATE INDEX IF NOT EXISTS office_memory_entries_project_slug_idx ON office_memory_entries(project_slug);
CREATE INDEX IF NOT EXISTS office_memory_entries_created_at_idx ON office_memory_entries(created_at DESC);

CREATE TABLE IF NOT EXISTS office_memory_links (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  memory_id         UUID NOT NULL REFERENCES office_memory_entries(id) ON UPDATE CASCADE ON DELETE CASCADE,
  link_kind         TEXT NOT NULL,
  link_ref          TEXT NOT NULL,
  label             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS office_memory_links_memory_id_idx ON office_memory_links(memory_id);

CREATE TABLE IF NOT EXISTS office_journal_entries (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_kind       TEXT NOT NULL,
  entity_id         UUID,
  action_kind       TEXT NOT NULL,
  actor_type        TEXT NOT NULL,
  actor_id          TEXT,
  narrative         TEXT NOT NULL,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS office_journal_entries_entity_idx ON office_journal_entries(entity_kind, entity_id);
CREATE INDEX IF NOT EXISTS office_journal_entries_created_at_idx ON office_journal_entries(created_at DESC);

CREATE TABLE IF NOT EXISTS office_daily_briefs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brief_date          DATE NOT NULL,
  channel             TEXT NOT NULL,
  summary             TEXT NOT NULL DEFAULT '',
  priorities_json     JSONB NOT NULL DEFAULT '[]'::jsonb,
  risks_json          JSONB NOT NULL DEFAULT '[]'::jsonb,
  decisions_json      JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by_agent_slug TEXT REFERENCES office_agents(slug) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS office_daily_briefs_unique_idx
  ON office_daily_briefs(brief_date, channel);

GRANT SELECT ON
  office_agents,
  office_event_sources,
  office_events,
  office_event_deliveries,
  office_tasks,
  office_task_links,
  office_decisions,
  office_decision_options,
  office_memory_entries,
  office_memory_links,
  office_journal_entries,
  office_daily_briefs
TO claude_ro;
