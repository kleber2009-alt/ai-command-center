-- ═══════════════════════════════════════════════════════════════════
-- 026_daily_dm_digest_rule.sql
-- ───────────────────────────────────────────────────────────────────
-- Регистрирует ежедневный cron для нового handler daily_dm_digest:
-- 21:00 MSK = 18:00 UTC, понедельник–воскресенье.
--
-- Куда слать — handler читает env ILYA_TG_CHAT_ID на самом worker'е.
-- user_filter.system_wide=true → selectUsersForRule отдаёт ровно одну
-- «строку» без tg_chat_id, и handler сам резолвит chat id из env.
--
-- ВАЖНО: ILYA_TG_CHAT_ID должен быть выставлен у контейнера
-- infra-aisales-worker-1 — handler читает env при отправке.
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO schedule_rules
  (kind, cron_expr, enabled, user_filter, payload_template, notes)
VALUES (
  'daily_dm_digest',
  '0 18 * * *',
  TRUE,
  '{"system_wide": true}'::jsonb,
  '{"lookback_hours": 24, "channels": ["ig", "tg"]}'::jsonb,
  'Ежедневная сводка по IG/TG-перепискам, 21:00 MSK'
)
ON CONFLICT DO NOTHING;
