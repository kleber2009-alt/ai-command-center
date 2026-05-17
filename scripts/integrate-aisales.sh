#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# scripts/integrate-aisales.sh
# ───────────────────────────────────────────────────────────────────────
# Запускается на сервере aisales-prod. Сам определяет, где лежит код
# aisales, копирует его в apps/aisales/, генерит docker-compose.yml и
# .env.example, коммитит в git. РАБОТАЮЩИЕ контейнеры не трогает —
# только код перекладывает в репо.
#
# Что делает:
#   1. Проверяет, что мы в корне репо ai-command-center на нужной ветке.
#   2. rsync /home/aisales/aisales/        → apps/aisales/v1/   (без data/, .env, backups/)
#   3. rsync /home/aisales/aisales-app-v2/ → apps/aisales/v2/
#   4. Делает apps/aisales/.env.example из v1/.env, маскирует значения.
#   5. Пишет apps/aisales/docker-compose.yml — пока с bind на старые данные
#      (/home/aisales/aisales/data/*), потом мигрируем отдельным скриптом.
#   6. Пишет apps/aisales/README.md с инструкцией.
#   7. Кладёт infra/snippets/host-aisales-caddy.example.caddy чтобы можно
#      было добавить /aisales-api → aisales-api-v2:8000 в основной Caddy.
#   8. .gitignore: исключает runtime data и .env.
#   9. git add -A && git status. Коммит — по подтверждению.
#
# Использование на сервере:
#   cd ~/ai-command-center
#   git pull
#   ./scripts/integrate-aisales.sh
#   # → проверяешь git status, затем
#   git commit -m "feat: bring aisales code into monorepo" && git push
# ═══════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── 1. Sanity ────────────────────────────────────────────────────────
REPO_ROOT="$(pwd)"
[ -d .git ] || { echo "ERROR: запусти из корня репо ai-command-center"; exit 1; }
[ -d ai-office-project ] && [ -d infra ] || { echo "ERROR: не похоже на ai-command-center"; exit 1; }

AISALES_V1="/home/aisales/aisales"
AISALES_V2="/home/aisales/aisales-app-v2"

[ -d "$AISALES_V1" ] || { echo "ERROR: $AISALES_V1 не найден"; exit 1; }
[ -d "$AISALES_V2" ] || { echo "ERROR: $AISALES_V2 не найден"; exit 1; }

BRANCH="$(git branch --show-current)"
echo "→ Репо: $REPO_ROOT (ветка $BRANCH)"
echo "→ Источник v1: $AISALES_V1 ($(du -sh "$AISALES_V1" 2>/dev/null | cut -f1))"
echo "→ Источник v2: $AISALES_V2 ($(du -sh "$AISALES_V2" 2>/dev/null | cut -f1))"

mkdir -p apps/aisales/{v1,v2,prompts,db-init}

# ── 2. v1 (без data/, backups/, .env, .bak) ──────────────────────────
echo "→ rsync v1 → apps/aisales/v1/"
rsync -a \
  --exclude='/data/' \
  --exclude='/backups/' \
  --exclude='/.env' \
  --exclude='*.bak' \
  --exclude='__pycache__/' \
  --exclude='*.pyc' \
  --exclude='.git/' \
  "$AISALES_V1/" apps/aisales/v1/

# ── 3. v2 → разложить по подкаталогам ────────────────────────────────
echo "→ rsync v2 → apps/aisales/v2/"
# v2 структура: code/, agent-prompts/, 04-database/, voice-input/
# voice-input/ может содержать тестовые медиа — копируем только если небольшое.
rsync -a --exclude='__pycache__/' --exclude='*.pyc' \
  "$AISALES_V2/code/" apps/aisales/v2/code/
rsync -a "$AISALES_V2/agent-prompts/" apps/aisales/prompts/
rsync -a "$AISALES_V2/04-database/" apps/aisales/db-init/

V2_VOICE_SIZE=$(du -sb "$AISALES_V2/voice-input" 2>/dev/null | cut -f1 || echo 0)
if [ "$V2_VOICE_SIZE" -lt 10485760 ]; then  # < 10 MB
  rsync -a "$AISALES_V2/voice-input/" apps/aisales/voice-input-samples/ 2>/dev/null || true
  echo "  voice-input скопирован (мало, для примеров)"
