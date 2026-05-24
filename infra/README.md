# infra/ — self-hosted stack

Полная замена Vercel + Netlify + Supabase. Всё работает на одном Docker-хосте.

## Что внутри

| Слой | Образ | Порты | Что делает |
|---|---|---|---|
| `caddy` | `caddy:2-alpine` | 80, 443 | Reverse proxy + автоматический Let's Encrypt |
| `postgres` | `postgres:16-alpine` | 5432 (internal) | Все данные (transcripts, leads, voices, bot users, tokens) |
| `ai-office` | build из `services/ai-office` | 3000 (internal) | Fastify backend, заменяет Netlify Functions |
| `transcribe` | build из `services/transcribe` | 3000 (internal) | Next.js standalone, заменяет Vercel-деплой |

```
Internet → Caddy :443 ─┬─ /transcribe* + /api/transcribe* → transcribe:3000
                       │
                       ├─ /api/*  (всё остальное)         → ai-office:3000
                       │
                       ├─ /voice-notes/*  (сгенерированные аудио)
                       │
                       └─ /* (статика ai-office-project)   ↺ Caddy file_server
```

## Деплой за 10 минут (Hetzner Cloud)

### 0. Размер сервера

Минимум для всего стека (Postgres + 2 backends + Caddy):

| Hetzner type | vCPU | RAM | Цена/мес | Кому |
|---|---|---|---|---|
| **CPX11** | 2 AMD | 2 GB | ~4.5 € | для теста, до ~50 одновр. юзеров |
| **CPX21** | 3 AMD | 4 GB | ~8 € | **рекомендую старт** |
| **CPX31** | 4 AMD | 8 GB | ~16 € | если активный TTS-трафик |

Локация: Hetzner FSN1/NBG1 (Германия) или HEL1 (Финляндия) — пинг к Anthropic/ElevenLabs ~50ms.
Образ: **Ubuntu 22.04** или **24.04** — оба подходят.
Firewall: разреши TCP/UDP 22, 80, 443 (Hetzner Cloud → Firewalls → Create).

### 1. Подготовка сервера

```bash
# В Hetzner Cloud Console: создай Cloud Server → Ubuntu 24.04 → CPX21
# Подключись по SSH:
ssh root@<server-ip>

# Обнови систему и поставь Docker:
apt update && apt install -y git ufw
curl -fsSL https://get.docker.com | sh

# Firewall (на всякий случай, в дополнение к Hetzner Cloud firewall):
ufw allow OpenSSH
ufw allow 80,443/tcp
ufw allow 443/udp
ufw --force enable

# (опционально) Создай не-root юзера:
adduser deploy && usermod -aG docker,sudo deploy
# и далее работай под ним
```

### 2. DNS

Направь A-запись `ai-office.46-62-215-11.nip.io` → IP сервера. Без DNS Caddy не выпустит TLS.

### 3. Клонируй и настрой

```bash
git clone https://github.com/kleber2009-alt/ai-command-center.git
cd ai-command-center
git checkout claude/unpack-project-gU5md   # пока не смержим в main

cd infra
cp .env.example .env
nano .env                                   # заполнить все поля — см. ниже
```

### 4. Минимальные секреты в `infra/.env`

```bash
PUBLIC_HOST=ai-office.46-62-215-11.nip.io
PUBLIC_BASE_URL=https://ai-office.46-62-215-11.nip.io
ACME_EMAIL=admin@ai-office.46-62-215-11.nip.io

POSTGRES_DB=aio
POSTGRES_USER=aio
POSTGRES_PASSWORD=сгенерируй_длинный_рандом_например_openssl_rand_-hex_24

# Внешние SaaS (без них некоторые фичи 503):
ANTHROPIC_API_KEY=sk-ant-…       # для /api/chat, summarize, translate, generate
DEEPGRAM_API_KEY=…               # для /api/transcribe (нетубовых ссылок)
ELEVENLABS_API_KEY=…             # для voice clone + TTS

# Telegram-боты (опционально):
TG_BOT_TOKEN=…                   # admin-уведомления о лидах
TG_CHAT_ID=…                     # твой Telegram user_id
TG_VOICE_BOT_TOKEN=…             # отдельный бот для voice composer
TG_WEBHOOK_SECRET=…              # 32+ случайных символов
```

### 5. Запуск

```bash
cd infra
docker compose up -d --build
docker compose ps               # должно быть 4 service'а в "running"/"healthy"
docker compose logs -f caddy    # увидишь как Caddy получает TLS-сертификат
```

Через ~30 секунд:
- `https://ai-office.46-62-215-11.nip.io/` → главная (HTML из ai-office-project)
- `https://ai-office.46-62-215-11.nip.io/transcribe` → транскрибер Next.js
- `https://ai-office.46-62-215-11.nip.io/api/health` → `{ ok, db, elevenlabs, tg_voice_bot, public_base_url }`

### 6. Установка Telegram webhook (один раз)

После того как сайт открывается по HTTPS:

```bash
source infra/.env
curl -X POST "https://api.telegram.org/bot${TG_VOICE_BOT_TOKEN}/setWebhook" \
  -d "url=${PUBLIC_BASE_URL}/api/tg-voice-webhook" \
  -d "secret_token=${TG_WEBHOOK_SECRET}" \
  -d 'allowed_updates=["message","callback_query"]'

# Проверь:
curl "https://api.telegram.org/bot${TG_VOICE_BOT_TOKEN}/getWebhookInfo"
```

