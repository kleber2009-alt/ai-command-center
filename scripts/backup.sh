#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# scripts/backup.sh
# ───────────────────────────────────────────────────────────────────
# Делает свежий бэкап:
#   1. pg_dump БД в gzip → BACKUP_DIR/pg-YYYY-MM-DD.sql.gz
#   2. tar volume voice-notes → BACKUP_DIR/voice-notes-YYYY-MM-DD.tgz
#
# Запускать из корня репо. Подразумевает, что docker-compose поднят
# и контейнеры `ai-postgres` и `ai-office` живы.
#
# Cron (от юзера ai, crontab -e):
#   0 3 * * * cd /opt/ai-stack && ./scripts/backup.sh >> /var/log/ai-backup.log 2>&1
#
# Env:
#   BACKUP_DIR   — куда писать. Default /opt/ai-backups.
#   BACKUP_KEEP_DAYS — сколько хранить, старше удаляется. Default 14.
#   POSTGRES_USER, POSTGRES_DB — из docker-compose env (обычно ai/ai).
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/ai-backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
PG_USER="${POSTGRES_USER:-ai}"
PG_DB="${POSTGRES_DB:-ai}"
DATE=$(date +%F)

mkdir -p "$BACKUP_DIR"

echo "[$(date -Iseconds)] → backup start"

# 1. БД
PG_FILE="$BACKUP_DIR/pg-$DATE.sql.gz"
echo "  pg_dump → $PG_FILE"
docker exec ai-postgres pg_dump -U "$PG_USER" "$PG_DB" | gzip > "$PG_FILE"
PG_SIZE=$(du -h "$PG_FILE" | cut -f1)
echo "  pg_dump OK ($PG_SIZE)"

# 2. voice-notes
VN_FILE="$BACKUP_DIR/voice-notes-$DATE.tgz"
echo "  voice-notes → $VN_FILE"
# tar изнутри контейнера: безопасно к перемонтированию volume.
docker exec ai-office sh -c 'cd /data && tar cf - voice-notes 2>/dev/null || tar cf - -T /dev/null' \
  | gzip > "$VN_FILE"
VN_SIZE=$(du -h "$VN_FILE" | cut -f1)
echo "  voice-notes OK ($VN_SIZE)"

# 3. ротация
echo "  rotation: удаляю файлы старше $KEEP_DAYS дней"
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'pg-*.sql.gz' -o -name 'voice-notes-*.tgz' \) \
  -mtime +"$KEEP_DAYS" -print -delete || true

echo "[$(date -Iseconds)] ✓ backup done"
