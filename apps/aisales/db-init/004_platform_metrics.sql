-- ============================================================
-- AI Command Center · Migration 004 · Platform metrics tables
-- ============================================================
-- Дата: 16 мая 2026
-- Назначение: таблицы AI Mastery Platform для дашборда ai-command-center
-- (раньше эти данные жили в Supabase, теперь — в нашем Postgres).
--
-- Применяется автоматически через docker-entrypoint-initdb.d
-- при первом старте postgres-контейнера, либо вручную:
--   docker exec -i aisales-postgres psql -U aisales -d aisales < 004_platform_metrics.sql

-- ============ platform_users ============
-- Конечные пользователи AI Mastery Platform (не путать с ai-sales.users —
-- те операторы системы; эти — клиенты обучающей платформы).

CREATE TABLE IF NOT EXISTS platform_users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       VARCHAR(255) UNIQUE NOT NULL,
  name        VARCHAR(255),
  signed_up_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_users_last_active
  ON platform_users(last_active DESC);

-- ============ lesson_progress ============
-- Прогресс по урокам курса. Курс рассчитан на 26 уроков на пользователя
-- (см. CLAUDE.md, completionRate = COUNT(completed) / (users * 26)).

CREATE TABLE IF NOT EXISTS lesson_progress (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  lesson_id   INT  NOT NULL,
  status      VARCHAR(32) NOT NULL DEFAULT 'in_progress',
  completed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_progress_status
  ON lesson_progress(status);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_user
  ON lesson_progress(user_id);

-- ============ platform_subscriptions ============
-- Подписки на тарифы. Цены жёстко зашиты в дашборде (pro/builder/architect
-- по $29/$79/$199); MRR считается суммой active-подписок.

CREATE TABLE IF NOT EXISTS platform_subscriptions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  plan        VARCHAR(32) NOT NULL CHECK (plan IN ('pro','builder','architect')),
  status      VARCHAR(32) NOT NULL DEFAULT 'active',
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_subs_status
  ON platform_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_platform_subs_user
  ON platform_subscriptions(user_id);
