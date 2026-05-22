-- ============================================================
-- AI Command Center · Migration 007 · Agent prompt overrides
-- ============================================================
-- Хранит изменённые версии промптов агентов. Если для agent_id нет
-- записи — /api/command берёт дефолт из src/lib/prompts.ts (AGENT_PROMPTS).
--
-- Зачем не editable JSON в файле: чтобы оператор мог менять промпты
-- из UI без передеплоя.

CREATE TABLE IF NOT EXISTS agent_prompt_overrides (
  agent_id    VARCHAR(32) PRIMARY KEY,
  prompt      TEXT        NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  VARCHAR(64)                       -- email/name оператора, опц.
);
