-- Optional: run this once in Supabase SQL Editor after 003_tasks.sql
-- to populate /admin with the current backlog. The WHERE NOT EXISTS guard
-- makes the script idempotent (won't insert duplicates on re-run).

insert into tasks (title, description, status, priority, stage)
select * from (values
  -- ── Active ──
  ('Apify для Instagram',
   'Заменить yt-dlp + личные cookies на Apify Instagram Reel Scraper. Изолировать наш IG-аккаунт и IP от запросов.',
   'backlog', 'high', 'Stability'),

  ('YouTube cookies в Railway',
   'Экспортировать cookies из браузера, склеить с инстаграмными и положить в COOKIES_B64 на Railway. Без них YouTube блокирует датацентровые IP.',
   'in_progress', 'high', 'Stability'),

  ('Проверить, что транскрипты сохраняются в Supabase',
   'После замены SUPABASE_SERVICE_KEY на service_role и редеплоя Vercel — прогнать транскрипцию и убедиться что строка появляется в transcripts. Если нет — смотреть Vercel-логи.',
   'in_progress', 'high', 'Stability'),

  ('Server-side проверка initData',
   'Валидировать подпись Telegram initData по TELEGRAM_BOT_TOKEN на каждом API-вызове. Сейчас API открыт всем — кто угодно может транскрибировать через нашу инфру.',
   'backlog', 'medium', 'Security'),

  ('Закрыть /admin от посторонних',
   'Сейчас /admin доступен по прямой ссылке любому. Минимум — basic auth по переменной ADMIN_TOKEN, идеально — проверка Telegram user_id владельца.',
   'backlog', 'high', 'Security'),

  ('Полировка темы под Telegram',
   'Сейчас мини-апп всегда тёмный slate-950. Использовать --tg-bg / --tg-text / --tg-button из themeParams (уже копируются в CSS) для плавной адаптации под клиента пользователя.',
   'backlog', 'low', 'Polish'),

  ('Тестирование на iOS/Android',
   'Открыть мини-апп с iPhone и Android-устройства, проверить: MainButton, safe areas, haptic, viewport. Зафиксировать косяки.',
   'backlog', 'medium', 'Polish'),

  -- ── Done ──
  ('Транскрибация через Deepgram',
   'POST /api/transcribe принимает прямые медиа-ссылки и возвращает текст + параграфы с таймкодами.',
   'done', 'high', 'Foundation'),

  ('YouTube native captions parser',
   'Свой парсер captionTracks из watch-page HTML — заменил сломанный youtube-transcript npm-пакет.',
   'done', 'high', 'Foundation'),

  ('yt-dlp микросервис на Railway',
   'FastAPI + yt-dlp + ffmpeg в Docker, поднят на Railway, отдаёт прямые media URL для Deepgram. Поддерживает cookies через COOKIES_B64.',
   'done', 'high', 'Foundation'),

  ('AI-саммари, перевод, генерация контента',
   'Карусель / Рилс новый / Рилс ремикс / TG-пост — все через Claude Haiku, с кешем в Supabase.',
   'done', 'high', 'Foundation'),

  ('Telegram Mini App интеграция',
   'SDK подключён, MainButton привязан к submit, тема и haptic работают. Бот настроен через BotFather.',
   'done', 'high', 'Mini App'),

  ('Strip dashboard, оставить только /transcribe',
   'Удалены /dashboard, /team, /tasks, /metrics, /briefing, /settings, /api/command, /api/metrics, agents.ts.',
   'done', 'medium', 'Mini App'),

  ('Бейджи в истории транскриптов',
   'Под каждым транскриптом в списке видны чипы: саммари / перевод / карусель / рилс / TG-пост. Обновляются после каждой генерации.',
   'done', 'medium', 'Polish'),

  ('Дашборд задач /admin',
   'Канбан с 4 колонками, CRUD через /api/tasks, фильтр по этапам, inline-редактирование, модалка детального вида.',
   'done', 'medium', 'Tooling')
) as v(title, description, status, priority, stage)
where not exists (select 1 from tasks);
