-- ============================================================
-- AI Command Center · Migration 006 · Agent tasks (persistence)
-- ============================================================
-- Назначение: хранить задачи, которые AI-агенты генерируют при
-- нажатии "Запустить команду" на дашборде. Раньше задачи жили
-- только в React-state и пропадали при перезагрузке страницы.
--
-- Применяется через docker-entrypoint-initdb.d при первом старте
-- postgres-контейнера, либо вручную:
--   docker exec -i aisales-postgres psql -U aisales -d aisales \
--     < 006_agent_tasks.sql

CREATE TABLE IF NOT EXISTS agent_tasks (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id      VARCHAR(32)  NOT NULL,   -- analyst | cfo | cmo | cs | ceo
  agent_name    VARCHAR(64)  NOT NULL,   -- денормализовано: чтобы UI не лез в registry
  agent_emoji   VARCHAR(8)   NOT NULL,
  text          TEXT         NOT NULL,
  impact        TEXT         NOT NULL,
  status        VARCHAR(16)  NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','in_progress','done','skipped')),
  run_id        UUID,                    -- группирует задачи одного запуска цикла
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_created
  ON agent_tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_agent
  ON agent_tasks(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status
  ON agent_tasks(status) WHERE status IN ('pending','in_progress');
CREATE INDEX IF NOT EXISTS idx_agent_tasks_run
  ON agent_tasks(run_id) WHERE run_id IS NOT NULL;
