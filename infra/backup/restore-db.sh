#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# infra/backup/restore-db.sh
# ───────────────────────────────────────────────────────────────────
# Восстановление БД из последнего бэкапа на S3.
# ОСТОРОЖНО: pg_dump делался с --clean --if-exists → существующие
# таблицы будут удалены перед восстановлением. Используй на чистой
# БД или будь готов к потере текущих данных.
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

PG_CONTAINER="${PG_CONTAINER:-infra-postgres-1}"
PG_USER="${PG_USER:-aio}"
PG_DB="${PG_DB:-aio}"
REMOTE="${RCLONE_REMOTE:-s3}"
BUCKET="${BACKUP_BUCKET:-aio-backups}"
PREFIX="${BACKUP_PREFIX:-aio/db}"
TMPDIR="${TMPDIR:-/tmp}"

ARG="${1:-latest}"

# ── Find which backup to restore ──
if [[ "$ARG" == "latest" ]]; then
  echo "Looking up latest backup on ${REMOTE}:${BUCKET}/${PREFIX}/…"
  fname=$(rclone lsf "${REMOTE}:${BUCKET}/${PREFIX}/" --s3-no-check-bucket | grep '\.sql\.gz$' | sort | tail -1)
  if [[ -z "$fname" ]]; then
    echo "❌ No backups found at ${REMOTE}:${BUCKET}/${PREFIX}/"
    exit 1
  fi
else
  fname="$ARG"
fi

tmpfile="${TMPDIR}/restore-${fname}"
echo "Will restore: $fname"
read -rp "Это ПЕРЕЗАПИШЕТ текущую БД ${PG_DB}. Уверен? [yes/NO] " yn
if [[ "$yn" != "yes" ]]; then
  echo "Aborted"
  exit 0
fi

cleanup() { rm -f "$tmpfile"; }
trap cleanup EXIT

echo "Downloading…"
rclone copyto "${REMOTE}:${BUCKET}/${PREFIX}/${fname}" "$tmpfile" --s3-no-check-bucket

echo "Restoring into ${PG_CONTAINER}/${PG_DB}…"
gunzip -c "$tmpfile" | docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB"

echo "✅ Restore complete: $fname"
