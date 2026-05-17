# tg-agent

Telegram AI агент для групповых чатов. Читает каждое входящее
сообщение, классифицирует намерение через Claude и решает, нужно
ли отвечать или передать владельцу. Этот пакет — **этап 1** проекта
(чтение + классификация + лог решения). Реальные ответы, БД и
уведомления владельцу появятся в следующих итерациях.

## Что уже делает

- Long-polling-бот на [grammy](https://grammy.dev/) (без webhook'ов).
- LLM-классификатор на Claude Haiku 4.5 — 10 классов из ТЗ:
  `GENERAL_CHAT`, `QUESTION`, `PRODUCT_INTEREST`, `PRICE_REQUEST`,
  `OBJECTION`, `BUYING_INTENT`, `NEGATIVE`, `SUPPORT_REQUEST`,
  `OWNER_REQUEST`, `SPAM`.
- Decision engine: класс → действие (`IGNORE` / `REPLY` /
  `REPLY_SOFT` / `REPLY_AND_NOTIFY` / `NOTIFY_ONLY` /
  `DRAFT_FOR_OWNER`).
- Safety: при `confidence < CONFIDENCE_THRESHOLD` (по умолчанию
  0.7) действия `REPLY*` / `NOTIFY_ONLY` понижаются до
  `DRAFT_FOR_OWNER`. Класс `GENERAL_CHAT`/`NEGATIVE`/`SPAM` всегда
  остаётся `IGNORE`.
- Allowlist чатов через `ALLOWED_CHAT_IDS`.
- Структурированный JSON-лог в stdout (готово для Railway logs).

В этом этапе бот **не отправляет ответы** и **не пишет в БД** —
все решения только логируются. Это сознательно, чтобы можно было
посмотреть на качество классификатора на живых сообщениях до того,
как давать боту право говорить.

## Локальный запуск

```bash
cd apps/tg-agent
cp .env.example .env   # заполнить TELEGRAM_BOT_TOKEN и ANTHROPIC_API_KEY
npm install
npm run dev            # tsx watch
```

В отдельном чате с [@BotFather](https://t.me/BotFather):

1. `/newbot` → получить токен.
2. `/setprivacy` → выбрать бота → **Disable**. По умолчанию боты в
   группах в privacy mode видят только команды и упоминания —
   нам нужно читать все сообщения.
3. Добавить бота в тестовую группу как обычного участника.
4. Скопировать `chat.id` группы (из логов первого сообщения) и
   добавить его в `ALLOWED_CHAT_IDS` в `.env`.

## Деплой на Railway

1. New service → Deploy from Repo → выбрать монорепо.
2. Settings → **Root Directory**: `apps/tg-agent`.
3. Build: Dockerfile (автоопределение).
4. Variables: `TELEGRAM_BOT_TOKEN`, `ANTHROPIC_API_KEY`,
   `OWNER_TELEGRAM_ID`, `ALLOWED_CHAT_IDS`, опционально
   `CONFIDENCE_THRESHOLD`, `LOG_LEVEL`, `CLASSIFIER_MODEL`.
5. Deploy. Long-polling работает в одном экземпляре — **не
   масштабируйте реплики выше 1**, иначе Telegram будет отдавать
   апдейты по очереди разным процессам.

## Структура

```
src/
├── index.ts        # точка входа, graceful shutdown
├── bot.ts          # grammy: обработчик сообщений
├── classifier.ts   # Anthropic tool-use → Classification
├── decision.ts     # класс + confidence → Action
├── config.ts       # env → typed Config
├── logger.ts       # JSON-логгер
└── types.ts        # MessageClass, Action, Classification, Decision
```

## Что дальше

- Этап 2: реальная генерация ответов на `QUESTION` /
  `PRODUCT_INTEREST` и постинг в чат.
- Этап 3: база знаний (RAG по продуктам Ильи).
- Этап 4: статусы лидов в Supabase (новая таблица `leads`).
- Этап 5: уведомления владельцу в личку при
  `PRICE_REQUEST` / `BUYING_INTENT` / `OWNER_REQUEST` /
  `DRAFT_FOR_OWNER`.
- Этап 6: панель в `/admin` (Next.js) — лента классификаций,
  ручное одобрение черновиков, статусы лидов.
