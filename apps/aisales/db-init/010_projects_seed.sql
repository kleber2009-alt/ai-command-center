-- ============================================================
-- AI Command Center · Migration 010 · Projects seed
-- ============================================================
-- 8 проектов оператора с примерным roadmap'ом, вытащенным из README
-- и истории коммитов. Идемпотентно: ON CONFLICT.

INSERT INTO projects (slug, name, emoji, tagline, status, description, technologies, links, sort_order) VALUES
('ai-office',
 'AI Growth Office',
 '🏢',
 'Лендинг + лидген: квиз, AI-консультант, форма',
 'production',
 'Главная воронка привлечения. Канвас-офис с агентами, 5-шаговый квиз для подбора AI-команды, AI-консультант Алиса в Telegram, форма с отправкой в Make → Supabase. Полноценный second-brain backend на Fastify с voice clone, voice notes, generation.',
 ARRAY['HTML','Canvas','Fastify','Postgres','ElevenLabs','Make.com'],
 '[
   {"label":"Открыть","url":"https://46.62.215.11.nip.io/","kind":"live"},
   {"label":"Quiz","url":"https://46.62.215.11.nip.io/#quiz-section","kind":"live"},
   {"label":"Backend код","url":"https://github.com/kleber2009-alt/ai-command-center/tree/main/infra/services/ai-office","kind":"repo"},
   {"label":"Лендинг код","url":"https://github.com/kleber2009-alt/ai-command-center/tree/main/ai-office-project","kind":"repo"}
 ]'::jsonb,
 10),

('transcribe',
 'Transcribe',
 '🎙',
 'Транскрибация видео + генерация контента (Mini App)',
 'production',
 'Telegram Mini App + вебка для транскрибации видео по URL (YouTube, Instagram, TikTok, X). После транскрипта генерирует carousel-слайды, Reels-сценарий, TG-пост. Содержит /me second-brain (RAG-чат по личным документам) и /assistants (мульти-агентский чат).',
 ARRAY['Next.js 14','TypeScript','SQLite','sqlite-vec','Deepgram','Anthropic','OpenAI embeddings'],
 '[
   {"label":"Открыть","url":"https://46.62.215.11.nip.io/transcribe","kind":"live"},
   {"label":"/me second-brain","url":"https://46.62.215.11.nip.io/me","kind":"live"},
   {"label":"/assistants","url":"https://46.62.215.11.nip.io/assistants","kind":"live"},
   {"label":"/materials","url":"https://46.62.215.11.nip.io/materials","kind":"live"},
   {"label":"Repo","url":"https://github.com/kleber2009-alt/ai-command-center/tree/main/src","kind":"repo"}
 ]'::jsonb,
 20),

('tg-agent',
 'TG Agent',
 '🤖',
 'Telegram-бот для групп с авто-классификацией и ответами',
 'production',
 'AI-агент для Telegram-групп: классифицирует входящие сообщения (вопрос / спам / лид / draft-for-owner), отвечает по knowledge base, эскалирует владельцу с inline-approval. Magic-link auth для админки, daily backup в Telegram, health-monitor с алертами.',
 ARRAY['Node.js','TypeScript','SQLite','Hono','Anthropic','Telegram Bot API'],
 '[
   {"label":"Repo","url":"https://github.com/kleber2009-alt/ai-command-center/tree/main/apps/tg-agent","kind":"repo"},
   {"label":"Hosted","url":"https://railway.app","kind":"admin"}
 ]'::jsonb,
 30),

('aisales-v2',
 'AI Sales v2',
 '💼',
 'AI-продавец Алиса для IG/TG: диалоги, прогрев, эскалация',
 'dev',
 'FastAPI-стек для автоматизации продаж в директ Instagram и Telegram. Поддерживает голосовые, видео-кружки (wav2lip), voice clone Ильи (ElevenLabs), сегментацию клиентов, оценку лидов, эскалацию на оператора. Воронка по 8 стадиям (hello → discovery → pitch → objections → close → followup).',
 ARRAY['FastAPI','Postgres','Redis','Qdrant','MinIO','Anthropic','ElevenLabs','Sieve'],
 '[
   {"label":"API","url":"https://api.46-62-215-11.nip.io/","kind":"api"},
   {"label":"Swagger","url":"https://api.46-62-215-11.nip.io/docs","kind":"docs"},
   {"label":"Repo","url":"https://github.com/kleber2009-alt/ai-command-center/tree/main/apps/aisales/v2","kind":"repo"}
 ]'::jsonb,
 40),

