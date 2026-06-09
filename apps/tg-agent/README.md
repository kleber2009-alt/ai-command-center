# tg-agent

Telegram AI агент для групповых чатов. Читает каждое сообщение,
классифицирует намерение, решает отвечать или молчать, пишет ответ
в стиле Ильи на основе базы знаний, ведёт CRM статус каждого
пользователя и уведомляет владельца на горячих лидах.

Один процесс, одна SQLite-БД, один docker-compose. Ни Supabase,
ни внешних админок.

## Конвейер

`chats.touch → classifier → decision → leads.touchAndClassify →
[responder + reply] → messages.log → notifier.notifyOwner`

Параллельно в том же процессе крутится HTTP-админка (Hono) на
порту 8080 с basic auth — она читает ту же SQLite и переключает
auto_reply.

## Что внутри

- **Транспорт:** [grammy](https://grammy.dev/) long-polling.
  На одном хосте — replicas = 1.
- **Классификатор** (`src/classifier.ts`): Claude Haiku 4.5 +
  tool-use, 10 классов (`GENERAL_CHAT`, `QUESTION`,
  `PRODUCT_INTEREST`, `PRICE_REQUEST`, `OBJECTION`, `BUYING_INTENT`,
  `NEGATIVE`, `SUPPORT_REQUEST`, `OWNER_REQUEST`, `SPAM`).
- **Decision engine** (`src/decision.ts`): класс → действие
  (`IGNORE`/`REPLY`/`REPLY_SOFT`/`REPLY_AND_NOTIFY`/`NOTIFY_ONLY`/
  `DRAFT_FOR_OWNER`). Safety: `confidence < CONFIDENCE_THRESHOLD`
  (0.7 по умолчанию) понижает non-IGNORE до `DRAFT_FOR_OWNER` —
  кроме `GENERAL_CHAT`/`NEGATIVE`/`SPAM`, которые остаются
  `IGNORE`.
- **Responder** (`src/responder.ts`): Claude Haiku 4.5 со
  стратегией под каждый класс. Tone-of-voice и стратегии —
  `src/prompts.ts`. База знаний — `src/knowledge/knowledge_base.md`,
  markdown, который владелец редактирует напрямую. Запрещено
  выходить за пределы базы — при отсутствии факта бот честно
  говорит "уточню у Ильи".
- **CRM** (`src/db/leads.ts`): статус на (chat_id, user_id) с
  односторонней лестницей `new → cold → warm → hot → buyer`.
  `negative` залипает, `SUPPORT_REQUEST` → `support`, если не
  `buyer`.
- **Уведомления владельцу** (`src/notifier.ts`): DM с триаж-блоком
  на `REPLY_AND_NOTIFY` / `NOTIFY_ONLY` / `DRAFT_FOR_OWNER`.
  Владелец должен один раз написать боту `/start`.
- **HQ-команды владельца** (`src/office_hq.ts` + `src/owner_commands.ts`):
  `/hq`, `/brief`, `/standup`, `/focus`, `/escalations`, `/decide`
  ходят в `apps/command-center` и возвращают штабные сводки как от
  одной организованной команды, а не от россыпи ботов.
- **Kill switch:** `tg_chats.auto_reply` переключается из админки.
  Когда OFF — бот всё ещё классифицирует и пишет в БД, но не
  отвечает и не дёргает владельца.
- **Хранилище:** SQLite (`better-sqlite3`). Файл по умолчанию
  `./data/tg-agent.db`. Схема (`src/db/schema.ts`) применяется
  автоматически при старте — никаких миграций руками.
- **Админ-панель** (`src/admin/`): встроенный Hono-сервер +
  vanilla-JS UI с Tailwind via CDN. Basic auth через
  `ADMIN_USERNAME` + `ADMIN_PASSWORD`. Без `ADMIN_PASSWORD`
  админ-сервер просто не стартует.
- **Логи:** JSON в stdout.

## Деплой на Хетцнер (docker-compose)

```bash
git clone <repo> && cd ai-command-center/apps/tg-agent
cp .env.example .env       # заполнить все обязательные поля
docker compose up -d --build
docker compose logs -f
```

Что нужно положить в `.env`:

| | |
|---|---|
| `TELEGRAM_BOT_TOKEN` | от @BotFather |
| `ANTHROPIC_API_KEY`  | для классификатора и ответчика |
| `OWNER_TELEGRAM_ID`  | ваш numeric id (узнать у @userinfobot) |
| `ALLOWED_CHAT_IDS`   | id групп через запятую |
| `ADMIN_PASSWORD`     | пароль для админки на :8080 |
| `ADMIN_USERNAME`     | по умолчанию `admin` |
| `OFFICE_HQ_BASE_URL` | base URL `command-center`, например `https://command-center.46-62-215-11.nip.io` |
| `OFFICE_HQ_WEB_URL`  | публичный URL для deep-link в `/office/decisions` |

Подготовка Telegram:

1. У [@BotFather](https://t.me/BotFather): `/newbot` → токен.
2. `/setprivacy` → бот → **Disable**. В privacy mode боты в группах
   видят только команды и упоминания.
3. Добавить бота в группу как обычного участника.
4. Написать боту в личку `/start` со своего аккаунта — иначе
   Telegram заблокирует исходящие DM от бота.
5. Запустить compose, посмотреть `docker compose logs` для
   первого сообщения в группе → скопировать `chat.id` →
   положить в `ALLOWED_CHAT_IDS`, `docker compose restart`.

Открыть админку: `http://<host>:8080/`, логин/пароль из `.env`.

### HTTPS

`docker-compose.yml` отдаёт 8080 голым HTTP — это для теста на
одной машине. В проде поставьте перед ним TLS-терминатор. Самый
простой путь:

- **Caddy с автоматическим Let's Encrypt:**
  ```Caddyfile
  tg.your-domain.tld {
    reverse_proxy 127.0.0.1:8080
  }
  ```
- **Cloudflare Tunnel** — бесплатно, без открытия порта в
  интернет, в `cloudflared` указать сервис
  `http://localhost:8080`.

В обоих случаях `ports:` в compose можно поменять на
`"127.0.0.1:8080:8080"`, чтобы 8080 не светился на публичном IP.

## Локальная разработка

```bash
cd apps/tg-agent
cp .env.example .env
npm install
npm run dev
```

База знаний правится прямо в
`src/knowledge/knowledge_base.md` — секции `Продукты и цены`,
`FAQ`, `Возражения`, `Кейсы`, `Правила`, `Ссылки`. После правок
перезапустить процесс (dev-режим перезапускается сам через `tsx
watch`).

## Структура

```
apps/tg-agent/
├── docker-compose.yml             # развёртывание на Хетцнере
├── Dockerfile                     # multi-stage build, native-deps
├── package.json                   # ESM, "type": "module"
├── tsconfig.json
├── .env.example
├── scripts/
│   └── copy-assets.mjs            # копирует .md и .html в dist/
└── src/
    ├── index.ts                   # точка входа + graceful shutdown
    ├── bot.ts                     # grammy: оркестрация конвейера
    ├── classifier.ts              # Claude tool-use → Classification
    ├── responder.ts               # Claude + KB → текст ответа
    ├── decision.ts                # класс + confidence → Action
    ├── notifier.ts                # DM владельцу
    ├── prompts.ts                 # все системные промпты + TOV
    ├── config.ts                  # env → typed Config
    ├── logger.ts                  # JSON-логи в stdout
    ├── types.ts                   # MessageClass, Action, LeadStatus, …
    ├── admin/
    │   ├── server.ts              # Hono + basic auth + JSON API
    │   └── ui.html                # vanilla SPA, Tailwind via CDN
    ├── knowledge/
    │   ├── index.ts               # loader (один файл, кэш в памяти)
    │   └── knowledge_base.md      # ЭТО редактирует владелец
    └── db/
        ├── index.ts               # better-sqlite3 + pragmas
        ├── schema.ts              # SQL DDL, embedded string
        ├── chats.ts               # tg_chats: upsert / list / kill switch
        ├── leads.ts               # tg_users: state machine
        └── messages.ts            # tg_messages: лог + чтение
```

## Этапы из ТЗ → код

| Этап | Где живёт |
| --- | --- |
| 1. Чтение и классификация | `bot.ts` + `classifier.ts` + `prompts.ts` |
| 2. Decision engine | `decision.ts` |
| 3. Генерация ответа | `responder.ts` + `prompts.ts` |
| 4. База знаний | `knowledge/knowledge_base.md` |
| 5. Лиды и CRM | `db/leads.ts` + `db/chats.ts` + `db/messages.ts` |
| 6. Уведомления владельцу | `notifier.ts` |
| 7. Панель управления | `admin/server.ts` + `admin/ui.html` |

## Бэкап

Один файл: `tg-agent-data` docker volume (по умолчанию
`/var/lib/docker/volumes/tg-agent-data/_data/tg-agent.db`).
Простейший бэкап в крон:

```bash
0 4 * * * docker run --rm -v tg-agent-data:/data -v /backup:/backup \
  alpine cp /data/tg-agent.db /backup/tg-agent.$(date +\%F).db
```

## Что НЕ сделано

- Авторизация админки — только basic auth поверх HTTP. Перед
  публичным интернетом обязательно HTTPS (Caddy / Cloudflare).
- Ручное одобрение `DRAFT_FOR_OWNER` (кнопки в DM) — пока
  владелец просто видит черновик и отвечает руками.
- Backfill старых сообщений из истории чата — бот видит только
  то, что приходит после старта.
