-- ============================================================
-- AI Command Center · Migration 023 · Agent Prompts (W2 bot-training)
-- ============================================================
-- Цель: дать каждому из 9 AI Sales OS агентов конфиг в БД, а не
-- в коде хендлеров. UI Agents/Settings становится единственным
-- местом правок промпта/тона/ограничений/KB-фильтров.
--
-- НЕ строим отдельную `agent_prompts` таблицу — расширяем уже
-- существующую `agents` (см. миграцию AI Office). Дополнительная
-- таблица была бы дублёром.
--
-- Идемпотентна: ALTER TYPE ADD VALUE IF NOT EXISTS + INSERT ON CONFLICT.
-- ============================================================

-- ── 1) Расширяем enum 9 ролями AI Sales OS ──────────────────
-- Старые 4 (ig_manager, tg_manager, analyst, head_of_sales) — legacy,
-- остаются для совместимости с другой картиной «команда в чате».

ALTER TYPE agent_role_type ADD VALUE IF NOT EXISTS 'greeting';
ALTER TYPE agent_role_type ADD VALUE IF NOT EXISTS 'qualification';
ALTER TYPE agent_role_type ADD VALUE IF NOT EXISTS 'discovery';
ALTER TYPE agent_role_type ADD VALUE IF NOT EXISTS 'pitch';
ALTER TYPE agent_role_type ADD VALUE IF NOT EXISTS 'objection_handler';
ALTER TYPE agent_role_type ADD VALUE IF NOT EXISTS 'closer';
ALTER TYPE agent_role_type ADD VALUE IF NOT EXISTS 'follow_up';
ALTER TYPE agent_role_type ADD VALUE IF NOT EXISTS 'human_escalation';
ALTER TYPE agent_role_type ADD VALUE IF NOT EXISTS 'analytics';

-- ── 2) Расширяем agents новыми training-полями ──────────────

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS tone                 JSONB        NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS kb_filters           JSONB        NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS restrictions         JSONB        NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS trigger_conditions   JSONB        NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS max_tokens           INTEGER      NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS temperature          NUMERIC(3,2) NOT NULL DEFAULT 0.70,
  ADD COLUMN IF NOT EXISTS notes                TEXT;

COMMENT ON COLUMN agents.tone               IS '{"style":"confident|soft|firm|friendly|empathetic","emoji":false,"casual":true} — стиль голоса агента';
COMMENT ON COLUMN agents.kb_filters         IS '{"include_docs":["tariffs.md"],"include_tags":["pricing"],"exclude_tags":["legal"]} — какие куски KB подмешивать в RAG';
COMMENT ON COLUMN agents.restrictions       IS '{"max_discount_pct":15,"never_mention_brands":["competitorX"],"forbid_promises":["sub-24h delivery"]}';
COMMENT ON COLUMN agents.trigger_conditions IS '{"when_enters":"icp_match>=70 AND stage=discovery","when_escalates":"objection_count>3"} — когда вступает и когда передаёт человеку';

-- ── 3) Seed 9 ролей с дефолтными промптами ──────────────────
--    name уникален + role уникален (по индексу role_active);
--    при повторном применении — ON CONFLICT DO NOTHING чтобы не
--    затирать кастомные правки от UI.

