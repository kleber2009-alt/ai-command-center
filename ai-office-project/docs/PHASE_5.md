# Phase 5 — Voice / Video AI-agents (MVP-0)

> Stage: **voice-only**, в работе.
> Дата: начато 16.05.2026.
> · **Commit 1 (✅):** клон голоса + генерация voice-notes для предпросмотра.
> · **Commit 2 (✅):** Telegram Voice Composer Bot — owner пишет боту, получает voice-note своим голосом и пересылает кому угодно.
> · **Commit 3 (✅):** одноразовые binding-токены — защита от impersonation в боте.
> · **Commit 4 (✅):** subscriber-relay flow — подписчики пишут боту, owner аппрувит AI-ответы голосом.
> · **Commit 5 (далее):** видео-кружки через D-ID или multi-tenant relay.

---

## Что есть сейчас (Commit 1)

Бэкенд + UI для **клонирования голоса** через ElevenLabs и тестовой
генерации voice-notes. **Никакого автопостинга нет** — только локальный
предпросмотр в браузере.

```
[браузер] /persona-train
    │  multipart audio
    ▼
[Netlify Fn] /api/voice-clone ──▶ ElevenLabs /v1/voices/add
    │                                       │
    │   ◀──── { voice_id } ────────────────┘
    │
    ▼
[Supabase] public.voices  (one active per owner_handle)

[браузер] /persona-train (тест)
    │  { text, voice_id }
    ▼
[Netlify Fn] /api/voice-generate ──▶ ElevenLabs /v1/text-to-speech/{id}
    │                                       │
    │   ◀──── mp3 audio ────────────────────┘
    │
    ▼
[Supabase Storage] voice-notes/{owner}/{ts}.mp3
[Supabase Table]    public.voice_generations (лог)
    │
    ▼
[браузер] плеер + download
```

---

## Файлы

| Путь | Commit | Что делает |
|---|---|---|
| `persona-train.html` | 1 | UI: запись с микрофона / загрузка / клон / тест-генерация |
| `netlify/functions/voice-clone.js` | 1 | `POST /api/voice-clone` — multipart audio → ElevenLabs → Supabase |
| `netlify/functions/voice-generate.js` | 1 | `POST /api/voice-generate` — text → TTS → Storage → URL |
| `netlify/functions/voice-list.js` | 1 | `GET /api/voice-list?owner=@handle` — активный голос + архив |
| `netlify/functions/tg-voice-webhook.js` | 2,3 | `POST /api/tg-voice-webhook` — Telegram Bot webhook |
| `netlify/functions/_shared/voice-pipeline.js` | 2 | Общая логика TTS + Storage + лог (используется в `voice-generate` и `tg-voice-webhook`) |
| `netlify/functions/voice-binding-token.js` | 3 | `POST /api/voice-binding-token` — одноразовый код для привязки бота |
| `supabase/migrations/003_voice.sql` | 1 | Таблицы `voices`, `voice_generations` + storage bucket + RLS |
| `supabase/migrations/004_voice_bot.sql` | 2 | Таблица `voice_bot_users` + TG-колонки в `voice_generations` |
| `supabase/migrations/005_binding_tokens.sql` | 3 | Таблица `voice_binding_tokens` (одноразовые коды привязки) |
| `docs/PHASE_5.md` | — | Этот файл |

---

## Setup (что нужно сделать вручную)

### 1. Supabase

В Supabase Dashboard → SQL Editor → запустить
[`supabase/migrations/003_voice.sql`](../supabase/migrations/003_voice.sql).

Проверить:
- Таблицы `public.voices` и `public.voice_generations` созданы
- Bucket `voice-notes` существует и **public**
- Storage policy `"voice-notes public read"` активна

### 2. Netlify env vars

Site Settings → Environment Variables — добавить:

| Var | Где взять | Зачем |
|---|---|---|
| `ELEVENLABS_API_KEY` | elevenlabs.io → Profile → API Keys | Клон + TTS |
| `SUPABASE_URL` | `https://cslvbnladhfjrdbtnwkm.supabase.co` (уже в `config.js`) | Запись в БД и Storage |
| `SUPABASE_SERVICE_KEY` | Supabase → Settings → API → `service_role` key | Bypass RLS для записи |
| `SUPABASE_ANON_KEY` | Supabase → Settings → API → `anon` key | Для `/api/voice-list` (опц.) |

