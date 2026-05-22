# AI Command Center

Self-hosted Next.js app + Telegram Mini App с тремя поверхностями:

- **`/transcribe`** — транскрибация YouTube / Instagram / TikTok / прямых медиа → текст, саммари, перевод, генерация контента (карусели, рилсы, TG-посты).
- **`/assistants`** — 9 специализированных ИИ-ассистентов с собственными промптами и личным окном чата.
- **`/me`** — личный «второй мозг»: профиль, библиотека материалов с RAG-поиском, чат над всем этим.

Подробное описание архитектуры — в [`CLAUDE.md`](./CLAUDE.md).

---

## Стек

- Next.js 14 (App Router) + React 18 + TypeScript + Tailwind
- **БД:** SQLite + sqlite-vec (один файл `data/app.db`, схема создаётся автоматически)
- **LLM:** Claude Sonnet 4.6 / Haiku 4.5
- **Embeddings:** OpenAI `text-embedding-3-small` (1536d)
- **Транскрипция:** Deepgram Nova-2 + yt-dlp companion для соцсетей
- **Хостинг:** Docker Compose с Caddy для авто-TLS

Никаких внешних managed-сервисов (Vercel, Supabase, Pinecone) — всё крутится на твоей машине.

---

## Что нужно

- Linux-сервер с публичным IP (Hetzner / DO / Vultr / собственный)
- Домен, A-запись которого смотрит на сервер (для авто-SSL)
- Ключи: Anthropic (обязательно), OpenAI (для второго мозга), Deepgram (для транскрипций)

Минимальный VPS — 2 GB RAM, 1 vCPU, 20 GB диска. На Hetzner это CX22, около €4.5/мес.

---

## Быстрый старт на свежем VPS

```bash
# 1. Docker
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# 2. Файрвол
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable

# 3. Репо
git clone https://github.com/kleber2009-alt/ai-command-center.git /opt/ai-command-center
cd /opt/ai-command-center

# 4. Конфиг
cp .env.example .env
nano .env          # вписать ANTHROPIC_API_KEY, OPENAI_API_KEY, DEEPGRAM_API_KEY, DOMAIN

# 5. Старт
docker compose up -d --build
docker compose logs -f app
```

Caddy сам получит Let's Encrypt-сертификат для `$DOMAIN` при первом запросе. Открой `https://<твой-домен>/transcribe` — поехали.

---

## Переменные окружения

См. `.env.example`. Главное:

| Переменная | Зачем |
| --- | --- |
| `ANTHROPIC_API_KEY` | Все чаты, саммари, переводы, генерации |
| `OPENAI_API_KEY` | Эмбеддинги для `/me/library` и RAG-поиска |
| `DEEPGRAM_API_KEY` | Транскрибация не-YouTube URL и голосовой ввод в чате |
| `DEEPGRAM_API_KEY` | Если ключ не задан, голосовой ввод и часть транскрипций не работают |
| `YTDLP_SERVICE_API_KEY` | Bearer-токен между Next и yt-dlp контейнером (любая длинная строка) |
| `TELEGRAM_BOT_TOKEN` | Если задан — каждый `/api/*` требует валидный Telegram Mini App `initData`. Пусто — API открыт |
| `DOMAIN` | Домен Caddy. `localhost` для локального теста |

---

## Эксплуатация

### Обновление до свежей версии

```bash
cd /opt/ai-command-center
bash scripts/update.sh
```

`update.sh` сделает: `git pull` → бэкап БД в `data/backups/` → пересборку образа → перезапуск → проверку `/api/health`.

### Бэкап БД

```bash
bash scripts/backup.sh
```

Создаёт `data/backups/app-<timestamp>.db.gz`. Держит последние 14 копий (`BACKUP_KEEP=N` чтобы изменить).

Cron (как root):

```cron
0 3 * * *  cd /opt/ai-command-center && bash scripts/backup.sh >> data/backup.log 2>&1
```

### Проверить здоровье

```bash
curl http://localhost:3000/api/health        # внутри VPS
curl https://<твой-домен>/api/health         # снаружи
```

Возвращает JSON с состоянием БД и тем, какие ключи прописаны.

### Логи

```bash
docker compose logs -f app
docker compose logs -f caddy
docker compose logs -f ytdlp
```

### Восстановление из бэкапа

```bash
docker compose down
gunzip -c data/backups/app-<timestamp>.db.gz > data/app.db
docker compose up -d
```

---

## Локальная разработка

Без Docker:

```bash
npm install
cp .env.example .env.local
nano .env.local
npm run dev
```

Откроется на `http://localhost:3000`. SQLite-файл создастся в `data/app.db` автоматически.

---

## Структура

```
src/
  app/
    api/                 — все REST-роуты (transcribe, me, assistants, voice, health)
    transcribe/          — /transcribe — UI транскрибации
    assistants/          — /assistants и /assistants/[id]
    me/                  — /me, /me/profile, /me/library, /me/library/[id], /me/search
  components/            — общие React-компоненты (ChatSessionsDrawer, MarkdownMessage)
  data/assistants.ts     — данные 9 ассистентов
  lib/                   — SQLite, эмбеддинги, чанкование, Telegram-auth, стримы Anthropic, voice-input
services/ytdlp/          — Python-сервис для yt-dlp
scripts/                 — backup.sh, update.sh
Dockerfile               — multi-stage сборка Next
docker-compose.yml       — app + ytdlp + caddy
Caddyfile                — реверс-прокси + авто-TLS
```

---

## Лицензия

Используй как хочешь.
