#!/usr/bin/env bash
# Daily backup of the SQLite database. Uses sqlite3's online `.backup`
# command, which is safe to run while the app is writing.
#
# Add to root's crontab on the VPS:
#   0 3 * * *  cd /opt/ai-command-center && bash scripts/backup.sh >> data/backup.log 2>&1
#
# Keeps the last $BACKUP_KEEP files; older copies are pruned.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="${ROOT}/data"
DB_FILE="${DATA_DIR}/app.db"
BACKUP_DIR="${DATA_DIR}/backups"
BACKUP_KEEP="${BACKUP_KEEP:-14}"

if [ ! -f "$DB_FILE" ]; then
  echo "$(date -Iseconds)  app.db not found at $DB_FILE — nothing to back up"
  exit 0
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${BACKUP_DIR}/app-${STAMP}.db"

# Run inside the running container so it shares the same sqlite binary the app uses.
# Falls back to host sqlite3 if the container is not up.
if command -v docker >/dev/null && docker compose ps --status running app >/dev/null 2>&1; then
  docker compose exec -T app sh -c "sqlite3 /app/data/app.db \".backup /app/data/backups/app-${STAMP}.db\""
elif command -v sqlite3 >/dev/null; then
  sqlite3 "$DB_FILE" ".backup ${OUT}"
else
  echo "$(date -Iseconds)  no sqlite3 binary available; falling back to file copy (may be inconsistent)"
  cp "$DB_FILE" "$OUT"
fi

gzip -f "$OUT"
echo "$(date -Iseconds)  wrote ${OUT}.gz"

# Prune old backups
ls -1t "$BACKUP_DIR"/app-*.db.gz 2>/dev/null | tail -n +$((BACKUP_KEEP + 1)) | xargs -r rm -f
echo "$(date -Iseconds)  kept newest ${BACKUP_KEEP} backups in $BACKUP_DIR"