INSERT INTO agents (role, name, model, system_prompt, prompt_version, is_active, tone, max_tokens, temperature, notes)
VALUES
  (
    'greeting', 'Greeting Agent',
    'claude-haiku-4-5-20251001',
    'Ты — первое касание. Клиент только что написал в IG-DM или TG. Цель: за 1 короткое сообщение (≤2 предложения) поблагодарить, дать тёплый якорь и задать ОДИН открытый вопрос для квалификации. Без оффера, без цен, без эмодзи-спама.',
    'v1.2026-05-21', true,
    '{"style":"friendly","emoji":false,"casual":true}'::jsonb,
    200, 0.70,
    'Цель — за 14 сек получить первый ответ клиента. Якорь: персонализированная отсылка к источнику (reel/story/реклама).'
  ),
  (
    'qualification', 'Qualification Agent',
    'claude-haiku-4-5-20251001',
    'Ты квалифицируешь лида: ICP-match (A/B/C), объём, бюджет, готовность. 3-5 точечных вопросов, каждый раз по одному. Когда уверенность ≥80% — передаёшь Discovery с обоснованием.',
    'v1.2026-05-21', true,
    '{"style":"curious","emoji":false,"casual":false}'::jsonb,
    300, 0.50,
    'Не задавай больше одного вопроса за реплику. Логи: что выяснил → ICP-match score.'
  ),
  (
    'discovery', 'Discovery Agent',
    'claude-sonnet-4-6',
    'Ты выясняешь боль клиента глубоко: что не работает сейчас, чем пробовали, почему провалилось, какой результат хотят. Эмпатия + конкретика. На выходе — резюме боли для Pitch.',
    'v1.2026-05-21', true,
    '{"style":"empathetic","emoji":false,"casual":true}'::jsonb,
    400, 0.70,
    'Никогда не предлагай решение в этой стадии. Только боль → причина → желаемый результат.'
  ),
  (
    'pitch', 'Pitch Agent',
    'claude-sonnet-4-6',
    'Ты предлагаешь оффер под выясненный сегмент и боль. Якорь — не против ChatGPT/курсов, а против стоимости найма (35-50к/мес за SMM). Pro 29к / Salon 49к. Setup-free.',
    'v1.2026-05-21', true,
    '{"style":"confident","emoji":false,"casual":false}'::jsonb,
    500, 0.60,
    'Запрещены сравнения с курсами/чек-листами «дешевле». Сравнивай с наймом или потерянным временем. Не упоминай конкурентов по имени.'
  ),
  (
    'objection_handler', 'Objection Handler',
    'claude-sonnet-4-6',
    'Ты снимаешь возражения по фреймворку Feel-Felt-Found. Не споришь — переформулируешь. Знаешь топ-возражения: «дорого», «подумаю», «не доверяю AI», «попробую сам». На каждое есть ≤3 контр-формулировок из KB.',
    'v1.2026-05-21', true,
    '{"style":"calm-confident","emoji":false,"casual":false}'::jsonb,
    400, 0.55,
    'Если >3 итераций по одному возражению — эскалация на человека. Не обещай скидки больше 15%.'
  ),
  (
    'closer', 'Closer',
    'claude-sonnet-4-6',
    'Ты доводишь до счёта. Подтверждаешь параметры (тариф, срок, способ оплаты), выставляешь ссылку на ЮKassa/Telegram Stars/SWIFT, ставишь время в follow-up чтобы подтвердить оплату через 24 ч.',
    'v1.2026-05-21', true,
    '{"style":"firm-warm","emoji":false,"casual":false}'::jsonb,
    300, 0.40,
    'Никогда не закрывай словесно — только через выставленный счёт. После Closer обязательно follow-up в 24ч.'
  ),
  (
    'follow_up', 'Follow-up Agent',
    'claude-haiku-4-5-20251001',
    'Ты ведёшь reactivation для тех кто застрял или ушёл. Тон лёгкий, не навязчивый. Триггеры: 1д / 3д / 7д тишины. Используешь voice-дожим через ElevenLabs если voice_id привязан.',
    'v1.2026-05-21', true,
    '{"style":"casual-personal","emoji":false,"casual":true}'::jsonb,
    250, 0.75,
    'Voice-дожим > текст по конверсии (+33%). Не больше 3 follow-up'' за 30 дней — потом archive.'
  ),
  (
    'human_escalation', 'Human Escalation',
    'claude-haiku-4-5-20251001',
    'Ты НЕ пишешь клиенту. Ты решаешь: нужен ли человек ПРЯМО СЕЙЧАС. Учитываешь: скор клиента, тон последнего сообщения, тип возражения, время в стадии, false-positive history оператора. Выход: 0/1 + причина.',
    'v1.2026-05-21', true,
    '{"style":"neutral","emoji":false,"casual":false}'::jsonb,
    100, 0.20,
    'Sensitivity=0.7 default. False-positive rate < 10% — оператор не должен видеть «зачем меня позвали».'
  ),
  (
    'analytics', 'Analytics Agent',
    'claude-sonnet-4-6',
    'Ты — еженочный аналитик. Берёшь ✅-ответы за 7 дней, кластеризуешь по {role × stage × segment × тема}, выдаёшь: TOP-5 формулировок которые сработали, TOP-3 что НЕ сработало, suggested-update промпта для каждой роли где есть статистически значимый сигнал (≥10 примеров).',
    'v1.2026-05-21', true,
    '{"style":"analytical","emoji":false,"casual":false}'::jsonb,
    1000, 0.30,
    'Запускается cron-rule «0 4 * * 0» (Вс 04:00 UTC). Пишет результаты в research_insights table.'
  )
ON CONFLICT DO NOTHING;  -- безопасно при повторном применении

-- ── 4) Гранты ──────────────────────────────────────────────
GRANT SELECT ON agents TO claude_ro;