⚠ **`SUPABASE_SERVICE_KEY` нельзя класть в client JS** — он даёт полный
доступ к БД. Только в env vars Netlify.

### 3. ElevenLabs план

- **Free** (бесплатно): 10k символов/мес. Голос клонировать **нельзя** (только Instant Clone из 1 сэмпла после оплаты Starter).
- **Starter** ($5/мес): 30k символов, 10 custom voices, Instant Voice Clone.
- **Creator** ($22/мес): 100k символов, 30 custom voices, Professional Voice Clone из 30+ мин аудио.

Для MVP-0 хватит **Starter**.

### 4. Деплой

Netlify должен деплоиться **из GitHub**, не из Drop — Functions не работают
в Drop-режиме. Тек. репо ветка: `claude/unpack-project-gU5md` →
после merge в `main` Netlify подхватит автоматически.

---

## Как пользоваться

1. Открыть `/persona-train` (или `/voice`)
2. Ввести Telegram-handle или email (это уникальный ключ владельца)
3. Записать с микрофона **60+ секунд** чистой речи (или загрузить mp3/m4a)
4. Нажать «Создать голос» → подождать 5–15 сек
5. В блоке «Активный голос» появится карточка с `provider_voice_id`
6. Ввести текст и нажать «🎧 Сгенерировать» → послушать результат

Аудио хранится в Supabase Storage публично и доступно по URL вида
`https://cslvbnladhfjrdbtnwkm.supabase.co/storage/v1/object/public/voice-notes/{owner}/{ts}.mp3`

---

## Безопасность и этика

**Заложено в архитектуру:**
- Клонирование привязано к `owner_handle` (юзер вводит сам) — нет
  массовой загрузки чужих голосов через UI.
- Все генерации логируются в `public.voice_generations` с
  `text`, `audio_path`, `created_at` — полный аудит.
- В MVP-0 **нет автопостинга**. Только генерация и предпросмотр.
- `/persona-train` помечен `noindex` — не попадёт в поиск.

**Что ещё нужно сделать (для Commit 2):**
- Approval-gate: AI **не отправляет** ничего без явного `✅` в TG-боте.
- Дисклеймер «AI-assisted» как опция в настройках.
- Логирование `tg_message_id` и адресата для каждой отправки.
- Rate-limit на количество сообщений в час от одного владельца.

**Что должен решить владелец проекта:**
- Согласие подписчиков (если AI отвечает в их личке).
- Юридический дисклеймер на странице регистрации.
- Soft watermark в TTS-аудио для трассировки утечек (ElevenLabs делает
  опционально, см. `optimize_streaming_latency` / `output_format`).

---

## API contracts

### `POST /api/voice-clone`

```http
POST /api/voice-clone
Content-Type: multipart/form-data

owner_handle:    @ilia_paliy            # required
display_name:    Илья                   # optional
sample_seconds:  120                    # optional, для аналитики
files:           <File: sample1.mp3>    # required, до 11 MB суммарно
files:           <File: sample2.m4a>    # можно несколько
```

Ответ 200:
```json
{
  "ok": true,
  "voice_id": "550e8400-e29b-41d4-a716-446655440000",
  "provider_voice_id": "21m00Tcm4TlvDq8ikWAM",
  "display_name": "Илья",
  "owner_handle": "@ilia_paliy",
  "created_at": "2026-05-16T16:00:00Z"
}
```

Ошибки: 400 (валидация), 413 (>11 MB), 502 (ElevenLabs down),
503 (env vars не заданы).

### `POST /api/voice-generate`

```http
POST /api/voice-generate
Content-Type: application/json

{
  "text": "Привет!",
  "voice_id": "550e8400-...",        // либо provider_voice_id, либо owner_handle
  "model_id": "eleven_multilingual_v2",  // optional
  "stability": 0.55,                  // optional, 0..1
  "similarity_boost": 0.85,           // optional, 0..1
  "source": "persona-train"           // optional, для аналитики
}
```

