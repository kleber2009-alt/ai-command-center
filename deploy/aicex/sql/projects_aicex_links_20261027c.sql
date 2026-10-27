-- Products missing from Command Center: apps in the repo that the seeds
-- never listed, and Finance OS, which runs on the same server.
INSERT INTO projects (slug, name, emoji, tagline, status, description, technologies, links, sort_order) VALUES
('office-worker', 'Office Worker', '⚙️', 'Cron + очередь: рассылки, /clone, Viral Discover', 'production',
 'Фоновый воркер AI Growth Office: daily/weekly/monthly артефакты, welcome-цепочки, Reels Cloner, Viral Discover, биллинг.',
 ARRAY['Node.js','Fastify','Postgres','HeyGen','Submagic','Apify'],
 '[{"label":"Health","url":"https://office.aicex.club/worker/health","kind":"api"},
   {"label":"WFDS","url":"https://office.aicex.club/worker/wfds","kind":"admin"},
   {"label":"Код","url":"https://github.com/kleber2009-alt/ai-command-center/tree/main/apps/infra-worker","kind":"repo"}]', 155),
('finance-os', 'Finance OS', '💰', 'Личные финансы: бот + Mini App', 'production',
 'Отдельный стек на этом сервере (/opt/finance-os): бот, Mini App, API, Postgres, бэкапы.',
 ARRAY['Telegram','Mini App','Postgres'],
 '[{"label":"Mini App","url":"https://finance.aicex.club/","kind":"live"},
   {"label":"Mini App (nip.io)","url":"https://finance.157-180-33-173.nip.io/","kind":"live"}]', 160),
('ig-agent', 'IG Agent', '📨', 'ИИ-ответы в Instagram Direct через SendPulse', 'dev',
 'Webhook SendPulse → ответ Claude, история в Postgres, админка на базе дашборда AI Sales. Компаньон tg-agent. Не задеплоен.',
 ARRAY['Node.js','SendPulse','Claude','Postgres'],
 '[{"label":"Код","url":"https://github.com/kleber2009-alt/ai-command-center/tree/main/apps/ig-agent","kind":"repo"}]', 170),
('tg-viral-parser', 'TG Viral Parser', '📰', 'Виральные посты TG-каналов → ревью → публикация', 'dev',
 'Парсинг каналов конкурентов (Telethon), скоринг относительной виральности, ревью в боте и публикация в канал. Не задеплоен.',
 ARRAY['Python','Telethon','Postgres'],
 '[{"label":"Код","url":"https://github.com/kleber2009-alt/ai-command-center/tree/main/apps/tg-viral-parser","kind":"repo"}]', 180),
('threads-growth', 'Threads Growth Agent', '🧵', 'Рост Threads: виралки → адаптация → публикация', 'dev',
 'Дискавери виралок, адаптация под стиль Ильи, публикация и реплаи, аналитика и самообучение. WIP, не задеплоен.',
 ARRAY['Python','FastAPI','pgvector','Claude','Apify','n8n'],
 '[{"label":"Код","url":"https://github.com/kleber2009-alt/ai-command-center/tree/main/apps/threads-growth","kind":"repo"}]', 190),
('voice-circle-bot', 'Voice Circle Bot', '⭕', 'Обработка видео-кружков в Telegram', 'paused',
 'Прототип бота для видео-кружков. Не задеплоен.',
 ARRAY['Python','Telegram'],
 '[{"label":"Код","url":"https://github.com/kleber2009-alt/ai-command-center/tree/main/apps/voice-circle-bot","kind":"repo"}]', 200)
ON CONFLICT (slug) DO UPDATE SET
  links      = EXCLUDED.links,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();
