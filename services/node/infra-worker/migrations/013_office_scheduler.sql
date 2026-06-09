-- ============================================================
-- AI Command Center · Migration 013 · Office Scheduler
-- ============================================================
-- Назначение: фундамент для проактивной работы AI-офиса.
-- Schedule_rules задают cron-шаблоны ("каждое утро в 08:30 для
-- всех active subscriber'ов"). Worker по тикам разворачивает их
-- в конкретные scheduled_jobs, исполняет, пишет результаты в
-- deliverables (для метрики WFDS) и обновляет agent_memory
-- (persistent context per customer).
--
-- Применяется вручную (НЕ через docker-entrypoint-initdb.d —
-- БД уже существует):
--   docker exec -i aisales-postgres psql -U aisales -d aisales \
--     < 013_office_scheduler.sql
-- ============================================================

-- ───────────────────────────────────────────────────────────
-- schedule_rules — шаблоны расписания
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schedule_rules (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kind              VARCHAR(64)  NOT NULL,  -- daily_briefing | weekly_recap | monthly_calendar | ...
  cron_expr         VARCHAR(64)  NOT NULL,  -- "30 8 * * 1-5" (worker интерпретирует в UTC по умолчанию)
  user_filter       JSONB        NOT NULL DEFAULT '{}'::jsonb,
                                            -- {} = все; {"plan":"builder"} = только builder; {"user_id":"..."} = конкретный
  payload_template  JSONB        NOT NULL DEFAULT '{}'::jsonb,
                                            -- params, которые попадут в scheduled_jobs.payload
  enabled           BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schedule_rules_enabled
  ON schedule_rules(kind) WHERE enabled = TRUE;

-- ───────────────────────────────────────────────────────────
-- scheduled_jobs — конкретные инстансы для выполнения
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_id       UUID,                       -- nullable: bring-your-own-job (event-driven)
  kind          VARCHAR(64)  NOT NULL,
  user_id       UUID,                       -- nullable для broadcast
  scheduled_at  TIMESTAMPTZ  NOT NULL,
  status        VARCHAR(16)  NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','running','done','failed','skipped')),
  payload       JSONB        NOT NULL DEFAULT '{}'::jsonb,
  result        JSONB,
  attempts      INTEGER      NOT NULL DEFAULT 0,
  last_error    TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ
);

-- Worker poll: WHERE status='pending' AND scheduled_at <= now() ORDER BY scheduled_at FOR UPDATE SKIP LOCKED
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_pending
  ON scheduled_jobs(scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_user
  ON scheduled_jobs(user_id, kind, created_at DESC);
-- Дедупликация: один и тот же rule + user + scheduled_at не должен создаваться дважды
CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduled_jobs_dedup
  ON scheduled_jobs(rule_id, user_id, scheduled_at)
  WHERE rule_id IS NOT NULL AND user_id IS NOT NULL;

-- ───────────────────────────────────────────────────────────
-- deliverables — артефакты офиса, основа метрики WFDS
-- ───────────────────────────────────────────────────────────
-- WFDS (Weekly Founder Deliverables Shipped) =
--   COUNT(*) WHERE used_at >= now() - interval '7 days' GROUP BY user_id
CREATE TABLE IF NOT EXISTS deliverables (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID         NOT NULL,
  job_id       UUID,                            -- ссылка на scheduled_jobs.id, если артефакт от worker'а
  agent_id     VARCHAR(64)  NOT NULL,           -- идентификатор агента из catalog (engineering-* / sales-* / ...)
  agent_name   VARCHAR(64)  NOT NULL,           -- человеческое имя (Аня, Игорь, …)
  kind         VARCHAR(64)  NOT NULL,           -- briefing | content_post | reels_script | dm_reply | weekly_recap | …
  title        VARCHAR(255) NOT NULL,
  body         TEXT         NOT NULL,           -- полный текст артефакта (markdown)
  metadata     JSONB        NOT NULL DEFAULT '{}'::jsonb,
                                                -- {tg_message_id, voice_url, pdf_url, ...}
  delivered_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  used_at      TIMESTAMPTZ,                     -- тап «использовал ✅» → этот столбец
  used_kind    VARCHAR(32),                     -- "used" | "not_useful" | NULL
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deliverables_user_used
  ON deliverables(user_id, used_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_deliverables_user_kind
  ON deliverables(user_id, kind);
CREATE INDEX IF NOT EXISTS idx_deliverables_wfds
  ON deliverables(user_id, used_at) WHERE used_at IS NOT NULL;

-- ───────────────────────────────────────────────────────────
-- agent_memory — persistent context per customer per agent
-- ───────────────────────────────────────────────────────────
-- Без этого иллюзия команды рассыпается: артефакт Day 5 не помнит Day 3.
-- Worker инжектит summary + facts в system prompt каждого вызова Claude.
CREATE TABLE IF NOT EXISTS agent_memory (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID         NOT NULL,
  agent_id    VARCHAR(64)  NOT NULL,
  summary     TEXT         NOT NULL DEFAULT '',  -- rolling summary последних N взаимодействий (~500 токенов)
  facts       JSONB        NOT NULL DEFAULT '{}'::jsonb,
                                                -- структурированные факты: tone_of_voice, audience, products, …
  last_seen   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_memory_user
  ON agent_memory(user_id, last_seen DESC);

-- ───────────────────────────────────────────────────────────
-- Seed: единственное стартовое правило — утренняя планёрка
-- ───────────────────────────────────────────────────────────
-- Будни (Пн-Пт) в 08:30 UTC (≈11:30 MSK) для каждого user'а с active subscription.
-- TZ-aware рассылка появится позже (когда соберём user.tz).
-- payload_template содержит дефолтные параметры handler'а:
--   {agent_name: "Аня", agent_id: "marketing-content-creator", kind: "briefing"}
INSERT INTO schedule_rules (kind, cron_expr, user_filter, payload_template, enabled)
SELECT
  'daily_briefing',
  '30 8 * * 1-5',
  '{"requires_active_sub": true}'::jsonb,
  '{"agent_id": "marketing-content-creator", "agent_name": "Аня", "agent_emoji": "✍️"}'::jsonb,
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM schedule_rules WHERE kind = 'daily_briefing');

-- ============================================================
-- Гранты для claude_ro: SELECT на новые таблицы
-- ============================================================
GRANT SELECT ON schedule_rules, scheduled_jobs, deliverables, agent_memory TO claude_ro;