('aisales-v1',
 'AI Sales v1',
 '📞',
 'Первая версия AI-продавца (legacy, поддерживается)',
 'paused',
 'Базовый FastAPI-сервис с моделями client/conversation/message/action. Стартовал как proof-of-concept, сейчас работает параллельно с v2 для постепенной миграции.',
 ARRAY['FastAPI','Postgres','SQLAlchemy'],
 '[
   {"label":"API","url":"http://46.62.215.11:8000","kind":"api"},
   {"label":"Repo","url":"https://github.com/kleber2009-alt/ai-command-center/tree/main/apps/aisales/v1","kind":"repo"}
 ]'::jsonb,
 50),

('command-center',
 'AI Command Center',
 '🎛',
 'Этот дашборд — каталог проектов с roadmap',
 'dev',
 'Personal project hub: список всех твоих проектов с описанием, статусом, ссылками и редактируемым roadmap. Цель — единая точка входа во всю инфраструктуру.',
 ARRAY['Next.js 14','TypeScript','pg','Postgres','Tailwind'],
 '[
   {"label":"Открыть","url":"https://cmd.46.62.215.11.nip.io/","kind":"live"},
   {"label":"Repo","url":"https://github.com/kleber2009-alt/ai-command-center/tree/main/apps/command-center","kind":"repo"}
 ]'::jsonb,
 60),

('ytdlp',
 'yt-dlp service',
 '⬇️',
 'Микросервис для скачивания YouTube/IG/TikTok',
 'production',
 'Служебный микросервис на FastAPI с yt-dlp под капотом. Используется как fallback в transcribe когда YouTube IP-rate-limit''ит, и для всех соц-сетей (IG/TikTok/X). API-key auth, блокировка internal-IP.',
 ARRAY['Python','FastAPI','yt-dlp'],
 '[
   {"label":"Repo","url":"https://github.com/kleber2009-alt/ai-command-center/tree/main/services/ytdlp","kind":"repo"},
   {"label":"Railway","url":"https://railway.app","kind":"admin"}
 ]'::jsonb,
 70),

('infra',
 'Infra',
 '🛠',
 'Hetzner-стек: Postgres, Caddy, бэкапы',
 'production',
 'Серверная инфраструктура: docker-compose с Postgres/Redis/Qdrant/MinIO для aisales-стека и ai-office, Caddy с автоматическим Let''s Encrypt (nip.io домены), бэкапы Postgres и voice-notes в Hetzner Storage Box.',
 ARRAY['Docker Compose','Caddy 2','Postgres 16','Redis 7','Qdrant','MinIO','Hetzner'],
 '[
   {"label":"Caddyfile snippets","url":"https://github.com/kleber2009-alt/ai-command-center/tree/main/infra/snippets","kind":"repo"},
   {"label":"Backup scripts","url":"https://github.com/kleber2009-alt/ai-command-center/tree/main/infra/backup","kind":"repo"}
 ]'::jsonb,
 80)

ON CONFLICT (slug) DO NOTHING;


-- ── Roadmap milestones ──

INSERT INTO project_milestones (project_slug, ordinal, title, status, notes) VALUES
-- AI Growth Office
('ai-office',  1, 'Лендинг с интерактивным канвас-офисом',           'done',         NULL),
('ai-office',  2, 'Quiz: 5 вопросов → подбор AI-команды',            'done',         NULL),
('ai-office',  3, 'Форма лидгена: Make.com + Supabase',              'done',         NULL),
('ai-office',  4, 'AI-консультант Алиса в Telegram (deep link)',     'done',         NULL),
('ai-office',  5, 'Backend Fastify: voice clone API',                'done',         NULL),
('ai-office',  6, 'A/B тесты конверсии',                             'in_progress',  'Тест двух вариантов CTA на главной'),
('ai-office',  7, 'Аналитика воронки (GA4 + funnel)',                'planned',      NULL),

-- Transcribe
('transcribe', 1, 'Транскрибация YouTube/IG/TikTok/X',               'done',         NULL),
('transcribe', 2, 'yt-dlp fallback для rate-limit',                  'done',         NULL),
('transcribe', 3, 'Генерация carousel-слайдов',                      'done',         NULL),
('transcribe', 4, 'Reels-new и Reels-remix скрипты',                 'done',         NULL),
('transcribe', 5, 'TG-пост генератор',                               'done',         NULL),
('transcribe', 6, '/me second-brain (RAG чат по документам)',        'done',         NULL),
('transcribe', 7, '/assistants (мульти-агент чат)',                  'done',         NULL),
('transcribe', 8, '/materials страница',                             'done',         NULL),
('transcribe', 9, 'Голосовой ввод в /me',                            'in_progress',  NULL),
('transcribe',10, 'Закрыть /admin за auth',                          'planned',      'Сейчас открыт — кто угодно с URL может править'),

