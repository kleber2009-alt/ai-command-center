#!/usr/bin/env bash
# AI Command Center + AI Sales · one-shot deploy на наш Hetzner сервер.
#
# Запуск на сервере (aisales@46.62.215.11):
#   cd ~/ai-command-center && git pull && bash scripts/deploy.sh
#
# Скрипт:
#   1. Проверяет, что .env существует и содержит обязательные ключи
#   2. Билдит контейнеры dashboard + api
#   3. Поднимает весь стек (postgres, redis, qdrant, minio, api, dashboard, caddy)
#   4. Прогоняет smoke-тесты (postgres, /api/metrics, /docs)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_DIR="${REPO_ROOT}/ai-sales/code"
ENV_FILE="${COMPOSE_DIR}/.env"

echo "════════════════════════════════════════════════════════"
echo "  AI Command Center · deploy"
echo "  Repo:    ${REPO_ROOT}"
echo "  Compose: ${COMPOSE_DIR}"
echo "════════════════════════════════════════════════════════"

# ─── 1. Pre-flight ────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "✗ docker не установлен"; exit 1
fi
if ! docker compose version &>/dev/null; then
  echo "✗ docker compose v2 не установлен"; exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo ""
  echo "→ .env не найден, создаю из .env.example"
  cp "${COMPOSE_DIR}/.env.example" "${ENV_FILE}"
  echo ""
  echo "⚠  Заполни обязательные ключи в ${ENV_FILE}:"
  echo "    - ANTHROPIC_API_KEY"
  echo "    - POSTGRES_PASSWORD (НЕ оставляй default!)"
  echo "    - REDIS_PASSWORD"
  echo "    - MINIO_ROOT_PASSWORD"
  echo "    - DOMAIN  (например: 46-62-215-11.nip.io  →  Caddy выпишет SSL)"
  echo "    - TG_BOT_TOKEN, TG_WEBHOOK_SECRET, ILYA_TG_CHAT_ID  (Telegram)"
  echo "    - IG_APP_SECRET, IG_PAGE_TOKEN, IG_VERIFY_TOKEN     (Instagram)"
  echo "    - ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID           (опц.)"
  echo "    - VOYAGE_API_KEY, OPENAI_API_KEY                    (опц.)"
  echo ""
  echo "Запусти ./scripts/deploy.sh заново после редактирования."
  exit 2
fi

# Проверка обязательных переменных
REQUIRED=( ANTHROPIC_API_KEY POSTGRES_PASSWORD DOMAIN )
MISSING=()
for v in "${REQUIRED[@]}"; do
  val="$(grep -E "^${v}=" "${ENV_FILE}" | head -1 | cut -d= -f2- || true)"
  if [[ -z "${val}" ]] || [[ "${val}" == "sk-ant-..." ]] || [[ "${val}" == "CHANGEME" ]]; then
    MISSING+=("${v}")
  fi
done
if (( ${#MISSING[@]} > 0 )); then
  echo "✗ В .env не заполнены: ${MISSING[*]}"
  exit 3
fi
echo "✓ .env проверен"

# ─── 2. Build ─────────────────────────────────────────────
cd "${COMPOSE_DIR}"
echo ""
echo "→ Билд контейнеров (dashboard, api)..."
docker compose build dashboard api

# ─── 3. Up ───────────────────────────────────────────────
echo ""
echo "→ Запуск стека..."
docker compose up -d

# ─── 4. Wait for postgres ────────────────────────────────
echo ""
echo "→ Жду postgres..."
for i in {1..30}; do
  if docker compose exec -T postgres pg_isready -U aisales -d aisales &>/dev/null; then
    echo "✓ postgres ready"
    break
  fi
  sleep 2
done

# ─── 5. Smoke tests ──────────────────────────────────────
echo ""
echo "→ Smoke-тесты..."

echo -n "  platform_users: "
docker compose exec -T postgres psql -U aisales -d aisales -tAc \
  "SELECT COUNT(*) FROM platform_users" 2>/dev/null || echo "NO TABLE"

echo -n "  dashboard /api/metrics: "
for i in {1..15}; do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/metrics || true)
  if [[ "${code}" == "200" ]]; then
    echo "200 OK"
    break
  fi
  sleep 2
done

echo -n "  api /docs: "
for i in {1..15}; do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/docs || true)
  if [[ "${code}" == "200" ]]; then
    echo "200 OK"
    break
  fi
  sleep 2
done

DOMAIN_VAL=$(grep -E "^DOMAIN=" "${ENV_FILE}" | cut -d= -f2-)
echo ""
echo "════════════════════════════════════════════════════════"
echo "  Готово."
echo "  Dashboard: https://${DOMAIN_VAL}/"
echo "  API docs:  https://${DOMAIN_VAL}/docs"
echo "  Logs:      docker compose logs -f dashboard api"
echo "════════════════════════════════════════════════════════"