else
  echo "  voice-input/ пропущен ($V2_VOICE_SIZE байт — слишком большой, добавь в .gitignore)"
fi

# ── 4. .env.example из реального .env, со скрытыми значениями ─────────
if [ -f "$AISALES_V1/.env" ]; then
  echo "→ Генерю apps/aisales/.env.example (маскирую значения)"
  {
    echo "# apps/aisales/.env.example"
    echo "# Скопируй в apps/aisales/.env и заполни. .env закоммичен в .gitignore."
    echo "# Сгенерировано из $AISALES_V1/.env"
    echo
    grep -E '^[A-Z_]+=' "$AISALES_V1/.env" | sed -E 's/=.*$/=/'
  } > apps/aisales/.env.example
fi

# ── 5. compose: 6 сервисов, project name = aisales ───────────────────
echo "→ Пишу apps/aisales/docker-compose.yml"
cat > apps/aisales/docker-compose.yml <<'COMPOSE'
# ═══════════════════════════════════════════════════════════════════
# apps/aisales/docker-compose.yml
# ───────────────────────────────────────────────────────────────────
# Компоуз для aisales-стека. Project name = aisales (по имени папки),
# что СОВПАДАЕТ с текущим запущенным проектом из /home/aisales/aisales/
# — поэтому он переиспользует существующие volumes, networks и
# контейнеры. Это позволит постепенно перейти на этот compose без
# даунтайма.
#
# ПРИМЕЧАНИЕ ПО ДАННЫМ:
# Сейчас compose ссылается на bind-пути /home/aisales/aisales/data/*,
# чтобы НЕ переносить данные сразу. Когда будешь готов мигрировать
# на repo-local data — запусти scripts/migrate-aisales-data.sh, он
# rsync-нет директории в apps/aisales/data/ и поменяет compose
# на относительные пути.
# ═══════════════════════════════════════════════════════════════════

name: aisales

services:
  postgres:
    image: postgres:16-alpine
    container_name: aisales-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - /home/aisales/aisales/data/postgres:/var/lib/postgresql/data
      - ./db-init:/docker-entrypoint-initdb.d:ro
    ports:
      - "127.0.0.1:5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks: [aisales-net]

  redis:
    image: redis:7-alpine
    container_name: aisales-redis
    restart: unless-stopped
    command: redis-server --requirepass ${REDIS_PASSWORD} --appendonly yes
    volumes:
      - /home/aisales/aisales/data/redis:/data
    ports:
      - "127.0.0.1:6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks: [aisales-net]

  qdrant:
    image: qdrant/qdrant:latest
    container_name: aisales-qdrant
    restart: unless-stopped
    environment:
      QDRANT__SERVICE__API_KEY: ${QDRANT_API_KEY}
    volumes:
      - /home/aisales/aisales/data/qdrant:/qdrant/storage
    ports:
      - "127.0.0.1:6333:6333"
      - "127.0.0.1:6334:6334"
    networks: [aisales-net]

  minio:
    image: minio/minio:latest
    container_name: aisales-minio
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    volumes:
      - /home/aisales/aisales/data/minio:/data
    ports:
      - "127.0.0.1:9000:9000"
      - "127.0.0.1:9001:9001"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks: [aisales-net]

  # ── v1 API (старая версия, compose-managed) ──
  api-v1:
    build:
      context: ./v1
      dockerfile: Dockerfile
    image: aisales-api:latest
    container_name: aisales-api
    restart: unless-stopped
    env_file: .env
    environment:
      POSTGRES_HOST: postgres
      REDIS_HOST: redis
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    ports:
      - "127.0.0.1:8000:8000"
    networks: [aisales-net]

  # ── v2 API (новая версия) ──
  api-v2:
    build:
      context: ./v2/code
      dockerfile: Dockerfile
    image: aisales-api:v0.2
    container_name: aisales-api-v2
    restart: unless-stopped
    env_file: .env
    environment:
      AISALES_MOCK: "0"
      QDRANT_URL: http://aisales-qdrant:6333
      POSTGRES_URL: postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@aisales-postgres:5432/${POSTGRES_DB}
      REDIS_URL: redis://:${REDIS_PASSWORD}@aisales-redis:6379/0
      MINIO_ENDPOINT: aisales-minio:9000
      MINIO_BUCKET: aisales-media
      MINIO_SECURE: "0"
      MEDIA_CACHE_DIR: /tmp/aisales-media-cache
    volumes:
      - ./prompts:/agent-prompts:ro
      - /home/aisales/aisales-app-v2/voice-input:/voice-input
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    ports:
      - "127.0.0.1:8001:8000"
    networks: [aisales-net]

