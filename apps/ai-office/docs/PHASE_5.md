# Phase 5 — Voice / Video AI-agents (MVP-0)

> Stage: **voice-only**, в работе.
> Дата: начато 16.05.2026.
> Scope v1: клон голоса + генерация voice-notes для предпросмотра.
> Scope v2 (следующий коммит): Telegram approval-бот для отправки от лица юзера.

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

| Путь | Что делает |
|---|---|
| `persona-train.html` | UI: запись с микрофона / загрузка / клон / тест-генерация |
| `netlify/functions/voice-clone.js` | `POST /api/voice-clone` — multipart audio → ElevenLabs → Supabase |
| `netlify/functions/voice-generate.js` | `POST /api/voice-generate` — text → TTS → Storage → URL |
| `netlify/functions/voice-list.js` | `GET /api/voice-list?owner=@handle` — активный голос + архив |
| `supabase/migrations/003_voice.sql` | Таблицы `voices`, `voice_generations` + storage bucket + RLS |
| `docs/PHASE_5.md` | Этот файл |

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

## Что дальше (Commit 2)

**Telegram approval flow:**
- `netlify/functions/tg-voice-webhook.js` — принимает Telegram updates
- Юзер пишет боту `/say <текст>` → бот вызывает `/api/voice-generate` → шлёт voice note **админу** с inline-кнопками `✅ Отправить · ✏️ Переписать · 🗑 Отменить`
- На `✅` → бот шлёт `sendVoice` оригинальному собеседнику
- Логирует `voice_generations.status = sent`, `tg_message_id`

**Что новое потребуется:**
- Новый bot token (или переиспользовать TG_BOT_TOKEN из notify-tg)
- `setWebhook` на `https://домен/api/tg-voice-webhook`
- Дополнительные env vars: `TG_VOICE_BOT_TOKEN`, `TG_ADMIN_CHAT_ID`

**Что не делаем в Commit 2:**
- Видео-кружки (HeyGen/D-ID) — Commit 3
- Instagram Graph API — Commit 4
- Auto-reply на входящие DM — Commit 5 (с большой осторожностью)

---

_Last updated: 2026-05-16, после Commit 1._
