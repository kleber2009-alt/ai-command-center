#!/usr/bin/env bash
# Daily Postgres backup. Run via cron:
#
#   0 4 * * * /home/app/ai-command-center/scripts/backup-db.sh >> /home/app/logs/backup.log 2>&1
#
# Dumps the running `db` service from docker-compose into a gzipped file
# under BACKUP_DIR (default: ~/backups). Keeps the last RETENTION_DAYS
# (default 30) of dumps and deletes older ones.

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

cd "$(dirname "$0")/.."   # repo root
mkdir -p "$BACKUP_DIR"

STAMP=$(date -u +%Y%m%d-%H%M%S)
OUT="$BACKUP_DIR/db-$STAMP.sql.gz"

echo "[$(date -u +%FT%TZ)] backing up to $OUT"
docker compose exec -T db pg_dump -U "${POSTGRES_USER:-app}" "${POSTGRES_DB:-app}" \
  | gzip > "$OUT"

SIZE=$(du -h "$OUT" | cut -f1)
echo "[$(date -u +%FT%TZ)] dump done ($SIZE)"

# Trim old dumps
find "$BACKUP_DIR" -name 'db-*.sql.gz' -mtime "+$RETENTION_DAYS" -print -delete

echo "[$(date -u +%FT%TZ)] cleanup done"
