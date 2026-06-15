# voice-circle-bot — CLAUDE.md

Python TG-бот для приёма и обработки видео-кружков (Telegram video notes).

Не упомянут в production CLAUDE.md / Caddyfile — **прототип**, не задеплоен
как отдельный контейнер. Если запускается — вручную через
`docker-compose.yml` в этой папке.

## Структура

- `bot.py` — handlers
- `Dockerfile`, `docker-compose.yml`, `requirements.txt`
- `.env.example` — `TELEGRAM_BOT_TOKEN`, и т.д.

## Локальный запуск

```bash
cd services/python/voice-circle-bot
cp .env.example .env
docker compose up -d --build
```

## Назначение

MVP-приёмник для входящих кружков от участников. Реальный pipeline по
обработке кружков для аватара живёт в `apps/persona-train/` (там
`/api/avatar/sample` + `/train`).

Если решишь поднять — сначала уточни, не дублирует ли этот бот
функциональность `@ilia_pali0_bot` из persona-train.