### 7. Команды для @BotFather (для voice-бота)

```
/setcommands → выбрать бота:
start - Привязать чат к голосу
voice - Показать активный голос
settings - Настройки TTS
clear - Отвязать чат
help - Помощь
```

## Проверка end-to-end

1. Открой `https://your-domain/persona-train` — UI клонирования
2. Введи handle, запиши 60+ сек голоса, нажми «Создать голос»
3. Нажми «🔑 Получить код для Telegram-бота» — увидишь `XXX-XXX`
4. Открой бота в Telegram → `/start @your_handle XXX-XXX`
5. Любой текст → бот пришлёт voice-note твоим голосом

## Обновление кода

```bash
git pull
docker compose up -d --build
```

Caddy не перезапускается, downtime ≈ 5 сек на ai-office/transcribe.

## Бэкап БД

```bash
docker compose exec postgres pg_dump -U aio aio > backup-$(date +%Y%m%d).sql
```

Восстановить:
```bash
docker compose exec -T postgres psql -U aio aio < backup-YYYYMMDD.sql
```

## Логи

```bash
docker compose logs -f                  # все сервисы
docker compose logs -f ai-office        # только Fastify
docker compose logs -f transcribe       # только Next.js
docker compose logs caddy --tail=100    # последние 100 строк Caddy
```

## Очистка

```bash
# Стоп без потери данных:
docker compose down

# Стоп + удаление volumes (потеря БД, voice-notes, сертов!):
docker compose down -v
```

## Что куда переехало (карта миграции)

| Было | Стало |
|---|---|
| Vercel hosting (Next.js) | `transcribe` контейнер на нашем сервере |
| Netlify hosting (статика) | Caddy file_server из `ai-office-project/` |
| Netlify Functions | `ai-office` контейнер (Fastify) |
| Supabase Postgres | `postgres` контейнер |
| Supabase Storage `voice-notes` bucket | Named volume `voice_notes`, отдаётся Caddy на `/voice-notes/*` |
| Supabase REST `/rest/v1/leads` | `POST /api/leads` (Fastify) |
| Supabase Auth | (не использовался) |
| Let's Encrypt через Netlify | Caddy auto-TLS |
| `supabase/migrations/00*.sql` | `infra/db/init/001_schema.sql` (консолидированная) |
| `ELEVENLABS_API_KEY` в Netlify | `ELEVENLABS_API_KEY` в `infra/.env` |
| `ANTHROPIC_API_KEY` в Vercel | `ANTHROPIC_API_KEY` в `infra/.env` |
| `NEXT_PUBLIC_SUPABASE_URL` | удалено — больше не нужно |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | удалено |
| `SUPABASE_SERVICE_KEY` | удалено, теперь `DATABASE_URL` |

## Что осталось ВНЕ контура (внешние SaaS)

Остаются прямые вызовы к этим API из бэкенда — это не self-host, но обращения **с нашего сервера**, ключи в `infra/.env`, не утекают в браузер:

- **api.anthropic.com** — LLM-генерация (chat, summarize, translate, generate)
- **api.elevenlabs.io** — клонирование голоса + TTS
- **api.deepgram.com** — транскрибация не-YouTube
- **api.telegram.org** — оба бота и webhook
- **(опц.) YTDLP_SERVICE_URL** — если поднят отдельный yt-dlp сервис

Если потом захочешь убрать и эти зависимости — план:
- ElevenLabs → Coqui XTTS на своём GPU-сервере (~$50/мес)
- Anthropic → локальный LLM (Llama 3 70B на 2×A100 — дорого) или Yandex GPT (российский SaaS)
- Deepgram → Whisper.cpp на CPU/GPU
- Без проблем — архитектура изолирована, можно поэтапно подменять провайдеров.

## Health check команды

```bash
# Эндпоинт здоровья бэкенда:
curl https://ai-office.46-62-215-11.nip.io/api/health

# Postgres из контейнера:
docker compose exec postgres psql -U aio -c "select count(*) from voices"

# Список генераций voice-нотов:
docker compose exec postgres psql -U aio -c "select created_at, owner_handle, status from voice_generations order by created_at desc limit 10"

# Свободное место под voice-notes:
docker compose exec ai-office du -sh /data/voice-notes
```

## Troubleshooting

**Caddy не выпускает сертификат:**
- Проверь что DNS A-запись указывает на сервер: `dig ai-office.46-62-215-11.nip.io +short`
- Открыты ли порты 80/443: `sudo ufw allow 80,443/tcp`
- Логи: `docker compose logs caddy --tail=50`

**`/api/voice-clone` возвращает 503:**
- `ELEVENLABS_API_KEY` не задан в `.env` — добавь и `docker compose up -d ai-office`

**База не подхватила миграцию:**
- Миграция выполняется только при первом старте контейнера, когда `postgres_data` пуст.
- Чтобы перезапустить с нуля: `docker compose down && docker volume rm infra_postgres_data && docker compose up -d`
- Чтобы применить вручную: `docker compose exec -T postgres psql -U aio -d aio < db/init/001_schema.sql`

**Telegram бот не отвечает:**
- `curl "https://api.telegram.org/bot${TG_VOICE_BOT_TOKEN}/getWebhookInfo"` — поле `last_error_message` подскажет
- Логи: `docker compose logs ai-office --tail=100 | grep -i tg`
