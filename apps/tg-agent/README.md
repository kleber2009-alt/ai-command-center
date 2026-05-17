# tg-agent

Telegram AI агент для групповых чатов. Читает каждое сообщение,
классифицирует намерение, решает отвечать или молчать, пишет ответ
в стиле Ильи на основе базы знаний, ведёт CRM статус каждого
пользователя и уведомляет владельца на горячих лидах.

## Конвейер

`chats.touch → classifier → decision → leads.touchAndClassify →
[responder + reply] → messages.log → notifier.notifyOwner`

## Что внутри

- **Транспорт:** [grammy](https://grammy.dev/) long-polling. На
  Railway деплоится с **replicas = 1**.
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
- **Responder** (`src/responder.ts`): Claude Haiku 4.5 со стратегией
  под каждый класс. Tone-of-voice и стратегии — `src/prompts.ts`,
  изменения в одном файле. База знаний —
  `src/knowledge/knowledge_base.md`, markdown, который владелец
  редактирует напрямую. Запрещено выходить за пределы базы —
  при отсутствии факта бот честно говорит "уточню у Ильи".
- **CRM** (`src/db/leads.ts`): статус на (chat_id, user_id) с
  односторонней лестницей `new → cold → warm → hot → buyer`.
  `negative` залипает (только ручной override).
  `SUPPORT_REQUEST` → `support`, если не `buyer`.
- **Уведомления владельцу** (`src/notifier.ts`): DM с триаж-блоком
  на `REPLY_AND_NOTIFY` / `NOTIFY_ONLY` / `DRAFT_FOR_OWNER`.
  Владелец должен **один раз написать боту в личку** (Telegram
  блокирует исходящие DM от ботов к пользователям, которые ни разу
  не общались с ботом).
- **Kill switch:** `tg_chats.auto_reply` переключается из панели
  `/admin/tg`. Когда OFF — бот всё ещё классифицирует и пишет в БД,
  но не отвечает в чат и не дёргает владельца.
- **Allowlist** чатов через `ALLOWED_CHAT_IDS` для безопасности
  при тестах.
- **Логи:** JSON в stdout (готово для Railway).
- **БД:** Supabase. Без `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` бот
  продолжает работать без сохранения (stateless mode).

## Локальный запуск

```bash
cd apps/tg-agent
cp .env.example .env   # заполнить минимум TELEGRAM_BOT_TOKEN, ANTHROPIC_API_KEY
npm install
npm run dev            # tsx watch
```

Подготовка Telegram:

1. У [@BotFather](https://t.me/BotFather): `/newbot` → токен.
2. `/setprivacy` → бот → **Disable**. В privacy mode боты в группах
   видят только команды и упоминания — нам нужно всё.
3. Добавить бота в тестовую группу как обычного участника.
4. Найти `chat.id` группы в логах первого сообщения и положить его
   в `ALLOWED_CHAT_IDS`.
5. Для уведомлений: написать боту в личку `/start` со своего
   аккаунта владельца и положить свой `user_id` в `OWNER_TELEGRAM_ID`.

Supabase (опционально, но без него нет CRM, истории и kill switch
из `/admin/tg`):

1. В Supabase SQL Editor выполнить
   `supabase/migrations/005_tg_agent.sql`.
2. Положить `SUPABASE_URL` (project URL) и `SUPABASE_SERVICE_KEY`
   (service-role) в `.env`. Service-role ключ никогда не отдавать
   на клиент.

Базу знаний заполняй прямо в `src/knowledge/knowledge_base.md` —
секции `Продукты и цены`, `FAQ`, `Возражения`, `Кейсы`, `Правила`,
`Ссылки`. После правок перезапусти контейнер.

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
├── index.ts                       # точка входа + graceful shutdown
├── bot.ts                         # grammy: оркестрация конвейера
├── classifier.ts                  # Claude tool-use → Classification
├── responder.ts                   # Claude + KB → текст ответа
├── decision.ts                    # класс + confidence → Action
├── notifier.ts                    # DM владельцу
├── prompts.ts                     # все системные промпты + TOV
├── config.ts                      # env → typed Config
├── logger.ts                      # JSON-логгер в stdout
├── types.ts                       # MessageClass, Action, LeadStatus, ...
├── knowledge/
│   ├── index.ts                   # loader (один файл, кэш в памяти)
│   └── knowledge_base.md          # ЭТО редактирует владелец
└── db/
    ├── index.ts                   # Supabase client (graceful no-op)
    ├── chats.ts                   # tg_chats: upsert + auto_reply
    ├── leads.ts                   # tg_users: state machine
    └── messages.ts                # tg_messages: лог сообщений
```

## Этапы из ТЗ → код

| Этап | Где живёт |
| --- | --- |
| 1. Чтение и классификация | `bot.ts` + `classifier.ts` + `prompts.ts` |
| 2. Decision engine | `decision.ts` |
| 3. Генерация ответа | `responder.ts` + `prompts.ts` |
| 4. База знаний | `knowledge/knowledge_base.md` + `knowledge/index.ts` |
| 5. Лиды и CRM | `db/leads.ts` + `db/chats.ts` + `db/messages.ts` |
| 6. Уведомления владельцу | `notifier.ts` |
| 7. Панель управления | `apps/transcribe/src/app/admin/tg/page.tsx` |