Ответ 200:
```json
{
  "ok": true,
  "generation_id": "...",
  "audio_url": "https://cslv.../storage/.../12345.mp3",
  "audio_path": "@ilia_paliy/12345.mp3",
  "char_count": 7,
  "bytes": 18432,
  "provider_voice_id": "21m00Tcm4TlvDq8ikWAM"
}
```

### `GET /api/voice-list?owner=@handle`

```json
{
  "ok": true,
  "current": { "id": "...", "display_name": "...", "provider_voice_id": "...", ... },
  "archived": [ { "id": "...", "archived_at": "..." } ]
}
```

---

## Commit 2 — Telegram Voice Composer Bot

**Идея и safety model:** простейший паттерн «voice composer».
Owner пишет боту → бот озвучивает текст клонированным голосом → пришлёт
voice-note **обратно тому же чату**. Дальше owner вручную пересылает
voice-note кому захочет. Это и есть approval-gate — Telegram-нативная
пересылка как осознанный шаг. Бот сам никуда не шлёт.

**Поток:**
```
1. Owner создаёт voice на /persona-train (Commit 1)
2. Открывает чат с @your_voice_bot, шлёт /start @owner_handle
3. Бот проверяет что voice существует → биндит chat_id ↔ owner_handle в voice_bot_users
4. Owner шлёт текст → бот показывает "🎙 запись..." → /api/voice-generate
   → присылает voice-note (Telegram fetches MP3 из публичного Supabase Storage URL)
5. Owner пересылает voice-note куда нужно через нативный TG-share
```

### Команды бота

| Команда | Что делает |
|---|---|
| `/start` | Приветствие |
| `/start @handle` | Привязать этот чат к голосу `@handle` |
| `/voice` | Показать текущий привязанный голос |
| `/settings` | TTS-настройки (read-only пока) |
| `/clear` | Отвязать чат |
| `/help` | Команды |
| `любой текст` | Озвучить и прислать voice-note |

### Setup

**1. Создать бота у @BotFather:**
```
/newbot → AI Growth Office Voice → @your_voice_bot
→ скопировать токен
```

**2. Env vars в Netlify** (в дополнение к Commit 1):

| Var | Где взять | Зачем |
|---|---|---|
| `TG_VOICE_BOT_TOKEN` | @BotFather | Новый бот для voice flow |
| `TG_WEBHOOK_SECRET` | сгенерируй сам, любая строка 32+ симв. | (опционально) защита webhook |

**3. Прогнать миграцию:**

В Supabase SQL Editor запустить
[`supabase/migrations/004_voice_bot.sql`](../supabase/migrations/004_voice_bot.sql).

**4. Установить webhook** (один раз, после деплоя):

```bash
curl -X POST "https://api.telegram.org/bot$TG_VOICE_BOT_TOKEN/setWebhook" \
  -d "url=https://ai-growth-office.ru/api/tg-voice-webhook" \
  -d "secret_token=$TG_WEBHOOK_SECRET" \
  -d 'allowed_updates=["message","callback_query"]'
```

Проверка:
```bash
curl "https://api.telegram.org/bot$TG_VOICE_BOT_TOKEN/getWebhookInfo"
```

Health-check Function:
```bash
curl https://ai-growth-office.ru/api/tg-voice-webhook
# → { "ok": true, "service": "tg-voice-webhook" }
```

**5. Настроить команды у @BotFather:**
```
/setcommands → @your_voice_bot
start - Привязать чат к голосу
voice - Показать активный голос
settings - Настройки TTS
clear - Отвязать чат
help - Помощь
```

### Безопасность Commit 2

- ✅ Никакого автопостинга. Бот шлёт только в чат, который ему написал.
- ✅ Каждая генерация логируется в `voice_generations` с `tg_chat_id`, `tg_message_id`, `text`.
- ✅ Webhook опционально защищён `TG_WEBHOOK_SECRET` (заголовок `X-Telegram-Bot-Api-Secret-Token`).
- ✅ Owner-binding явный через `/start @handle` — нельзя случайно озвучить чужим голосом.
- ✅ **Commit 3 закрыл impersonation:** `/start @handle` без одноразового
  токена отклоняется. Токен (6 символов, формат `XXX-XXX`) выдаётся
  на `/persona-train` после создания голоса, действует 1 час, одноразовый.