networks:
  aisales-net:
    name: aisales_aisales-net
    external: false
COMPOSE

# ── 6. README ─────────────────────────────────────────────────────────
echo "→ Пишу apps/aisales/README.md"
cat > apps/aisales/README.md <<'README'
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
README

# ── 7. Caddy snippet для роутинга ────────────────────────────────────
mkdir -p infra/snippets
echo "→ Пишу infra/snippets/host-aisales-caddy.example.caddy"
cat > infra/snippets/host-aisales-caddy.example.caddy <<'CADDY'
# ═══════════════════════════════════════════════════════════════════
# Добавь это в infra/Caddyfile между блоками `@nextjs` и `handle /api/*`
# чтобы Caddy роутил aisales-эндпоинты на правильные контейнеры.
#
# ВАЖНО: aisales компоуз сидит на отдельной сети aisales_aisales-net.
# Caddy из infra-compose не видит контейнеры в aisales-net по имени.
# Поэтому проксируем на 127.0.0.1:8001 (v2) или :8000 (v1) — порты
# опубликованы в bind 127.0.0.1.
#
# Альтернатива: соединить сети через `docker network connect
# infra_internal aisales-api-v2`, тогда можно `reverse_proxy aisales-api-v2:8000`.
# ═══════════════════════════════════════════════════════════════════

@aisales path /aisales /aisales/* /api/aisales /api/aisales/*
handle @aisales {
    uri strip_prefix /aisales
    uri strip_prefix /api/aisales
    # 127.0.0.1:8001 — порт, на который aisales-api-v2 опубликован хосту.
    # Caddy в docker-сети, поэтому используем host.docker.internal или
    # IP хоста (Hetzner: 172.17.0.1 для дефолтного docker bridge).
    reverse_proxy 172.17.0.1:8001 {
        header_up X-Forwarded-Host {host}
        header_up X-Forwarded-Proto {scheme}
    }
}

# Для v1 (если нужен):
# @aisales-v1 path /aisales/v1 /aisales/v1/*
# handle @aisales-v1 {
#     uri strip_prefix /aisales/v1
#     reverse_proxy 172.17.0.1:8000
# }
CADDY

# ── 8. .gitignore additions ──────────────────────────────────────────
echo "→ Обновляю .gitignore"
{
  echo ""
  echo "# aisales — runtime data and secrets"
  echo "apps/aisales/.env"
  echo "apps/aisales/data/"
  echo "apps/aisales/v1/data/"
  echo "apps/aisales/v1/backups/"
  echo "apps/aisales/v1/.env"
  echo "apps/aisales/voice-input-samples/"
  echo "apps/aisales/**/__pycache__/"
  echo "apps/aisales/**/*.pyc"
} >> .gitignore

# Дедуплицируем .gitignore
sort -u .gitignore -o .gitignore.tmp && mv .gitignore.tmp .gitignore

# ── 9. Git status ────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "✓ Интеграция готова. Проверь:"
echo ""
echo "  git status --short | head -20"
echo "  ls -la apps/aisales/"
echo "  cat apps/aisales/docker-compose.yml | head -20"
echo ""
echo "Если всё ок:"
echo "  git add -A"
echo "  git commit -m 'feat: bring aisales code into monorepo (v1 + v2)'"
echo "  git push"
echo "═══════════════════════════════════════════════════════════════════"
