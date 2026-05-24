-- ============================================================
-- AI Command Center · Migration 016 · Действующие продукты
-- ============================================================
-- Заполняем projects реальными продуктами, которые сейчас
-- крутятся на проде (или почти крутятся — статус dev для тех,
-- что ещё в процессе).
--
-- UPSERT (ON CONFLICT DO UPDATE) — миграция идемпотентна,
-- можно запускать повторно для обновления URL/описаний.
--
-- sort_order: 10..60 — основные продукты (потребительские),
-- 35,38 — sub-продукты AI Office (voice-bot, mini-app, уже есть).
-- ============================================================

-- 1. AI Growth Office (ai-office)
INSERT INTO projects (slug, name, emoji, tagline, status, description, technologies, links, sort_order) VALUES
('ai-office',
 'AI Growth Office',
 '🏢',
 'AI-команда из 169 агентов под нишу клиента за 48ч',
 'production',
 'SaaS-«AI-команда»: проактивные daily/weekly/monthly артефакты в голосе клиента, не реактивная переписка. Day-0 +23min голосовое от Ани (ElevenLabs клон) — момент истины. ICP: эксперт онлайн-школы 50к–1М ₽/мес. North star — WFDS (Weekly Founder Deliverables Shipped). Pro 1990 / Builder 5900 / Architect 14900 ₽/мес.',
 ARRAY['Next.js','Node.js','ElevenLabs','Telegram','Make.com','Supabase','Postgres'],
 '[
   {"label":"Лендинг (nip.io)","url":"https://ai-office.46-62-215-11.nip.io/","kind":"live"},
   {"label":"Лендинг (ai-office.46-62-215-11.nip.io)","url":"https://ai-office.46-62-215-11.nip.io/","kind":"live"},
   {"label":"@AI_Growth_Office_Bot","url":"https://t.me/AI_Growth_Office_Bot","kind":"admin"},
   {"label":"WFDS dashboard","url":"https://ai-office.46-62-215-11.nip.io/worker/wfds","kind":"admin"}
 ]'::jsonb,
 10)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  emoji = EXCLUDED.emoji,
  tagline = EXCLUDED.tagline,
  status = EXCLUDED.status,
  description = EXCLUDED.description,
  technologies = EXCLUDED.technologies,
  links = EXCLUDED.links,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- 2. Транскрибация (transcribe)
INSERT INTO projects (slug, name, emoji, tagline, status, description, technologies, links, sort_order) VALUES
('transcribe',
 'Транскрибация',
 '🎙️',
 'YouTube/Reels/TikTok → 4 артефакта (карусель, Reels-сценарий, TG-пост, перевод)',
 'production',
 'Расшифровка любого видео по ссылке в 4 артефакта: IG-карусель 8×PNG, Reels-сценарий, TG-пост, перевод на 50+ языков. Доп.фича: /clone <url> — viral_clone pipeline (yt-dlp → Whisper → Claude rewrite → HeyGen → Submagic Hormozi 2). Free 60 мин/мес, Pro 750⭐/30 дней через Telegram Stars (RU-friendly).',
 ARRAY['Next.js','Whisper','Claude','HeyGen','Submagic','Telegram Stars','TMA','Postgres'],
 '[
   {"label":"Лендинг","url":"https://transcribe.46-62-215-11.nip.io/","kind":"live"},
   {"label":"App (basic-auth)","url":"https://transcribe.46-62-215-11.nip.io/transcribe","kind":"admin"},
   {"label":"TMA","url":"https://tma.46-62-215-11.nip.io/","kind":"live"},
   {"label":"@your_transscribe_bot","url":"https://t.me/your_transscribe_bot","kind":"admin"}
 ]'::jsonb,
 20)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  emoji = EXCLUDED.emoji,
  tagline = EXCLUDED.tagline,
  status = EXCLUDED.status,
  description = EXCLUDED.description,
  technologies = EXCLUDED.technologies,
  links = EXCLUDED.links,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- 3. AI Creative Hub (ai-hub)
INSERT INTO projects (slug, name, emoji, tagline, status, description, technologies, links, sort_order) VALUES
('ai-hub',
 'AI Creative Hub',
 '🎨',
 'Агрегатор 16 нейросетей с единым token-кошельком',
 'dev',
 'SaaS-агрегатор: image/video/upscale Topaz/face-swap/nano-banana/карусель/reels-script. Provider''ы: fal.ai, Replicate, kie.ai. Wallet — race-free через 4 атомарные SECURITY DEFINER функции Postgres. Onboarding-бонус 100 токенов. /admin с 6 табами. Лендинг live, app ждёт env-ключи провайдеров.',
 ARRAY['Next.js 14','TypeScript','Drizzle','Auth.js v5','Postgres','BullMQ','MinIO','Stripe','Telegram Stars'],
 '[
   {"label":"Лендинг","url":"https://aihub.46-62-215-11.nip.io/","kind":"live"},
   {"label":"Roadmap","url":"https://aihub.46-62-215-11.nip.io/roadmap.html","kind":"docs"},
   {"label":"App","url":"https://aihub-app.46-62-215-11.nip.io/","kind":"live"},
   {"label":"TMA (@aicex_one_bot)","url":"https://t.me/aicex_one_bot","kind":"admin"}
 ]'::jsonb,
 30)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  emoji = EXCLUDED.emoji,
  tagline = EXCLUDED.tagline,
  status = EXCLUDED.status,
  description = EXCLUDED.description,
  technologies = EXCLUDED.technologies,
  links = EXCLUDED.links,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- 4. AI Sales System (ai-sales / Отдел продаж)