---

## Commit 3 — Handle verification

**Что делает:** закрывает дыру Commit 2, когда любой, знающий чужой
handle, мог биндить свой TG-чат к чужому голосу.

**Flow:**
```
1. Owner создал голос на /persona-train
2. Жмёт "🔑 Получить код для Telegram-бота"
   → POST /api/voice-binding-token { owner_handle }
   → 200 { token: "H3K-9PT", expires_at, voice_id }
3. UI показывает код в большом блоке + кнопку открыть бота
4. Owner идёт в бот, шлёт: /start @handle H3K-9PT
5. Бот проверяет токен:
   · существует?
   · принадлежит этому handle?
   · не использован?
   · не просрочен (<1 час)?
6. Если ОК → POST /rest/v1/voice_bot_users (upsert) + PATCH token.used_at
7. Если NOT ОК → отказ с подсказкой "получи новый код"
```

**Token формат:** 6 символов из `ABCDEFGHJKLMNPQRTUVWXY23456789` (исключены
0/O/1/I/5/S — амбигуэтные при наборе), формат `XXX-XXX`. ~30B комбинаций,
1 час TTL, single-active per handle (новый код инвалидирует прошлые),
rate-limit 5/час на handle.

**Файлы:** `voice-binding-token.js`, `005_binding_tokens.sql`,
update к `tg-voice-webhook.js` (`cmdStart` теперь требует токен),
блок «Получить код для Telegram-бота» в `persona-train.html`.

**Что осталось настроить:**
- Прогнать `005_binding_tokens.sql` в Supabase
- (Опц.) задать `window.AIO_VOICE_BOT_USERNAME` где-нибудь в global config,
  иначе по умолчанию `aio_voice_bot` — это меняет только ссылку
  «открыть бота», команда `/start ... TOKEN` работает с любым ботом.

---

## Что дальше (Commit 4 — на выбор)

**Вариант A — subscriber relay flow** (расширение voice-бота):
- Юзеры пишут боту напрямую → бот показывает owner'у входящие → owner выбирает «AI-ответ / Свой текст» → preview voice → ✅ отправить
- Полный approval-pipeline, новая таблица `conversations` / `pending_replies`

**Вариант B — видео-кружки через D-ID** (новый media-canal):
- Owner загружает 1 фото лица в `persona-train.html`
- Новая Function `/api/video-generate` → D-ID Talks API → mp4 → `sendVideoNote`
- ~1 неделя работы, +$5/мес D-ID

**Вариант C — handle verification** (security):
- Verification-code в `persona-train.html` после клонирования голоса
- Owner вводит code в TG-боте при `/start` → доказывает что владеет handle
- Без этого Commit 2 уязвим к impersonation

**Что не делаем сейчас:**
- Instagram Graph API — после Phase 1 (тарифы + платежи)
- Полностью авто-reply на DM — это юридически и этически тяжело, нужен бизнес-кейс

---

## Commit 4 — Subscriber Relay Flow

> Реализовано в self-hosted backend (`infra/services/ai-office/lib/tg-relay.js`).
> Netlify-Function-версия Commit 1-3 не имеет relay-логики — фича доступна только после миграции на свой сервер.

**Идея:** подписчик пишет боту → owner получает уведомление с inline-кнопками →
жмёт «🤖 AI-ответ» (Claude генерит текст) → «🎧 Озвучить» (ElevenLabs делает voice) →
«✅ Отправить» (бот пересылает voice-note подписчику от имени owner).

**Поток:**

