-- ============================================================
-- AI Command Center · Migration 020 · Viral Discover Candidates
-- ============================================================
-- Auto-discovery конкурентов: каждый прогон viral_discover собирает
-- авторов из скрейпа по хэштегам (которых нет в competitors), складывает
-- в candidates. В TG-выдаче — секция «Возможные конкуренты» с кнопками
-- [✅ Добавить] / [❌ Не интересно].
--
-- Применяется вручную:
--   docker exec -i aisales-postgres psql -U aisales -d aisales \
--     < 020_viral_discover_candidates.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS viral_discover_candidates (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  handle          VARCHAR(64) NOT NULL,   -- '@handle' с собачкой, нормализовано
  status          VARCHAR(16) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','accepted','rejected')),
  found_via       JSONB NOT NULL DEFAULT '{}'::jsonb,
                  -- { hashtags: ['смм','нейросети'], sample_posts: [{url, plays, likes}], owner_full_name }
  best_score      NUMERIC,                -- velocity_score топового поста этого автора в прогоне
  posts_seen      INT NOT NULL DEFAULT 0, -- за все прогоны
  first_seen      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at      TIMESTAMPTZ
);

-- Дедуп: один кандидат на (user, handle) — без учёта регистра.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_viral_candidates_user_handle
  ON viral_discover_candidates(user_id, lower(handle));

-- Быстрый отбор pending кандидатов для показа в выдаче.
CREATE INDEX IF NOT EXISTS idx_viral_candidates_pending
  ON viral_discover_candidates(user_id, best_score DESC)
  WHERE status = 'pending';

GRANT SELECT ON viral_discover_candidates TO claude_ro;
