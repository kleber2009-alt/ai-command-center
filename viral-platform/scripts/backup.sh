#!/usr/bin/env bash
# Back up the viral-platform Postgres (pgvector) database from the vp-postgres
# container to a timestamped custom-format dump, with local retention.
#
# The dump includes the schema, all data (incl. pgvector embeddings) and the
# CREATE EXTENSION statements, so it restores standalone into a pgvector image.
#
# Usage:   ./backup.sh
# Cron:    17 3 * * *  /root/ai-command-center-vp/viral-platform/scripts/backup.sh >> /var/log/vp-backup.log 2>&1
#
# Override via env:
#   VP_PG_CONTAINER (vp-postgres)  VP_ENV_FILE (/etc/viral-platform.env)
#   VP_BACKUP_DIR (/root/backups/viral-platform)  VP_BACKUP_RETAIN_DAYS (14)
set -euo pipefail

PG_CONTAINER="${VP_PG_CONTAINER:-vp-postgres}"
ENV_FILE="${VP_ENV_FILE:-/etc/viral-platform.env}"
OUT_DIR="${VP_BACKUP_DIR:-/root/backups/viral-platform}"
RETAIN_DAYS="${VP_BACKUP_RETAIN_DAYS:-14}"

read_env() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- || true; }
PGUSER="$(read_env POSTGRES_USER)"; : "${PGUSER:=viral}"
PGDB="$(read_env POSTGRES_DB)";     : "${PGDB:=viral_platform}"

mkdir -p "$OUT_DIR"
TS="$(date -u +%Y%m%d_%H%M%S)"
OUT="$OUT_DIR/vp_pg_${TS}.dump"

echo "[backup] $(date -u +%FT%TZ) pg_dump '$PGDB' (user $PGUSER) → $OUT"
docker exec "$PG_CONTAINER" pg_dump -U "$PGUSER" -d "$PGDB" \
  -Fc --no-owner --no-privileges > "$OUT"

# Fail loudly if the dump is suspiciously small (pg_dump custom header is ~ hundreds of bytes).
if [ "$(stat -c%s "$OUT")" -lt 1000 ]; then
  echo "[backup] ERROR: dump too small, removing" >&2; rm -f "$OUT"; exit 1
fi
echo "[backup] ok, size $(du -h "$OUT" | cut -f1)"

# Optional off-box copy to S3/R2 if rclone is configured (VP_RCLONE_REMOTE=remote:bucket/path).
if [ -n "${VP_RCLONE_REMOTE:-}" ] && command -v rclone >/dev/null 2>&1; then
  echo "[backup] rclone copy → $VP_RCLONE_REMOTE"
  rclone copy "$OUT" "$VP_RCLONE_REMOTE"
fi

find "$OUT_DIR" -name 'vp_pg_*.dump' -mtime +"$RETAIN_DAYS" -delete
echo "[backup] retention: kept last ${RETAIN_DAYS} days"
