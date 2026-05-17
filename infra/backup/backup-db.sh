#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# infra/backup/backup-db.sh
# ───────────────────────────────────────────────────────────────────
# Daily Postgres backup → gzip → rclone copy to S3-compatible storage.
# Run via host cron (see cron.example).
#
# Storage layout:
#   <REMOTE>:<BUCKET>/aio/db/YYYY-MM-DD-HHMMSS.sql.gz
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Config (override via env if needed) ──
PG_CONTAINER="${PG_CONTAINER:-infra-postgres-1}"
PG_USER="${PG_USER:-aio}"
PG_DB="${PG_DB:-aio}"
REMOTE="${RCLONE_REMOTE:-s3}"
BUCKET="${BACKUP_BUCKET:-aio-backups}"
PREFIX="${BACKUP_PREFIX:-aio/db}"
RETAIN_DAYS="${RETAIN_DAYS:-30}"
TMPDIR="${TMPDIR:-/tmp}"

# Notify on failure (optional)
TG_NOTIFY_URL="${TG_NOTIFY_URL:-https://46.62.215.11.nip.io/api/notify-tg}"

ts=$(date -u +%Y-%m-%d-%H%M%S)
fname="aio-db-${ts}.sql.gz"
tmpfile="${TMPDIR}/${fname}"

cleanup() { rm -f "$tmpfile"; }
trap cleanup EXIT

# ── 1. pg_dump ──
echo "[backup-db] $(date -u +%FT%TZ) dumping ${PG_DB} from ${PG_CONTAINER}…"
if ! docker exec "$PG_CONTAINER" pg_dump --clean --if-exists -U "$PG_USER" -d "$PG_DB" | gzip > "$tmpfile"; then
  echo "[backup-db] FAIL: pg_dump failed"
  curl -fsS -X POST "$TG_NOTIFY_URL" \
    -H "Content-Type: application/json" \
    -d '{"text":"❌ *Бэкап БД упал:* pg_dump failed"}' || true
  exit 1
fi

size=$(stat -c%s "$tmpfile" 2>/dev/null || stat -f%z "$tmpfile")
echo "[backup-db] dump $((size / 1024)) KB"

# ── 2. rclone copy ──
echo "[backup-db] uploading to ${REMOTE}:${BUCKET}/${PREFIX}/${fname}…"
if ! rclone copyto "$tmpfile" "${REMOTE}:${BUCKET}/${PREFIX}/${fname}"; then
  echo "[backup-db] FAIL: rclone upload failed"
  curl -fsS -X POST "$TG_NOTIFY_URL" \
    -H "Content-Type: application/json" \
    -d "{\"text\":\"❌ *Бэкап БД упал:* rclone upload ${fname}\"}" || true
  exit 2
fi

# ── 3. Retention: delete files older than RETAIN_DAYS ──
echo "[backup-db] pruning files older than ${RETAIN_DAYS} days…"
rclone delete "${REMOTE}:${BUCKET}/${PREFIX}/" --min-age "${RETAIN_DAYS}d" || true

# ── 4. Success notification (Telegram) ──
human_size=$(numfmt --to=iec --suffix=B "$size" 2>/dev/null || echo "${size}B")
curl -fsS -X POST "$TG_NOTIFY_URL" \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"✅ Бэкап БД: \`${fname}\` (${human_size})\"}" || true

echo "[backup-db] $(date -u +%FT%TZ) done"
