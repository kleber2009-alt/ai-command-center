# 🎙️ Media Pipeline · текст / голос / кружки

**Версия:** v1.0 · 16 мая 2026

Как менеджеры физически общаются от имени Ильи в Telegram и Instagram.

---

## 🎯 Что поддерживается

| Канал | Текст | Голосовое | Кружок | Фото клиента | Видео клиента |
|---|:---:|:---:|:---:|:---:|:---:|
| **Telegram** | ✓ send/receive | ✓ OGG voice | ✓ video_note | прием | прием |
| **Instagram** | ✓ send/receive | ✓ audio attachment | ⚠ video attachment* | прием | прием |

\* IG не поддерживает кружочки нативно — отправляется как обычное вертикальное видео.

---

## 🏗️ Архитектура

```
┌─────────────────────┐         ┌──────────────────────┐
│  TG/IG webhook      │         │  agents/flow.py      │
│  • receive text     │   ───→  │  classify → escal.   │
│  • download voice   │         │  → rag → generate    │
│  • transcribe       │         │  → decide_action 🆕  │
└─────────────────────┘         └──────────┬───────────┘
                                            │
                          ┌─────────────────┼─────────────────┐
                          ↓                 ↓                 ↓
                       TEXT              VOICE             CIRCLE
                          │                 │                 │
                          ↓                 ↓                 ↓
                  tg.send_text     media.text_to_voice  media.text_to_voice
                                          ↓                    ↓
                                  ffmpeg (OGG/Opus)    wav2lip (Sieve API)
                                          ↓                    ↓
                                  tg.send_voice        ffmpeg circle crop
                                                              ↓
                                                     tg.send_video_note
```

Для IG:
- VOICE → mp3 → storage.upload → public URL → ig.send_audio(URL)
- CIRCLE → mp3 → wav2lip → mp4 → storage.upload → ig.send_video(URL)

---

## 🧠 Decision logic (когда text / voice / circle)

`agents/nodes.py · decide_action_node` решает по правилам:

**КРУЖОК** (только TG) — если:
- стадия `pitch` + сегмент A + ICP score ≥ 70 → лицо строит доверие на старте презентации
- стадия `close` + сегмент A → видеть лицо повышает конверсию закрытия

**ГОЛОС** — если:
- клиент прислал voice/video_note → отвечаем тем же форматом (mirror)
- длинный ответ (>200 символов) в pitch/objections → голосом легче воспринять
- стадия `followup`, сегмент A/B → голос «вырывает» из ленты

**ТЕКСТ** — во всех остальных случаях.

Тесты правил → `tests/test_decision_node.py`.

---

## 📡 Что нужно настроить (по приоритету)

### 1. TG бот (минимум для теста, 10 минут)

```bash
# Создать бота через @BotFather → получить токен
# Положить в .env:
TG_BOT_TOKEN=123456:ABC...
TG_WEBHOOK_SECRET=<random>
ILYA_TG_CHAT_ID=<твой chat_id>  # узнать через @userinfobot

# Зарегистрировать webhook (после деплоя API):
curl -F "url=https://api.aisales.your-domain.com/webhooks/telegram" \
     -F "secret_token=$TG_WEBHOOK_SECRET" \
     "https://api.telegram.org/bot$TG_BOT_TOKEN/setWebhook"

# Теперь бот отвечает текстом. Без голоса/кружков пока.
```

### 2. ElevenLabs PVC (для голоса, ~30 минут на запись + клонирование)

```bash
# 1. Зарегистрируйся elevenlabs.io · Creator plan ($22/мес)
# 2. Voice Lab → Add Voice → Professional Voice Clone
# 3. Загрузи 30+ минут чистого аудио (твои подкасты)
# 4. Жди клонирования (~1-2 дня moderation)
# 5. Получи Voice ID
# 6. В .env:
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=<id из dashboard>

# Теперь TG voice работает.
```

### 3. Sieve для кружков (~10 минут setup, $0.03/min рендера)

```bash
# 1. Зарегистрируйся sieve.dev
# 2. Получи API key
# 3. Загрузи фото лица (квадрат, чёткое, нейтральное лицо) → MinIO
# 4. В .env:
SIEVE_API_KEY=...
ILYA_FACE_PHOTO_URL=https://media.your-domain.com/aisales-media/face/ilya.jpg

# Альтернатива Sieve: Replicate (replicate.com/wav2lip)
# Поменять SIEVE_* на REPLICATE_API_TOKEN, переписать wav2lip.py под их API
```

