# apps/aisales

Бэкенд проекта **aisales** — две версии API (v1 compose-managed, v2 ручной
docker run) и набор инфраструктуры (Postgres, Redis, Qdrant, MinIO).
Интегрирован в монорепо `ai-command-center` 17.05.2026.

## Структура

```
apps/aisales/
├── v1/                ← старый API, исходники из /home/aisales/aisales/
│   ├── Dockerfile
│   ├── app/           ← Python источник
│   ├── requirements.txt
│   ├── migrations/
│   └── ...
├── v2/code/           ← новый API, из /home/aisales/aisales-app-v2/code/
├── prompts/           ← agent-prompts (read-only в контейнере)
├── db-init/           ← SQL-скрипты, монтируются в postgres initdb
├── docker-compose.yml ← project name = aisales
├── .env.example       ← без секретов, из v1/.env маска
└── README.md
```

## Где сейчас лежат данные

Production-данные **остаются по старому пути** `/home/aisales/aisales/data/`:
- `postgres/` — pgdata
- `redis/`    — AOF
- `qdrant/`   — vectors
- `minio/`    — blobs

Compose из этого каталога указывает на тот же путь через bind-mount,
поэтому даунтайма при переходе на новый compose **не будет**: оно
переиспользует уже примонтированные volumes.

## Как перезапустить через монорепный compose

> Это переподнимет контейнеры с теми же данными, но image будут
> пересобраны из `apps/aisales/v1/Dockerfile` и `apps/aisales/v2/code/Dockerfile`.

```bash
cd apps/aisales
cp .env.example .env
$EDITOR .env   # вставь пароли (можно скопировать из /home/aisales/aisales/.env)

# Сначала стопаем СТАРЫЙ compose (project name тот же — aisales — но запущен из /home/aisales/aisales/)
cd /home/aisales/aisales
docker compose down  # ВНИМАНИЕ: ОСТАНОВИТ aisales-api, aisales-postgres и т.д.

# Поднимаем из монорепо
cd ~/ai-command-center/apps/aisales
docker compose up -d --build
docker compose ps   # все 6 сервисов
```

Данные при этом НЕ переезжают — bind на `/home/aisales/aisales/data/`
работает в обе стороны.

## Будущая миграция данных в репо

Если захочешь чтоб данные тоже жили внутри `apps/aisales/data/` (а не
по абсолютному пути), запусти потом `scripts/migrate-aisales-data.sh`
— он сделает корректный rsync с остановленным compose.

## API-эндпоинты после интеграции с Caddy

- v1: `127.0.0.1:8000` → можно роутить через Caddy как `/aisales/v1/`
- v2: `127.0.0.1:8001` → можно роутить как `/aisales/` (текущая)

Snippet для добавления в `infra/Caddyfile`:
см. `infra/snippets/host-aisales-caddy.example.caddy`
