# Persona Train

Отдельный SaaS-кит для обучения голоса и аватара на твоих голосовых/кружках.
Форк функционала AI Growth Office'а (`/persona-train.html`) в собственный проект:
**свой домен, свой бот, свой кабинет**. Бэкенд шерит таблицу `voices` с
`infra-postgres-1.aio` — чтобы голос был один и тот же во всех продуктах.

- Сайт: https://persona-train.46-62-215-11.nip.io/
- Бот: [@ilia_pali0_bot](https://t.me/ilia_pali0_bot)
- Контейнер: `persona-train-web` (Next.js 15 :3030)
- DB: `infra-postgres-1.aio` (расшаренно с ai-office)
- Storage: MinIO `persona-train-media` (фоллбэк — локальный volume)

## Структура

```
src/
├── app/
│   ├── page.tsx                  ─ landing
│   ├── cabinet/                  ─ внутренний кабинет
│   │   ├── page.tsx              ─ статус + samples + binding-token
│   │   ├── train/page.tsx        ─ запись/upload + sample / clone-now
│   │   ├── generate/page.tsx     ─ TTS test
│   │   ├── analyze/page.tsx      ─ vk Sonnet 4.6 → voice profile
│   │   └── avatar/page.tsx       ─ кружки → avatar samples
│   └── api/
│       ├── voice/
│       │   ├── clone           POST   one-shot clone (legacy parity)
│       │   ├── list            GET    current + archived + sample stats
│       │   ├── sample          POST   accumulate one sample
│       │   ├── train           POST   pack pending → IVC → new voice_id
│       │   ├── generate        POST   TTS
│       │   ├── analyze         POST   transcript → Claude profile
│       │   └── binding-token   POST   one-time code for bot /start
│       ├── avatar/
│       │   ├── sample          POST   accumulate one kruzhok
│       │   ├── train           POST   pack pending → HeyGen [stub]
│       │   └── list            GET    avatars
│       ├── telegram/
│       │   └── webhook         POST   TG bot updates
│       └── health              GET
└── lib/
    ├── db.ts             pg pool
    ├── elevenlabs.ts     IVC + TTS
    ├── anthropic.ts      Sonnet 4.6 wrapper
    ├── voice-pipeline.ts resolve voice → TTS → store → return
    ├── voice-analyzer.ts port of voice_analyzer.py
    ├── storage.ts        MinIO S3 + local fs fallback
    └── tg-bot.ts         @ilia_pali0_bot handler (single-owner)
```

## Что делает бот @ilia_pali0_bot

Single-tenant: пускает только owner (определяется по `OWNER_TELEGRAM_ID` или `OWNER_HANDLE`).

- 🎤 **voice / audio**  → копится в `voice_samples`. На пороге `AUTO_RETRAIN_SECONDS` (default 180с) бот в ответе подсказывает что готов /train.
- ⭕ **video_note / video** → копится в `avatar_samples` для будущего обучения аватара (HeyGen Custom Avatar).
- 📝 **text** → отвечает voice-note твоим голосом через активный `voice_id`.

Команды:
- `/voice` — показать активный voice
- `/samples` — счётчик + прогресс-бар к auto-train
- `/train` — переклонировать voice_id из pending samples
- `/reset_samples` — выбросить pending
- `/avatar` — запустить avatar train pipeline (provider call пока stub)
- `/analyze` — заглушка, реальный analyze пока через `/cabinet/analyze`
- `/help` — список команд

## Деплой

### 1. Применить миграцию (общая `aio` DB)

```bash
ssh prod 'docker exec -i infra-postgres-1 psql -U aio -d aio' \
  < persona-train/migrations/001_persona_train.sql
```

ai-office продолжит работать — миграция только добавляет таблицы (`voice_samples`,
`avatar_samples`, `avatars`, `voice_analyses`), не трогает существующие.

### 2. Создать `.env` на проде

Скопировать из `.env.example`, заполнить:

```bash
DATABASE_URL=postgresql://aio:<password>@infra-postgres-1:5432/aio
ELEVENLABS_API_KEY=sk_...                # из ai-office .env
ANTHROPIC_API_KEY=sk-ant-...             # из aisales-app-v2/code/.env
ANTHROPIC_MODEL=claude-sonnet-4-6
TG_BOT_TOKEN=<токен от @ilia_pali0_bot>  # см. ниже
TG_WEBHOOK_SECRET=<random hex 32>
OWNER_HANDLE=@ilia_pali0
OWNER_TELEGRAM_ID=<твой tg user_id>
PUBLIC_BASE_URL=https://persona-train.46-62-215-11.nip.io
AUTO_RETRAIN_SECONDS=180

# Optional MinIO S3 (без этих env — пишет в /data/voice-notes)
S3_ENDPOINT=http://aisales-minio:9000
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_BUCKET=persona-train-media
S3_PUBLIC_URL=https://persona-train.46-62-215-11.nip.io/media
```

Где брать токен @ilia_pali0_bot — он же `TG_BOT_TOKEN` в `aisales-app-v2/code/.env`
(тот же бот). Если нет — `/newbot` у BotFather.

### 3. Build + run

```bash
# с Mac:
rsync -azP --delete \
  /Users/iliapaliy/aisales-app-v2/persona-train/ \
  prod:/home/aisales/persona-train/source/

# на проде:
ssh prod
cd /home/aisales/persona-train/source
cp .env.example .env && nano .env   # заполнить
docker compose build --no-cache --pull --provenance=false --sbom=false
docker compose up -d
docker logs persona-train-web --tail 50
```

### 4. Caddy

Добавить блок из `caddy-snippet.txt` в `/etc/caddy/Caddyfile`, потом:

```bash
ssh prod 'touch /var/log/caddy/persona-train.log && chown caddy:caddy /var/log/caddy/persona-train.log'
ssh prod 'systemctl reload caddy'
```

### 5. TG webhook

```bash
curl -X POST "https://api.telegram.org/bot${TG_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://persona-train.46-62-215-11.nip.io/api/telegram/webhook",
    "secret_token": "'"$TG_WEBHOOK_SECRET"'",
    "drop_pending_updates": true
  }'
```

### 6. Verify

```bash
# health
curl -s https://persona-train.46-62-215-11.nip.io/api/health | jq

# существующий голос виден?
curl -s 'https://persona-train.46-62-215-11.nip.io/api/voice/list?owner=@ilia_pali0' | jq

# отправь в бот voice-note → проверь что samples появились
ssh prod 'docker exec infra-postgres-1 psql -U aio -d aio -c "select id, source, duration_seconds, created_at from voice_samples order by created_at desc limit 5"'

# /train в бота → должен появиться новый row в voices
```

## Что НЕ доделано (явные стабы)

1. **`/api/avatar/train` — реальный provider call.** Сейчас резервирует `avatars`
   row со статусом `pending` и помечает samples consumed, но не вызывает HeyGen
   Custom Photo Avatar API (там нужна склейка кружков в одно видео + train job
   через BullMQ worker). См. TODO внутри роута.

2. **`/api/voice/analyze` через sample_ids.** Пока принимает уже расшифрованный
   `transcript`. Whisper-транскрипция voice_samples → analyze будет следующим
   шагом (вероятно через api-v2 Whisper, чтобы не дублировать).

3. **MinIO bucket `persona-train-media`** — нужно создать вручную (`mc mb local/persona-train-media`).
   Без него storage упадёт на локальный `/data/voice-notes` volume.

4. **`/voice-notes/*` route в Next.js** — для serving аудио из локального volume.
   Пока ссылки строятся из `PUBLIC_BASE_URL/voice-notes/...`, но Next.js на этот
   путь ничего не отдаёт. Варианты: либо добавить `app/voice-notes/[...path]/route.ts`,
   либо настроить Caddy alias на /data/voice-notes. Простой фикс — Caddy:

   ```
   handle_path /voice-notes/* {
       root * /var/lib/docker/volumes/persona-train_persona-train-voice-notes/_data
       file_server
   }
   ```

5. **Авторизация кабинета.** Сейчас кабинет открыт всем — single-tenant пока без
   auth. Перед публикацией — добавить basic-auth через Caddy (как на
   `transcribe.46-62-215-11.nip.io/transcribe`).

## Связь с другими проектами

- **AI Growth Office** ([persona-train.html](https://ai-office.46-62-215-11.nip.io/persona-train.html))
  — оригинал, остался работать. Та же `voices` таблица.
- **aisales-app-v2** — `voice_analyzer.py` исправлен (model ID был сломан); та же
  логика портирована в `src/lib/voice-analyzer.ts` для JS-вызова из кабинета/бота.
- **persona-studio** ([persona.46-62-215-11.nip.io](https://persona.46-62-215-11.nip.io))
  — соседний продукт (1 фото → 10 аватаров → HeyGen video). Persona Train —
  обучение из непрерывного потока (voice notes/кружки), Persona Studio — one-shot
  из фото. Используют общий `HEYGEN_API_KEY`.
