-- ============================================================
-- AI Command Center · Migration 017 · Viral Clone Pipeline
-- ============================================================
-- Конвейер «клонируем залетевший рилс конкурента → выкатываем под
-- голосом/лицом клиента». Шесть стадий, состояние persisted, каждый
-- тик одного handler'а (viral_clone) двигает state-machine вперёд и
-- (если впереди ещё работа) ставит сам себе следующий scheduled_job.
--
--   init → researched → downloaded → transcribed → rewritten →
--   heygen_submitted → heygen_done → submagic_submitted →
--   submagic_done → delivered  (or → failed на любом шаге)
--
-- Применяется вручную:
--   docker exec -i aisales-postgres psql -U aisales -d aisales \
--     < 017_viral_pipeline.sql
-- ============================================================

-- ───────────────────────────────────────────────────────────
-- viral_pipelines — одна строка на один прогон конвейера
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS viral_pipelines (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID,                      -- nullable: можно запускать «без юзера», доставка по tg_chat_id
  tg_chat_id            BIGINT       NOT NULL,     -- куда в итоге слать файл

  -- Стадия state-machine
  stage                 VARCHAR(32)  NOT NULL DEFAULT 'init'
                        CHECK (stage IN (
                          'init',
                          'researched',
                          'downloaded',
                          'transcribed',
                          'rewritten',
                          'heygen_submitted',
                          'heygen_done',
                          'submagic_submitted',
                          'submagic_done',
                          'delivered',
                          'failed'
                        )),

  -- Stage 1 · research
  competitor_account    VARCHAR(128),              -- @handle (если не указан source_url)
  source_url            TEXT,                      -- прямой URL рилса (если задан — research-стадия проскакивает)
  source_metadata       JSONB        NOT NULL DEFAULT '{}'::jsonb,
                                                   -- {play_count, like_count, comments_count, posted_at, caption, …}

  -- Stage 2 · download
  source_local_path     TEXT,                      -- путь к скачанному MP4 в worker'е
  source_duration_sec   INTEGER,

  -- Stage 3 · transcribe
  transcript            TEXT,
  transcript_language   VARCHAR(8),

  -- Stage 4 · rewrite (Claude адаптирует под голос/нишу клиента)
  rewritten_script      TEXT,

  -- Stage 5 · HeyGen
  heygen_avatar_id      VARCHAR(128),
  heygen_voice_id       VARCHAR(128),
  heygen_video_id       VARCHAR(128),              -- id, возвращаемый /v2/video/generate
  heygen_video_url      TEXT,                      -- финальный mp4 URL от HeyGen
  heygen_local_path     TEXT,
  heygen_poll_attempts  INTEGER      NOT NULL DEFAULT 0,

  -- Stage 6 · Submagic
  submagic_project_id   VARCHAR(128),
  submagic_template     VARCHAR(64),               -- название шаблона субтитров/B-roll
  submagic_video_url    TEXT,
  submagic_local_path   TEXT,
  submagic_poll_attempts INTEGER     NOT NULL DEFAULT 0,

  -- Stage 7 · доставка в Telegram
  tg_document_message_id BIGINT,
  deliverable_id        UUID,                      -- ссылка на deliverables(id) для WFDS

  -- Bookkeeping
  last_error            TEXT,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  completed_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_viral_pipelines_user
  ON viral_pipelines(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_viral_pipelines_stage
  ON viral_pipelines(stage, updated_at DESC)
  WHERE stage NOT IN ('delivered', 'failed');

-- Триггер на updated_at
CREATE OR REPLACE FUNCTION trg_viral_pipelines_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS viral_pipelines_touch ON viral_pipelines;
CREATE TRIGGER viral_pipelines_touch
  BEFORE UPDATE ON viral_pipelines
  FOR EACH ROW EXECUTE FUNCTION trg_viral_pipelines_touch_updated_at();

-- Гранты для claude_ro: только чтение
GRANT SELECT ON viral_pipelines TO claude_ro;
