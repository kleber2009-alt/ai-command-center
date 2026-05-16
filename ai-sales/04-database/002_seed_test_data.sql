-- AI Sales System: тестовые данные
-- Применяется после 001_initial_schema.sql
-- Команда: docker exec -i aisales-postgres psql -U aisales -d aisales < 002_seed_test_data.sql

DO $$
DECLARE
  test_client_id UUID;
  test_conv_id UUID;
BEGIN
  -- Тестовый клиент
  INSERT INTO clients (
    ig_username, display_name, segment,
    funnel_stage, qual_score, source, tags,
    first_contact_at, last_contact_at
  )
  VALUES (
    'test_anna', 'Анна (тест)', 'segment_a',
    'discovery', 65, 'instagram_live',
    ARRAY['test', 'priority'],
    NOW() - INTERVAL '1 day',
    NOW() - INTERVAL '55 minutes'
  )
  RETURNING id INTO test_client_id;

  -- Диалог в IG
  INSERT INTO conversations (client_id, channel, status, last_message_at, message_count)
  VALUES (test_client_id, 'ig', 'active', NOW() - INTERVAL '55 minutes', 3)
  RETURNING id INTO test_conv_id;

  -- Три сообщения
  INSERT INTO messages (conversation_id, client_id, direction, type, author, content, created_at)
  VALUES
    (test_conv_id, test_client_id, 'in', 'text', 'client',
     'Привет! Видела твой эфир, интересно про нейросети',
     NOW() - INTERVAL '1 hour'),
    (test_conv_id, test_client_id, 'out', 'text', 'agent_ig',
     'Привет, Анна! Рад, что зашла. Расскажи, что больше всего откликнулось?',
     NOW() - INTERVAL '58 minutes'),
    (test_conv_id, test_client_id, 'in', 'text', 'client',
     'Тема с автоматизацией через ИИ. У меня онлайн-школа.',
     NOW() - INTERVAL '55 minutes');

  -- Действие: переход на этап discovery
  INSERT INTO actions (client_id, conversation_id, action_type, payload, triggered_by)
  VALUES (test_client_id, test_conv_id, 'stage_transition',
    '{"from": "hello", "to": "discovery"}'::jsonb, 'agent_ig');
END;
$$;

-- Создание админ-пользователя:
-- 1) Сгенерировать хеш пароля: docker compose exec api python -c "from app.core.security import hash_password; print(hash_password('ТВОЙ_ПАРОЛЬ'))"
-- 2) Вставить юзера:
--    INSERT INTO users (email, password_hash, name, role) VALUES ('ТВОЙ_EMAIL', 'СГЕНЕРИРОВАННЫЙ_ХЕШ', 'Илья', 'admin');
