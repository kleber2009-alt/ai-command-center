-- ============================================================
-- AI Sales · Migration 003 · Analytics + Escalations + Knowledge Gaps
-- ============================================================
-- Дата: 15 мая 2026
-- Назначение: расширить схему под Stage 7 (запуск агентов) и Stage 4 (дашборд)
--
-- Зависит от: 001_initial_schema.sql (clients, users, conversations, messages)
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Таблица: agent_actions
-- Что делал агент на каждом шаге flow (для дашборда + дебага)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_actions (
    id              BIGSERIAL PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    agent_type      VARCHAR(20) NOT NULL CHECK (agent_type IN ('ig', 'tg', 'analyst', 'rop')),

    -- Flow state
    detected_intent VARCHAR(50),
    current_stage   VARCHAR(20) NOT NULL,
    next_stage      VARCHAR(20),
    segment         VARCHAR(10) NOT NULL DEFAULT 'unknown',
    icp_match       INTEGER CHECK (icp_match BETWEEN 0 AND 100),

    -- Action taken
    action          VARCHAR(20) NOT NULL CHECK (action IN ('text', 'voice', 'circle', 'image', 'pdf', 'kbd', 'escalate', 'noop')),
    response_text   TEXT,

    -- RAG
    rag_used        BOOLEAN NOT NULL DEFAULT FALSE,
    rag_chunks      JSONB,  -- [{collection, content_id, similarity}]
    rag_miss        BOOLEAN NOT NULL DEFAULT FALSE,
    rag_miss_topic  TEXT,

    -- Meta
    model_used      VARCHAR(50),
    tokens_used     INTEGER,
    latency_ms      INTEGER,
    cost_usd        NUMERIC(10, 6),
    errors          JSONB,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_actions_conv ON agent_actions (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_actions_client ON agent_actions (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_actions_agent ON agent_actions (agent_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_actions_stage ON agent_actions (current_stage);
CREATE INDEX IF NOT EXISTS idx_actions_rag_miss ON agent_actions (rag_miss) WHERE rag_miss = TRUE;


-- ------------------------------------------------------------
-- Таблица: escalations
-- Когда агент передал клиента человеку
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS escalations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

    reason          VARCHAR(30) NOT NULL CHECK (reason IN (
        'complaint', 'legal', 'sensitive', 'direct_request',
        'confused', 'high_value', 'special', 'vip'
    )),
    urgency         VARCHAR(10) NOT NULL CHECK (urgency IN ('now', '1h', 'today')),
    summary         TEXT NOT NULL,
    suggested_response TEXT,

    -- Lifecycle
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'acknowledged', 'resolved', 'auto_resolved')),
    assigned_to     UUID REFERENCES users(id),  -- кто из людей принял
    resolved_by     UUID REFERENCES users(id),
    resolved_at     TIMESTAMPTZ,
    resolution_note TEXT,

    -- Auto-resolve
    auto_response_sent BOOLEAN NOT NULL DEFAULT FALSE,  -- бот сказал «Илья скоро вернётся»
    sla_breached    BOOLEAN NOT NULL DEFAULT FALSE,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_escalations_status ON escalations (status, urgency, created_at);
CREATE INDEX IF NOT EXISTS idx_escalations_conv ON escalations (conversation_id);


-- ------------------------------------------------------------
-- Таблица: knowledge_gaps
-- Темы, по которым RAG не находил релевантного контента
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS knowledge_gaps (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic           TEXT NOT NULL UNIQUE,
    target_collection VARCHAR(50),  -- voice / products / segments / objections / content
    severity        VARCHAR(10) NOT NULL DEFAULT 'low'
                    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    miss_count      INTEGER NOT NULL DEFAULT 1,
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    example_query   TEXT,  -- пример вопроса клиента
    status          VARCHAR(20) NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'in_progress', 'resolved', 'wont_fix')),
    resolved_in_collection_id UUID,  -- ссылка на запись в БЗ когда добавлена

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gaps_status ON knowledge_gaps (status, severity DESC, miss_count DESC);


-- ------------------------------------------------------------
-- Таблица: scoring_history
-- История изменений скоринга клиента (для графиков, аналитики)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scoring_history (
    id              BIGSERIAL PRIMARY KEY,
    client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    score           INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
    score_delta     INTEGER NOT NULL,  -- изменение от предыдущего
    segment         VARCHAR(10) NOT NULL,
    segment_changed BOOLEAN NOT NULL DEFAULT FALSE,
    factors         JSONB NOT NULL,  -- [{name, delta, evidence}]
    trigger_type    VARCHAR(30) NOT NULL,  -- new_message / re_score / manual_override
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scoring_client_time ON scoring_history (client_id, created_at DESC);


-- ------------------------------------------------------------
-- Таблица: agent_voice_metrics
-- Метрики voice consistency (embedding similarity к эталону)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_voice_metrics (
    id              BIGSERIAL PRIMARY KEY,
    agent_type      VARCHAR(20) NOT NULL,
    action_id       BIGINT NOT NULL REFERENCES agent_actions(id) ON DELETE CASCADE,
    consistency_score NUMERIC(5, 2) NOT NULL CHECK (consistency_score BETWEEN 0 AND 100),
    nearest_reference_id UUID,  -- ID образца переписки из knowledge base
    flagged         BOOLEAN NOT NULL DEFAULT FALSE,  -- если score < threshold
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_agent_time ON agent_voice_metrics (agent_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_voice_flagged ON agent_voice_metrics (flagged) WHERE flagged = TRUE;


-- ------------------------------------------------------------
-- Таблица: prompt_versions
-- Версионирование промптов (чтобы можно было откатиться)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prompt_versions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_type      VARCHAR(20) NOT NULL,
    version         VARCHAR(20) NOT NULL,
    content         TEXT NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT FALSE,
    notes           TEXT,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (agent_type, version)
);

CREATE INDEX IF NOT EXISTS idx_prompts_active ON prompt_versions (agent_type, is_active) WHERE is_active = TRUE;


-- ------------------------------------------------------------
-- Таблица: rop_tasks
-- Задачи, которые РОП создаёт для Ильи или системы
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rop_tasks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_type       VARCHAR(30) NOT NULL CHECK (task_type IN (
        'respond_to_lead', 'update_prompt', 'fill_knowledge_base', 'review_dialog'
    )),
    priority        VARCHAR(5) NOT NULL CHECK (priority IN ('p1', 'p2', 'p3')),
    status          VARCHAR(20) NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'in_progress', 'done', 'cancelled')),

    -- Контекст
    client_id       UUID REFERENCES clients(id) ON DELETE SET NULL,
    related_collection VARCHAR(50),  -- для fill_knowledge_base

    title           TEXT NOT NULL,
    body            TEXT,
    suggested_action TEXT,

    -- Lifecycle
    assigned_to     UUID REFERENCES users(id),
    completed_at    TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rop_tasks_status ON rop_tasks (status, priority, created_at);


-- ------------------------------------------------------------
-- Триггеры updated_at
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_escalations_updated_at ON escalations;
CREATE TRIGGER trg_escalations_updated_at
    BEFORE UPDATE ON escalations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_gaps_updated_at ON knowledge_gaps;
CREATE TRIGGER trg_gaps_updated_at
    BEFORE UPDATE ON knowledge_gaps
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_rop_tasks_updated_at ON rop_tasks;
CREATE TRIGGER trg_rop_tasks_updated_at
    BEFORE UPDATE ON rop_tasks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ------------------------------------------------------------
-- Полезные view для дашборда
-- ------------------------------------------------------------

-- Воронка: количество клиентов на каждом этапе
CREATE OR REPLACE VIEW v_funnel_snapshot AS
SELECT
    c.funnel_stage,
    COUNT(*) AS clients_count,
    AVG(c.qual_score)::INTEGER AS avg_score,
    COUNT(*) FILTER (WHERE c.segment = 'segment_a') AS seg_a_count
FROM clients c
WHERE c.funnel_stage NOT IN ('closed_won', 'closed_lost')
GROUP BY c.funnel_stage;

-- Конверсии за период (последние 30 дней)
CREATE OR REPLACE VIEW v_conversion_30d AS
SELECT
    DATE(created_at) AS day,
    COUNT(*) FILTER (WHERE current_stage = 'hello') AS hellos,
    COUNT(*) FILTER (WHERE next_stage = 'discovery') AS to_discovery,
    COUNT(*) FILTER (WHERE next_stage = 'pitch') AS to_pitch,
    COUNT(*) FILTER (WHERE next_stage = 'close') AS to_close,
    COUNT(*) FILTER (WHERE next_stage = 'won') AS to_won
FROM agent_actions
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY day DESC;

-- Top knowledge gaps
CREATE OR REPLACE VIEW v_top_gaps AS
SELECT
    topic,
    target_collection,
    severity,
    miss_count,
    last_seen_at,
    example_query
FROM knowledge_gaps
WHERE status = 'open'
ORDER BY
    CASE severity
        WHEN 'critical' THEN 4
        WHEN 'high' THEN 3
        WHEN 'medium' THEN 2
        ELSE 1
    END DESC,
    miss_count DESC
LIMIT 20;

-- Активные эскалации
CREATE OR REPLACE VIEW v_active_escalations AS
SELECT
    e.id,
    e.conversation_id,
    e.client_id,
    cl.display_name AS client_name,
    COALESCE(cl.ig_username, cl.tg_username) AS client_handle,
    e.reason,
    e.urgency,
    e.summary,
    e.status,
    e.created_at,
    EXTRACT(EPOCH FROM (NOW() - e.created_at)) / 60 AS minutes_open
FROM escalations e
JOIN clients cl ON cl.id = e.client_id
WHERE e.status IN ('pending', 'acknowledged')
ORDER BY
    CASE e.urgency WHEN 'now' THEN 3 WHEN '1h' THEN 2 ELSE 1 END DESC,
    e.created_at ASC;

COMMIT;

-- ============================================================
-- Откат миграции (если что-то пошло не так):
-- ============================================================
-- BEGIN;
-- DROP VIEW IF EXISTS v_active_escalations, v_top_gaps, v_conversion_30d, v_funnel_snapshot;
-- DROP TABLE IF EXISTS rop_tasks, prompt_versions, agent_voice_metrics,
--                       scoring_history, knowledge_gaps, escalations, agent_actions;
-- COMMIT;
