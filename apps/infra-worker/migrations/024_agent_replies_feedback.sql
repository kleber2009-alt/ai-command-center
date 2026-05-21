-- ============================================================
-- AI Command Center · Migration 024 · Agent Replies & Feedback (W3 bot-training)
-- ============================================================
-- Сырая истина обучения: каждый per-turn AI-suggestion в Conversation,
-- что реально ушло клиенту, и оценка оператора (✅/❌/edited/replaced).
-- Эта таблица — основа для Analytics handler (weekly distill) и
-- monthly fine-tune dataset.
--
-- ВАЖНО: отдельная от `deliverables` потому что:
--   • Volume на 2 порядка выше (per-turn vs per-artifact)
--   • Контекст другой (тред клиента vs proactive артефакт типа daily_briefing)
--   • Жизненный цикл другой (suggestion может быть проигнорирован vs
--     deliverable всегда «отправлен и ждёт ✅»)
--   • Training: вытягиваем агрегированные паттерны без затрагивания
--     операционных запросов к deliverables.
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_replies (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- ── Контекст ─────────────────────────────────────────────
  client_id                UUID         REFERENCES clients(id) ON DELETE SET NULL,
  agent_id                 UUID         REFERENCES agents(id)  ON DELETE SET NULL,
                                        -- какая версия промпта сгенерила
  agent_role               agent_role_type NOT NULL,
                                        -- денормализация для быстрой агрегации по роли
  stage                    VARCHAR(32),
                                        -- 'hello'|'discovery'|'pitch'|...
                                        -- nullable, т.к. AI может работать вне-этапа
  channel                  VARCHAR(16),
                                        -- 'ig'|'tg'|'wa'|'web'
  thread_external_id       VARCHAR(128),
                                        -- IG/TG message thread id для дебага и
                                        -- сопоставления с историей платформы

  -- ── AI generation ────────────────────────────────────────
  generated_text           TEXT         NOT NULL,
  generation_input         JSONB        NOT NULL DEFAULT '{}'::jsonb,
                                        -- {transcript_window, kb_chunks_ids[], rag_query, ...}
  generation_model         VARCHAR(64),
  generation_tokens_in     INTEGER,
  generation_tokens_out    INTEGER,
  generation_latency_ms    INTEGER,
  generated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- ── Operator feedback ───────────────────────────────────
  feedback_type            VARCHAR(32),
                                        -- 'replied_verbatim' — вставил как есть
                                        -- 'edited'            — отредактировал и отправил
                                        -- 'replaced'          — написал своё, AI-ответ выкинул
                                        -- 'ignored'           — закрыл окно, ничего не отправил
                                        -- 'escalated'         — позвал Илью
  feedback_at              TIMESTAMPTZ,
  sent_text                TEXT,        -- что РЕАЛЬНО ушло клиенту (для edited/replaced)
  edit_diff                JSONB,       -- {added:[…], removed:[…], tone_shift:'softer'|'harder'}
  feedback_meta            JSONB        NOT NULL DEFAULT '{}'::jsonb,
                                        -- {operator_id, comment, rating?}

  -- ── Training bookkeeping ────────────────────────────────
  was_used_for_training    BOOLEAN      NOT NULL DEFAULT false,
  training_batch_id        UUID,
                                        -- ID воскресного analytics-run'а
                                        -- который включил эту строку в кластеризацию
  cluster_id               UUID,        -- ссылка на research_insights.id когда появится

  -- ── Bookkeeping ─────────────────────────────────────────
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT agent_replies_feedback_type_check CHECK (
    feedback_type IS NULL OR feedback_type IN (
      'replied_verbatim','edited','replaced','ignored','escalated'
    )
  ),
  CONSTRAINT agent_replies_channel_check CHECK (
    channel IS NULL OR channel IN ('ig','tg','wa','web','email','other')
  )
);

-- ── Индексы под основные запросы ─────────────────────────────

-- 1) UI Conversation: показать AI-suggestions по конкретному клиенту
CREATE INDEX IF NOT EXISTS idx_agent_replies_client_time
  ON agent_replies (client_id, generated_at DESC);

-- 2) Analytics: training-batch отбор ✅-ответов по роли
CREATE INDEX IF NOT EXISTS idx_agent_replies_training_pool
  ON agent_replies (agent_role, feedback_type, generated_at DESC)
  WHERE feedback_type = 'replied_verbatim' AND was_used_for_training = false;

-- 3) Operations: «сколько suggestions ждут feedback от Ильи»
CREATE INDEX IF NOT EXISTS idx_agent_replies_pending_feedback
  ON agent_replies (generated_at DESC)
  WHERE feedback_at IS NULL;

-- 4) Reports: AWR (Autonomous Win Rate) — % verbatim по периоду
CREATE INDEX IF NOT EXISTS idx_agent_replies_feedback_window
  ON agent_replies (feedback_at DESC, feedback_type)
  WHERE feedback_type IS NOT NULL;

-- 5) Agent settings: «по какому именно промпту скоринг» — version regression detection
CREATE INDEX IF NOT EXISTS idx_agent_replies_agent
  ON agent_replies (agent_id, feedback_type, generated_at DESC);

-- ── Триггер: при INSERT с feedback_type=NULL → feedback_at тоже NULL.
--    При апдейте feedback_type — auto-set feedback_at, если NULL.
CREATE OR REPLACE FUNCTION trg_agent_replies_set_feedback_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.feedback_type IS NOT NULL AND NEW.feedback_at IS NULL THEN
    NEW.feedback_at := NOW();
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agent_replies_set_feedback_at ON agent_replies;
CREATE TRIGGER agent_replies_set_feedback_at
  BEFORE INSERT OR UPDATE OF feedback_type ON agent_replies
  FOR EACH ROW EXECUTE FUNCTION trg_agent_replies_set_feedback_at();

-- ── Гранты ──────────────────────────────────────────────────
GRANT SELECT ON agent_replies TO claude_ro;

-- ── (Опционально) backfill из deliverables.used_at ──────────
-- Если хочется единый отчёт «всё AI делало + feedback» — закомментировано
-- by default чтобы не дублировать события. Раскомментировать после того
-- как UI выяснит как мапить deliverable → agent_role.
--
-- INSERT INTO agent_replies (client_id, agent_role, generated_text, generated_at,
--                            feedback_type, feedback_at, generation_input)
-- SELECT
--   NULL,                                       -- client_id для deliverable неизвестен
--   'analytics'::agent_role_type,               -- TODO: реальный agent_role из metadata
--   d.body,
--   d.delivered_at,
--   CASE d.used_kind
--     WHEN 'used'       THEN 'replied_verbatim'
--     WHEN 'not_useful' THEN 'replaced'
--     ELSE NULL
--   END,
--   d.used_at,
--   jsonb_build_object('source','deliverable','deliverable_id', d.id, 'kind', d.kind)
-- FROM deliverables d
-- WHERE d.used_at IS NOT NULL;
