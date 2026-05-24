-- ============================================================
-- AI Command Center · Migration 012 · Реальные URL и новые проекты
-- ============================================================
-- 1. Обновляет ссылки ai-office на реальный production-домен
--    ai-office.46-62-215-11.nip.io (а не nip.io).
-- 2. Добавляет два отдельных проекта:
--    · AI Voice Bot (@aio_voice_bot) — Telegram-бот для тренировки
--      голосового клона
--    · AI Office Mini App — Telegram Mini App для подбора AI-команды
--
-- Найдено grep'ом по коду в ai-office-project/: упоминания
-- ai-office.46-62-215-11.nip.io, @AI_Growth_Office_Bot, @aio_voice_bot,
-- /mini-app/.

UPDATE projects SET
  tagline = 'Production-сайт ai-office.46-62-215-11.nip.io: квиз, AI-консультант Алиса, лидген',
  links = '[
    {"label":"ai-office.46-62-215-11.nip.io (prod)","url":"https://ai-office.46-62-215-11.nip.io/","kind":"live"},
    {"label":"Quiz","url":"https://ai-office.46-62-215-11.nip.io/#quiz-section","kind":"live"},
    {"label":"FAQ","url":"https://ai-office.46-62-215-11.nip.io/faq.html","kind":"live"},
    {"label":"Pricing","url":"https://ai-office.46-62-215-11.nip.io/pricing.html","kind":"live"},
    {"label":"AI-консультант","url":"https://t.me/AI_Growth_Office_Bot","kind":"admin"},
    {"label":"Hetzner backup","url":"https://46.62.215.11.nip.io/","kind":"other"},
    {"label":"Backend Fastify","url":"https://github.com/kleber2009-alt/ai-command-center/tree/feat/aisales-monorepo/infra/services/ai-office","kind":"repo"},
    {"label":"Лендинг код","url":"https://github.com/kleber2009-alt/ai-command-center/tree/feat/aisales-monorepo/ai-office-project","kind":"repo"}
  ]'::jsonb,
  updated_at = NOW()
WHERE slug = 'ai-office';

-- ── AI Voice Bot (@aio_voice_bot) ──
INSERT INTO projects (slug, name, emoji, tagline, status, description, technologies, links, sort_order) VALUES
('voice-bot',
 'AI Voice Bot',
 '🎤',
 'Telegram-бот для тренировки голосового клона',
 'production',
 'Отдельный Telegram-бот @aio_voice_bot для onboarding голосового клона ElevenLabs. Пользователь шлёт боту голосовые → бот собирает датасет → создаёт voice ID → его можно подключать к AI Sales / AI Office. Привязка через one-time token на /persona-train.',
 ARRAY['Telegram Bot API','Node.js','ElevenLabs','Fastify'],
 '[
   {"label":"Открыть в Telegram","url":"https://t.me/aio_voice_bot","kind":"live"},
   {"label":"Onboarding страница","url":"https://ai-office.46-62-215-11.nip.io/persona-train","kind":"live"},
   {"label":"Docs (PHASE_5)","url":"https://github.com/kleber2009-alt/ai-command-center/blob/feat/aisales-monorepo/ai-office-project/docs/PHASE_5.md","kind":"docs"}
 ]'::jsonb,
 35)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO project_milestones (project_slug, ordinal, title, status, notes) VALUES
('voice-bot', 1, 'Регистрация бота через @BotFather',           'done',         NULL),
('voice-bot', 2, '/persona-train страница для onboarding',      'done',         NULL),
('voice-bot', 3, 'Bind token: сайт ↔ Telegram-бот',             'done',         NULL),
('voice-bot', 4, 'Сбор голосовых сэмплов в чате',               'done',         NULL),
('voice-bot', 5, 'ElevenLabs voice clone API',                  'done',         NULL),
('voice-bot', 6, 'Использование голоса в AI Sales / AI Office', 'in_progress',  NULL),
('voice-bot', 7, 'Web интерфейс управления голосами',           'planned',      NULL)
ON CONFLICT DO NOTHING;


-- ── AI Office Mini App ──
INSERT INTO projects (slug, name, emoji, tagline, status, description, technologies, links, sort_order) VALUES
('mini-app',
 'AI Office Mini App',
 '📱',
 'Telegram Mini App для AI Growth Office',
 'dev',
 'Telegram Mini App обёртка для главного сайта AI Growth Office. Зарегистрирована в @BotFather (/newapp) на URL ai-office.46-62-215-11.nip.io/mini-app/. Позволяет открывать квиз / pricing / dashboard прямо внутри Telegram без выхода в браузер.',
 ARRAY['Telegram Mini App','HTML','Telegram WebApp SDK'],
 '[
   {"label":"Mini App URL","url":"https://ai-office.46-62-215-11.nip.io/mini-app/","kind":"live"},
   {"label":"Через бот","url":"https://t.me/AI_Growth_Office_Bot/app","kind":"live"},
   {"label":"Лендинг (полная версия)","url":"https://ai-office.46-62-215-11.nip.io/","kind":"other"}
 ]'::jsonb,
 38)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO project_milestones (project_slug, ordinal, title, status, notes) VALUES
('mini-app', 1, 'Регистрация через @BotFather /newapp',          'done',         NULL),
('mini-app', 2, 'Базовая обёртка над лендингом',                 'done',         NULL),
('mini-app', 3, 'Telegram WebApp SDK: initData, themeParams',    'in_progress',  NULL),
('mini-app', 4, 'Адаптация под мобильный viewport Telegram',     'in_progress',  NULL),
('mini-app', 5, 'Haptic feedback на ключевых кнопках',           'planned',      NULL),
('mini-app', 6, 'Native sharing через Telegram',                 'planned',      NULL)
ON CONFLICT DO NOTHING;