```
[Bob — подписчик] DMs @your_voice_bot: "Привет, расскажи про тариф Pro"
                            │
                            ▼
                  bot resolves chat_id NOT in voice_bot_users
                  → handleSubscriberInbound(msg)
                            │
                            ▼
                  INSERT voice_relay_inbound (status=pending)
                            │
                            ▼
                  bot отправляет [Alice — owner]:
                  ┌────────────────────────────────────────┐
                  │ 📩 Входящее от @bob:                    │
                  │ "Привет, расскажи про тариф Pro"        │
                  │ [🤖 AI-ответ] [🔇 Пропустить] [🗑]     │
                  └────────────────────────────────────────┘
                            │
                            ▼  Alice жмёт [🤖 AI-ответ]
                            ▼
                  Claude (haiku-4-5) генерит draft:
                  "Pro — это 1990₽/мес, все 4 отдела…"
                            │
                            ▼  edit bubble + новые кнопки:
                  [🎧 Озвучить] [♻️ Другой вариант] [🗑]
                            │
                            ▼  Alice жмёт [🎧 Озвучить]
                            ▼
                  ElevenLabs TTS (голос Alice) → mp3 → Storage
                  bot шлёт Alice preview voice-note
                            │
                            ▼  edit bubble:
                  [✅ Отправить] [🔄 Заново озвучить] [🗑]
                            │
                            ▼  Alice жмёт [✅ Отправить]
                            ▼
                  bot шлёт voice-note Bob'у (как reply на его сообщение)
                  voice_generations.recipient_chat_id = Bob's chat_id
                  voice_relay_inbound.status = 'sent'
```

### Защита от злоупотреблений

- **Single-tenant в v1.** Бот привязан к ОДНОМУ owner — задаётся в env `TG_VOICE_BOT_OWNER=@alice` или берётся первый row из `voice_bot_users`. Без owner — бот отвечает «настройка не завершена».
- **Owner-approval строго обязателен** на каждом шаге. Бот **никогда** не шлёт voice-note без явного `[✅ Отправить]`.
- **Полный аудит-лог** в `voice_relay_inbound` — `text`, `draft_text`, `subscriber_chat_id`, `subscriber_message_id`, статус и timestamps.
- **MAX_INBOUND_LEN = 2000 символов** — против спама.
- **Draft tokens ≤ 320** — против раздутых ответов от Claude.

### State machine

```
pending     ──[🤖]──▶ drafted ──[🎧]──▶ voice_ready ──[✅]──▶ sent
   │                     │                  │                  ▲
   │                     └──[♻️ regenerate]─┘                  │
   └──[🔇]──▶ ignored    ↓                  ↓                  │
   └──[🗑]──▶ rejected   [🗑]──▶ rejected    [🗑]──▶ rejected  │
                                                               │
                              (всё кроме sent можно прервать)──┘
```

### Файлы Commit 4

| Файл | Что делает |
|---|---|
| `infra/db/init/002_relay.sql` | Таблица `voice_relay_inbound` + индексы + auto-update триггер |
| `infra/services/ai-office/lib/tg-relay.js` | Весь relay-флоу: `handleSubscriberInbound`, `handleRelayCallback`, рендер approval-bubble, state машина |
| `infra/services/ai-office/lib/anthropic.js` | Минимальная обёртка Claude `chat()` — для AI-drafts |
| `infra/services/ai-office/lib/tg-voice-bot.js` | Маршрутизатор: owner → voice composer / subscriber → relay |
| `infra/.env.example` | Новая переменная `TG_VOICE_BOT_OWNER` |

### Setup для уже-развёрнутого сервера

```bash
# 1) Применить SQL миграцию к существующей БД
docker exec -i infra-postgres-1 psql -U aio -d aio < ~/ai-command-center/infra/db/init/002_relay.sql

# 2) (опц.) задать TG_VOICE_BOT_OWNER в .env, иначе берётся первый bound owner
nano ~/ai-command-center/infra/.env
# добавить:   TG_VOICE_BOT_OWNER=@your_handle

# 3) Подтянуть код и пересобрать
cd ~/ai-command-center && git pull
cd infra && docker compose up -d --build ai-office

# 4) Проверка
docker compose logs ai-office --tail=20
docker exec infra-postgres-1 psql -U aio -d aio -c "\d voice_relay_inbound"
```

### Что ещё планируется в Commit 5+

- **Многотенантность:** разные subscribers → разные owners (через deep-link `t.me/bot?start=alice` для роутинга)
- **Кастомный draft:** owner пишет свой ответ вместо AI-генерированного (требует session-state в боте)
- **Видео-кружки через D-ID:** voice-note + lip-sync видео → `sendVideoNote`
- **Style match:** fine-tuned Claude промпт на 30+ постах owner'а
- **Конверсация:** хранить контекст диалога с подписчиком (несколько turns)

---

_Last updated: 2026-05-17, после Commit 4 (subscriber relay)._
