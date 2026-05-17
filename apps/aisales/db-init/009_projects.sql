-- ============================================================
-- AI Command Center · Migration 009 · Projects hub
-- ============================================================
-- Каталог проектов оператора с описанием, ссылками и редактируемым
-- roadmap'ом. Используется для /dashboard в apps/command-center/.

CREATE TABLE IF NOT EXISTS projects (
  slug          VARCHAR(64)  PRIMARY KEY,
  name          VARCHAR(128) NOT NULL,
  emoji         VARCHAR(8)   NOT NULL DEFAULT '🚀',
  tagline       VARCHAR(255),
  status        VARCHAR(32)  NOT NULL DEFAULT 'production'
                CHECK (status IN ('production','dev','paused','archived')),
  description   TEXT         NOT NULL DEFAULT '',
  technologies  TEXT[]       NOT NULL DEFAULT '{}',
  -- ссылки: [{label, url, kind:'live'|'repo'|'docs'|'api'|'admin'|'other'}]
  links         JSONB        NOT NULL DEFAULT '[]'::jsonb,
  -- произвольный порядок проектов на главной (меньше = выше)
  sort_order    INT          NOT NULL DEFAULT 100,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_sort ON projects(sort_order, name);

CREATE TABLE IF NOT EXISTS project_milestones (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_slug  VARCHAR(64) NOT NULL REFERENCES projects(slug) ON DELETE CASCADE,
  ordinal       INT         NOT NULL DEFAULT 0,
  title         VARCHAR(255) NOT NULL,
  notes         TEXT,
  status        VARCHAR(16) NOT NULL DEFAULT 'planned'
                CHECK (status IN ('done','in_progress','planned')),
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_milestones_project
  ON project_milestones(project_slug, ordinal);
