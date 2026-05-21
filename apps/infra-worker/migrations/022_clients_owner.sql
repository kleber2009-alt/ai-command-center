-- ============================================================
-- AI Command Center · Migration 022 · clients.owner_user_id
-- ============================================================
-- Закрывает multi-tenant leak в getPipelineSummary().
-- crm.js уже принимает ownerUserId параметром, но table.clients
-- не имела колонки для FK на platform_users — handler читал ВСЁ.
--
-- Поведение после миграции:
--  · clients.owner_user_id (UUID, NULLABLE) → platform_users(id)
--  · Существующие seed-клиенты получают owner_user_id Ильи
--    (единственного реального юзера; остальные — demo). Это
--    backfill для dev-данных; в проде новые лиды должны идти с
--    явным owner_user_id из anketa/webhook.
--  · Индекс по (owner_user_id, funnel_stage) для CRM-запросов.
--  · ON DELETE SET NULL — удаление юзера не каскадит на CRM.
--
-- Applied via:
--   docker exec -i aisales-postgres psql -U aisales -d aisales \
--     < 022_clients_owner.sql
-- ============================================================

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES platform_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clients_owner_funnel
  ON clients (owner_user_id, funnel_stage) WHERE owner_user_id IS NOT NULL;

-- Backfill: единственный реальный юзер сейчас — Илья (chat_id 1280515130,
-- см. project_office_scheduler.md). Привязываем seed-клиентов к нему,
-- чтобы CRM-фильтрация по ownerUserId возвращала непустой набор для
-- демонстраций. Идемпотент — только пустые owner'ы.
UPDATE clients
   SET owner_user_id = (SELECT id FROM platform_users WHERE tg_chat_id = 1280515130 LIMIT 1)
 WHERE owner_user_id IS NULL
   AND EXISTS (SELECT 1 FROM platform_users WHERE tg_chat_id = 1280515130);

GRANT SELECT ON clients TO claude_ro;
