#!/usr/bin/env bash
# Бэкап Postgres → MinIO с ротацией.
#
# Использование:
#   bash scripts/backup_postgres.sh
#
# Cron (на сервере, через crontab -e):
#   # каждый день в 03:30
#   30 3 * * * cd /home/aisales/ai-command-center && bash scripts/backup_postgres.sh >> /var/log/aisales-backup.log 2>&1
#
# Что делает:
#   1. pg_dump --format=custom (компактный бинарный, быстрый restore)
#   2. Заливает в MinIO bucket "aisales-backups" под именем
#      aisales-YYYY-MM-DD-HHMM.dump
#   3. Удаляет в MinIO бэкапы старше KEEP_DAYS (по умолчанию 14)
#
# Требует: docker, docker compose, mc (MinIO Client) либо awscli с
# конфигом MinIO. Если mc нет — скрипт ставит его автоматически.

set -euo pipefail

KEEP_DAYS=${KEEP_DAYS:-14}
BUCKET=${BUCKET:-aisales-backups}
TS=$(date -u +%Y-%m-%dT%H%MZ)
FILE="aisales-${TS}.dump"
TMP_DIR=$(mktemp -d)
TMP_PATH="${TMP_DIR}/${FILE}"
trap 'rm -rf "${TMP_DIR}"' EXIT

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_DIR="${REPO_ROOT}/ai-sales/code"
ENV_FILE="${COMPOSE_DIR}/.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "✗ .env не найден: ${ENV_FILE}"
  exit 1
fi

# Загружаем переменные из .env (без exec, безопасно).
set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

PGPWD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD не задан в .env}"
MINIO_USER="${MINIO_ROOT_USER:-aisales}"
MINIO_PWD="${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD не задан}"

echo "→ pg_dump → ${TMP_PATH}"
docker compose --project-directory "${COMPOSE_DIR}" exec -T \
  -e PGPASSWORD="${PGPWD}" \
  postgres pg_dump -U aisales -d aisales --format=custom --compress=9 \
  > "${TMP_PATH}"

SIZE=$(du -h "${TMP_PATH}" | cut -f1)
echo "✓ dump готов · ${SIZE}"

# Установим mc если нет
if ! command -v mc &>/dev/null; then
  echo "→ mc не найден, ставлю в /usr/local/bin"
  curl -fsSL https://dl.min.io/client/mc/release/linux-amd64/mc \
    -o /usr/local/bin/mc
  chmod +x /usr/local/bin/mc
fi

ALIAS="aisales-minio"
mc alias set "${ALIAS}" http://127.0.0.1:9000 "${MINIO_USER}" "${MINIO_PWD}" --api S3v4 >/dev/null
mc mb --ignore-existing "${ALIAS}/${BUCKET}" >/dev/null

echo "→ upload → ${BUCKET}/${FILE}"
mc cp "${TMP_PATH}" "${ALIAS}/${BUCKET}/${FILE}"

echo "→ rotation: удаляю старше ${KEEP_DAYS} дней"
mc rm --recursive --force --older-than "${KEEP_DAYS}d" "${ALIAS}/${BUCKET}/" 2>/dev/null || true

echo "✓ done"
mc ls "${ALIAS}/${BUCKET}/" | tail -n 5
