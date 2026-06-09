-- ============================================================
-- AI Command Center · Migration 020 · Viral Pipeline Stage Timeouts
-- ============================================================
-- Закрывает класс «pipeline залип в стадии навсегда»:
--   1) Колонка stage_started_at — когда вошли в текущую стадию.
--   2) Триггер автообновляет stage_started_at на каждый переход.
--   3) cron-правило viral_clone_sweep — раз в 5 минут будит orphan'ов
--      (non-terminal pipeline'ы без активного scheduled_job).
--
-- Сам timeout-чек живёт в handler'е (viral_clone.js, top of handle()):
-- читает stage_started_at, сверяет с бюджетом стадии, falls failed.
-- ============================================================

ALTER TABLE viral_pipelines
  ADD COLUMN IF NOT EXISTS stage_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Бэкфилл: ADD COLUMN с DEFAULT NOW() выставляет всем строкам один и тот же
-- момент ALTER'а — это неверно для исторических данных. Затираем reasonable
-- proxy: последняя UPDATE (updated_at) для незавершённых, created_at иначе.
UPDATE viral_pipelines
   SET stage_started_at = COALESCE(updated_at, created_at);

-- Триггер: обновлять stage_started_at когда stage меняется
CREATE OR REPLACE FUNCTION trg_viral_pipelines_stage_started()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    NEW.stage_started_at := NOW();
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS viral_pipelines_stage_started_trg ON viral_pipelines;
CREATE TRIGGER viral_pipelines_stage_started_trg
  BEFORE UPDATE ON viral_pipelines
  FOR EACH ROW EXECUTE FUNCTION trg_viral_pipelines_stage_started();

-- cron: каждые 5 минут поднимаем sweep. На schedule_rules нет UNIQUE
-- по kind (см. \d — daily_briefing встречается 3 раза), поэтому
-- защищаемся через NOT EXISTS — иначе повторный apply создаёт дубль.
INSERT INTO schedule_rules (kind, cron_expr, user_filter, payload_template, enabled)
SELECT 'viral_clone_sweep', '*/5 * * * *', '{"system_wide": true}'::jsonb, '{}'::jsonb, true
 WHERE NOT EXISTS (
   SELECT 1 FROM schedule_rules WHERE kind = 'viral_clone_sweep'
 );