INSERT INTO projects (slug, name, emoji, tagline, status, description, technologies, links, sort_order) VALUES
('ai-sales',
 'AI Sales System',
 '💼',
 'AI закрывает 87% диалогов в IG+TG. Ты — 13%.',
 'production',
 'CRM/dashboard для команды продаж + AI-агенты под клиентов. 7 главных экранов: Pulse / Inbox / Pipeline / Journey / Conversation / Agents / Reports. Стек: статика /var/www/aisales-dashboard/ + FastAPI бэкенд (aisales-api-v2 :8001). БД aisales — пока seed-фикстура (16 таблиц).',
 ARRAY['FastAPI','Postgres','Redis','Qdrant','MinIO','HTML','Caddy'],
 '[
   {"label":"Лендинг","url":"https://aisales.46-62-215-11.nip.io/","kind":"live"},
   {"label":"Dashboard","url":"https://dashboard.46-62-215-11.nip.io/","kind":"admin"},
   {"label":"API docs","url":"https://dashboard.46-62-215-11.nip.io/api/docs","kind":"api"}
 ]'::jsonb,
 40)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  emoji = EXCLUDED.emoji,
  tagline = EXCLUDED.tagline,
  status = EXCLUDED.status,
  description = EXCLUDED.description,
  technologies = EXCLUDED.technologies,
  links = EXCLUDED.links,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- 5. Persona Studio (persona-studio)
INSERT INTO projects (slug, name, emoji, tagline, status, description, technologies, links, sort_order) VALUES
('persona-studio',
 'Persona Studio',
 '🪞',
 'AI-контент из твоего лица за 2 минуты',
 'dev',
 'AI Avatar Content Studio: 1 фото → 10 аватаров → HeyGen-видео / обложки карусели. Фабрика контента вокруг лица эксперта. Начато 2026-05-20: лендинг готов, Next.js app впереди.',
 ARRAY['Next.js','HeyGen','nano-banana','Replicate'],
 '[
   {"label":"Лендинг","url":"https://persona.46-62-215-11.nip.io/","kind":"live"}
 ]'::jsonb,
 50)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  emoji = EXCLUDED.emoji,
  tagline = EXCLUDED.tagline,
  status = EXCLUDED.status,
  description = EXCLUDED.description,
  technologies = EXCLUDED.technologies,
  links = EXCLUDED.links,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- 6. Залётный / Viral Discover (viral-discover)
INSERT INTO projects (slug, name, emoji, tagline, status, description, technologies, links, sort_order) VALUES
('viral-discover',
 'Залётный (Viral Discover)',
 '📡',
 'Топ-5 рилсов + топ-5 каруселей конкурентов утром в Telegram',
 'production',
 'Ежедневный парсер ниши: 5 рилсов + 5 каруселей конкурентов с Claude-оценкой 1-10 «зайдёт у меня». Cron 08:00 МСК. Wizard-onboarding через @parser_instaa_bot. Live с 2026-05-20.',
 ARRAY['Apify','Claude','Postgres','Telegram Bot API','cron'],
 '[
   {"label":"Лендинг","url":"https://viral.46-62-215-11.nip.io/","kind":"live"},
   {"label":"@parser_instaa_bot","url":"https://t.me/parser_instaa_bot","kind":"admin"}
 ]'::jsonb,
 60)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  emoji = EXCLUDED.emoji,
  tagline = EXCLUDED.tagline,
  status = EXCLUDED.status,
  description = EXCLUDED.description,
  technologies = EXCLUDED.technologies,
  links = EXCLUDED.links,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();


-- ── Roadmap-этапы (только для новых проектов, у voice-bot/mini-app уже есть) ──

INSERT INTO project_milestones (project_slug, ordinal, title, status, notes) VALUES
('ai-office', 1, 'Лендинг ai-office.nip.io + ai-office.46-62-215-11.nip.io',     'done',         NULL),
('ai-office', 2, 'Quiz + AI-консультант Алиса',                         'done',         NULL),
('ai-office', 3, 'Stars billing + yearly + refund flow',                'done',         NULL),
('ai-office', 4, 'Office Worker: 9 handler-kinds + cron scheduler',     'done',         NULL),
('ai-office', 5, 'WFDS dashboard + multi-tenant CRM фильтр',            'done',         NULL),
('ai-office', 6, 'Voice welcome Day-0 +23min (ElevenLabs IVC)',         'done',         NULL),
('ai-office', 7, 'A/B тесты конверсии лендинга',                        'in_progress',  NULL),
('ai-office', 8, 'Аналитика воронки (GA4 + funnel)',                    'planned',      NULL)
ON CONFLICT DO NOTHING;

