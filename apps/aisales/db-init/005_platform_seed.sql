-- ============================================================
-- AI Command Center · Migration 005 · Demo seed for platform_*
-- ============================================================
-- Назначение: реалистичные demo-данные, чтобы дашборд показывал
-- ненулевые цифры сразу после `docker compose up -d postgres`.
--
-- Идемпотентно: ON CONFLICT DO NOTHING на email.

DO $$
DECLARE
  user_ids UUID[];
  uid UUID;
  i INT;
BEGIN
  -- 50 demo-пользователей; 35 активных за 7 дней, 15 неактивных
  FOR i IN 1..50 LOOP
    INSERT INTO platform_users (email, name, signed_up_at, last_active)
    VALUES (
      'demo_user_' || i || '@example.com',
      'Demo User ' || i,
      NOW() - (random() * INTERVAL '60 days'),
      CASE
        WHEN i <= 35 THEN NOW() - (random() * INTERVAL '6 days')
        ELSE NOW() - (random() * INTERVAL '30 days' + INTERVAL '8 days')
      END
    )
    ON CONFLICT (email) DO NOTHING;
  END LOOP;

  -- Прогресс: первые 30 пользователей прошли по N уроков (от 5 до 26)
  SELECT array_agg(id ORDER BY signed_up_at) INTO user_ids FROM platform_users;

  FOR i IN 1..LEAST(30, array_length(user_ids, 1)) LOOP
    uid := user_ids[i];
    INSERT INTO lesson_progress (user_id, lesson_id, status, completed_at)
    SELECT
      uid,
      lesson_num,
      'completed',
      NOW() - (random() * INTERVAL '14 days')
    FROM generate_series(1, 5 + (i % 22)) AS lesson_num
    ON CONFLICT (user_id, lesson_id) DO NOTHING;
  END LOOP;

  -- Подписки: 18 платных (8 pro, 7 builder, 3 architect) — даёт MRR ~$1380
  FOR i IN 1..8 LOOP
    INSERT INTO platform_subscriptions (user_id, plan, status)
    VALUES (user_ids[i], 'pro', 'active');
  END LOOP;
  FOR i IN 9..15 LOOP
    INSERT INTO platform_subscriptions (user_id, plan, status)
    VALUES (user_ids[i], 'builder', 'active');
  END LOOP;
  FOR i IN 16..18 LOOP
    INSERT INTO platform_subscriptions (user_id, plan, status)
    VALUES (user_ids[i], 'architect', 'active');
  END LOOP;
END $$;
