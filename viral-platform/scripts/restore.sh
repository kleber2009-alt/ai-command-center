#!/usr/bin/env bash
# Restore a viral-platform Postgres dump (made by backup.sh) into the
# vp-postgres container. Idempotent: drops & recreates existing objects.
#
# Usage:   ./restore.sh /root/backups/viral-platform/vp_pg_YYYYMMDD_HHMMSS.dump
#
# Requires the target to run the pgvector image (>= 0.8 for halfvec HNSW).
# Stop the workers + web first so nothing writes mid-restore:
#   docker compose -f docker-compose.prod.yml stop vp-web vp-worker-*
set -euo pipefail

DUMP="${1:?usage: restore.sh <dump-file>}"
[ -f "$DUMP" ] || { echo "no such dump: $DUMP" >&2; exit 1; }

PG_CONTAINER="${VP_PG_CONTAINER:-vp-postgres}"
ENV_FILE="${VP_ENV_FILE:-/etc/viral-platform.env}"
read_env() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- || true; }
PGUSER="$(read_env POSTGRES_USER)"; : "${PGUSER:=viral}"
PGDB="$(read_env POSTGRES_DB)";     : "${PGDB:=viral_platform}"

echo "[restore] ensuring pgvector extension in '$PGDB'"
docker exec -i "$PG_CONTAINER" psql -U "$PGUSER" -d "$PGDB" \
  -c 'CREATE EXTENSION IF NOT EXISTS vector;'

echo "[restore] pg_restore (clean) from $DUMP"
docker exec -i "$PG_CONTAINER" pg_restore -U "$PGUSER" -d "$PGDB" \
  --clean --if-exists --no-owner --no-privileges < "$DUMP"

echo "[restore] verify"
docker exec -i "$PG_CONTAINER" psql -U "$PGUSER" -d "$PGDB" -tAc \
  "SELECT count(*)||' tables, '||(SELECT count(*) FROM pg_indexes WHERE indexdef LIKE '%hnsw%')||' hnsw idx' FROM pg_tables WHERE schemaname='public';"
echo "[restore] done"