INSERT INTO project_milestones (project_slug, ordinal, title, status, notes) VALUES
('transcribe', 1, 'YouTube/IG/TikTok/X → 4 артефакта',                  'done',         NULL),
('transcribe', 2, 'yt-dlp fallback + cookies для IG',                   'done',         NULL),
('transcribe', 3, 'TMA + initData HMAC auth',                           'done',         NULL),
('transcribe', 4, 'Stars billing (Pro 750⭐/30 дней)',                  'done',         NULL),
('transcribe', 5, '/clone pipeline (6 шагов state-machine)',            'done',         NULL),
('transcribe', 6, 'Viral discover (парсер ниши, 08:00 МСК)',            'done',         NULL),
('transcribe', 7, 'Admin quotas (Whisper-минуты)',                      'done',         NULL),
('transcribe', 8, 'Миграция Supabase → локальный aio (me, чат, доки)',  'in_progress',  'me_profile/trend готово, осталось documents/chat/tasks'),
('transcribe', 9, 'ЮKassa интеграция (помимо Stars)',                   'planned',      NULL)
ON CONFLICT DO NOTHING;

INSERT INTO project_milestones (project_slug, ordinal, title, status, notes) VALUES
('ai-hub', 1, 'Next.js 14 + Drizzle + Auth.js v5 (magic-link)',         'done',         NULL),
('ai-hub', 2, 'Wallet: 4 атомарные SECURITY DEFINER функции',           'done',         NULL),
('ai-hub', 3, 'BullMQ + Redis db1 + MinIO bucket ai-hub-media',         'done',         NULL),
('ai-hub', 4, '16 tools (image/video/upscale/face-swap/...)',           'done',         NULL),
('ai-hub', 5, '/admin с 6 табами + onboarding-бонус 100 токенов',       'done',         NULL),
('ai-hub', 6, 'Stripe Checkout + Telegram Stars',                       'done',         NULL),
('ai-hub', 7, 'Provider env keys (fal.ai/Replicate/kie.ai)',            'in_progress',  'Лендинг live, app ждёт ключи'),
('ai-hub', 8, 'TMA @aicex_one_bot — публичный запуск',                  'planned',      NULL)
ON CONFLICT DO NOTHING;

INSERT INTO project_milestones (project_slug, ordinal, title, status, notes) VALUES
('ai-sales', 1, '7 главных экранов (Pulse/Inbox/Pipeline/...)',         'done',         NULL),
('ai-sales', 2, 'FastAPI бэкенд aisales-api-v2 :8001',                  'done',         NULL),
('ai-sales', 3, 'Postgres + Redis + Qdrant + MinIO стек',               'done',         NULL),
('ai-sales', 4, 'AI-агенты под клиентов (/agents)',                     'done',         NULL),
('ai-sales', 5, 'Seed-фикстура → реальные данные клиентов',             'planned',      'Сейчас demo_user_*@example.com'),
('ai-sales', 6, 'Интеграция с TG/IG inbox',                             'planned',      NULL)
ON CONFLICT DO NOTHING;

INSERT INTO project_milestones (project_slug, ordinal, title, status, notes) VALUES
('persona-studio', 1, 'Лендинг (Apple-style)',                          'done',         NULL),
('persona-studio', 2, 'Next.js app: upload 1 фото',                     'planned',      NULL),
('persona-studio', 3, '10 аватаров через nano-banana',                  'planned',      NULL),
('persona-studio', 4, 'HeyGen-видео из аватара',                        'planned',      NULL),
('persona-studio', 5, 'Carousel cover генератор',                       'planned',      NULL),
('persona-studio', 6, 'Telegram Stars billing',                         'planned',      NULL)
ON CONFLICT DO NOTHING;

INSERT INTO project_milestones (project_slug, ordinal, title, status, notes) VALUES
('viral-discover', 1, 'Apify direct для Instagram парсинга',            'done',         NULL),
('viral-discover', 2, 'Claude-оценка 1-10 «зайдёт у меня»',             'done',         NULL),
('viral-discover', 3, '@parser_instaa_bot wizard-onboarding',           'done',         NULL),
('viral-discover', 4, 'Cron 08:00 МСК — daily delivery в TG',           'done',         NULL),
('viral-discover', 5, 'Stage-timeout sweep (orphan pipeline)',          'done',         NULL),
('viral-discover', 6, 'Лендинг + публичный launch',                     'in_progress',  NULL)
ON CONFLICT DO NOTHING;