### 4. IG (1-3 дня · Meta модерация)

```bash
# 1. Facebook Business Manager → Apps → Create App
# 2. Instagram Graph API + Messenger Platform
# 3. Подключить Instagram Business Account
# 4. App Review для permissions (instagram_manage_messages)
# 5. Webhook subscription на messages
# 6. В .env:
IG_APP_SECRET=...
IG_PAGE_TOKEN=...
IG_VERIFY_TOKEN=aisales-verify-changeme
```

---

## 🧪 Локальный тест pipeline без боевых API

```bash
cd ~/ai-sales-system/code
source venv/bin/activate
make test
# 35 passed ✓

# Запустить mock-вебхук вручную
AISALES_MOCK=1 python -c "
import asyncio
from webhooks.telegram import handle_update

# Симулировать TG update
update = {
    'update_id': 1,
    'message': {
        'chat': {'id': 12345},
        'from': {'username': 'test_user'},
        'text': 'Привет, расскажи про автоматизацию SMM'
    }
}
result = asyncio.run(handle_update(update))
print(result)
"
```

---

## 📊 Стоимость в production (примерно)

| Действие | Стоимость | Источник |
|---|---|---|
| TG send/receive text | $0 | Telegram free |
| Whisper транскрипция (1 мин входящ.) | $0 (локально) или $0.006 (OpenAI) | faster-whisper |
| ElevenLabs TTS (1000 символов ответа) | ~$0.18 | $0.18/1K chars Creator |
| Wav2Lip circle (30s видео) | ~$0.02 | Sieve $0.03/min |
| IG send/receive | $0 | Meta free (но есть rate limits) |
| MinIO storage | $0 | self-hosted |
| **Итого один кружок + голос** | **~$0.20** | |
| **30 кружков/день** | **~$6/день · $180/мес** | |

---

## 🐛 Troubleshooting

**TG отправляет текст вместо кружка** → проверь:
- `decide_action_node` правила (sement A, score 70+, channel tg)
- `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` установлены
- `SIEVE_API_KEY` + `ILYA_FACE_PHOTO_URL` установлены
- ffmpeg есть в контейнере (`docker compose exec api ffmpeg -version`)

**Кружок без звука** → ffmpeg не закодировал аудио. Проверь логи:
```bash
docker compose logs api | grep ffmpeg
```

**Voice не транскрибируется** → нужен либо `faster-whisper` (локально), либо `OPENAI_API_KEY`.

**IG attachment 404** → URL невалидный или MinIO не доступен публично. Проверь:
```bash
curl -I https://media.your-domain.com/aisales-media/...
```

**Mock-режим не отключается** → `AISALES_MOCK` должен быть `0` (не пустой, не false).

---

## 📦 Структура кода media-pipeline

```
code/services/
├── media.py        ← TTS · text → voice (ElevenLabs + ffmpeg)
├── wav2lip.py      ← circle · audio → mp4 (Sieve API)
├── tg_client.py    ← TG · send text/voice/circle + download
├── ig_client.py    ← IG · send text/audio/video + download
└── storage.py      ← MinIO upload/download + presigned URLs

code/webhooks/
├── telegram.py     ← receive → transcribe → flow → respond
└── instagram.py    ← receive → transcribe → flow → respond

code/agents/
├── nodes.py        ← decide_action_node (text/voice/circle)
├── flow.py         ← DAG с decision routing
└── state.py        ← + action_reason, media_duration_target_s
```

---

## ✅ Чеклист готовности к запуску

- [ ] `TG_BOT_TOKEN` установлен · бот отвечает текстом
- [ ] `ILYA_TG_CHAT_ID` установлен · эскалации приходят в личку
- [ ] ffmpeg в контейнере · `make api-shell` → `ffmpeg -version`
- [ ] `ELEVENLABS_API_KEY` + `VOICE_ID` · TG voice работает
- [ ] `SIEVE_API_KEY` + `FACE_PHOTO_URL` · TG circle работает
- [ ] `MINIO_PUBLIC_BASE` доступен снаружи · IG attachments
- [ ] `IG_PAGE_TOKEN` + `APP_SECRET` · IG общается
- [ ] Тесты прошли · `make test` (35+ passed)

Когда всё ✓ — production ready.