-- TG Agent
('tg-agent',  1, 'Stage 1: классификатор сообщений',                 'done',         NULL),
('tg-agent',  2, 'Stage 3-4: response generator + KB',               'done',         NULL),
('tg-agent',  3, 'Stage 5-6: leads/CRM в Supabase',                  'done',         NULL),
('tg-agent',  4, 'Stage 7: /admin/tg dashboard',                     'done',         NULL),
('tg-agent',  5, 'Переезд с Supabase на SQLite + Hono',              'done',         NULL),
('tg-agent',  6, 'Magic-link auth для админки',                      'done',         NULL),
('tg-agent',  7, 'Inline approval DRAFT_FOR_OWNER',                  'done',         NULL),
('tg-agent',  8, 'Daily backup → Telegram document',                 'done',         NULL),
('tg-agent',  9, 'Health monitor + owner alerts',                    'done',         NULL),
('tg-agent', 10, 'Analytics + drafts tab',                           'done',         NULL),
('tg-agent', 11, 'Prompt caching (classifier + responder)',          'done',         NULL),

-- AI Sales v2
('aisales-v2', 1, 'FastAPI бэкенд + Postgres/Redis/Qdrant/MinIO',    'done',         NULL),
('aisales-v2', 2, 'Модели client / conversation / message / action', 'done',         NULL),
('aisales-v2', 3, 'Voice transcribe (Whisper)',                      'done',         NULL),
('aisales-v2', 4, 'ElevenLabs голос Ильи',                           'done',         NULL),
('aisales-v2', 5, 'Wav2lip / Sieve видео-кружки',                    'done',         NULL),
('aisales-v2', 6, 'Сегментация клиентов + qual_score',               'done',         NULL),
('aisales-v2', 7, 'Воронка 8 стадий (hello → close)',                'done',         NULL),
('aisales-v2', 8, 'Instagram webhook',                               'in_progress',  NULL),
('aisales-v2', 9, 'Telegram webhook',                                'in_progress',  NULL),
('aisales-v2',10, 'Подключение к реальным @-аккаунтам',              'planned',      NULL),

-- AI Sales v1
('aisales-v1', 1, 'Базовый FastAPI стек',                            'done',         NULL),
('aisales-v1', 2, 'Параллельная работа с v2 для миграции',           'done',         NULL),
('aisales-v1', 3, 'Архивация после переключения трафика на v2',      'planned',      NULL),

-- Command Center
('command-center', 1, 'Project hub UI с грид-карточками',            'done',         NULL),
('command-center', 2, 'Editable roadmap (этапы в БД)',               'done',         NULL),
('command-center', 3, 'Auto-status: пинг endpoint каждого проекта',  'planned',      NULL),
('command-center', 4, 'Aggregated metrics с разных БД',              'planned',      'tg-agent SQLite, infra-postgres, transcribe SQLite'),

-- yt-dlp
('ytdlp', 1, 'FastAPI микросервис + yt-dlp',                         'done',         NULL),
('ytdlp', 2, 'API-key Bearer auth',                                  'done',         NULL),
('ytdlp', 3, 'Cookies для Instagram и YouTube',                      'done',         NULL),
('ytdlp', 4, 'Блокировка internal-IP URLs',                          'done',         NULL),
('ytdlp', 5, 'Fail-closed startup',                                  'done',         NULL),

-- Infra
('infra', 1, 'docker-compose stack (postgres+redis+qdrant+minio)',  'done',         NULL),
('infra', 2, 'Standalone Caddy + Let''s Encrypt через nip.io',       'done',         NULL),
('infra', 3, 'Backup Postgres + voice-notes → Hetzner Storage Box',  'done',         NULL),
('infra', 4, 'aisales monorepo integration',                         'done',         NULL),
('infra', 5, 'CI: GitHub Actions',                                   'planned',      NULL),
('infra', 6, 'UptimeRobot / healthcheck alerts в TG',                'planned',      NULL)

ON CONFLICT DO NOTHING;
