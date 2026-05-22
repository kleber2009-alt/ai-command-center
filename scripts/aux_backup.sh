#!/usr/bin/env bash
#
# Daily backup of auxiliary data layers:
#  1. infra-postgres (БД приложений: leads, transcripts, voice)
#  2. tg-agent SQLite
#  3. infra-transcribe-1 SQLite
#  4. infra_voice_notes volume (mp3 files)
#
# Outputs to MinIO bucket aisales-aux-backups (new). Local retention: 7 days.
# Triggered by aisales user crontab (40 3 * * *) — after pg_backup (17 3 * * *).
#
# Восстановление: см. docs/backup-restore.md, секция «Что НЕ бэкапится».
#

set -Eeuo pipefail

CONF=/home/aisales/.config/aisales/backup.env
[[ -r "$CONF" ]] || { echo "FATAL: $CONF unreadable" >&2; exit 2; }
# shellcheck disable=SC1090
source "$CONF"

TS=$(date -u +%Y-%m-%d-%H%M%S)
LOCAL_BACKUP_DIR="${LOCAL_BACKUP_DIR%/*}/aisales-aux"
mkdir -p "$LOCAL_BACKUP_DIR"

LOG_FILE="${LOCAL_BACKUP_DIR}/../logs/aux_backup.log"
mkdir -p "$(dirname "$LOG_FILE")"

# Endpoint без схемы — для подстановки в MC_HOST_<alias>
ENDPOINT_HOSTPORT="${MINIO_ENDPOINT#http://}"
ENDPOINT_HOSTPORT="${ENDPOINT_HOSTPORT#https://}"

# Временные рабочие файлы
WORK_DIR=$(mktemp -d)
trap "rm -rf '$WORK_DIR'" EXIT

log() {
  printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*" | tee -a "$LOG_FILE"
}

hc() {
  [[ -n "${HEALTHCHECK_URL_AUX:-}" ]] || return 0
  curl -fsS --max-time 10 "$@" >/dev/null 2>&1 || true
}

hc_fail_with_log() {
  [[ -n "${HEALTHCHECK_URL_AUX:-}" ]] || return 0
  tail -50 "$LOG_FILE" \
    | curl -fsS --max-time 10 --data-binary @- "${HEALTHCHECK_URL_AUX}/fail" \
    >/dev/null 2>&1 || true
}

on_err() {
  local code=$?
  log "FAIL exit=${code} at line ${BASH_LINENO[0]}"
  hc_fail_with_log
  exit "$code"
}
trap on_err ERR

log "START aux backup"
hc "${HEALTHCHECK_URL_AUX}/start"

# ─────────────────────────────────────────────────────────────────────────────
# 1. infra-postgres dump
# ─────────────────────────────────────────────────────────────────────────────
log "[1/4] infra-postgres dump"
INFRA_PG="infra-postgres-${TS}.sql.gz"
INFRA_PG_TMP="${WORK_DIR}/${INFRA_PG}"

if ! docker exec infra-postgres pg_dump -U postgres postgres \
       | gzip -9 > "$INFRA_PG_TMP"; then
  log "ERROR: infra-postgres dump failed"
  false
fi

SIZE_INFRA=$(stat -c%s "$INFRA_PG_TMP")
log "  done size=${SIZE_INFRA}B"

# ─────────────────────────────────────────────────────────────────────────────
# 2. SQLite databases (tg-agent + infra-transcribe-1)
# ─────────────────────────────────────────────────────────────────────────────
log "[2/4] SQLite backups (tg-agent, infra-transcribe-1)"

# tg-agent:/data/state.db
TG_AGENT_DB="tg-agent-state-${TS}.sql.gz"
TG_AGENT_TMP="${WORK_DIR}/${TG_AGENT_DB}"

docker exec tg-agent sqlite3 /data/state.db ".backup ${WORK_DIR}/tg-agent-state.db" 2>/dev/null \
  && gzip -9 < "${WORK_DIR}/tg-agent-state.db" > "$TG_AGENT_TMP" \
  && rm -f "${WORK_DIR}/tg-agent-state.db"
SIZE_TG=$(stat -c%s "$TG_AGENT_TMP" 2>/dev/null || echo 0)
log "  tg-agent done size=${SIZE_TG}B"

# infra-transcribe-1:/opt/app/app.db
TRANSCRIBE_DB="transcribe-app-${TS}.sql.gz"
TRANSCRIBE_TMP="${WORK_DIR}/${TRANSCRIBE_DB}"

docker exec infra-transcribe-1 sqlite3 /opt/app/app.db ".backup ${WORK_DIR}/app.db" 2>/dev/null \
  && gzip -9 < "${WORK_DIR}/app.db" > "$TRANSCRIBE_TMP" \
  && rm -f "${WORK_DIR}/app.db"
SIZE_TRANSCRIBE=$(stat -c%s "$TRANSCRIBE_TMP" 2>/dev/null || echo 0)
log "  infra-transcribe-1 done size=${SIZE_TRANSCRIBE}B"

# ─────────────────────────────────────────────────────────────────────────────
# 3. Voice notes volume (tar.gz)
# ─────────────────────────────────────────────────────────────────────────────
log "[3/4] infra_voice_notes volume"
VOICE_TAR="voice-notes-${TS}.tar.gz"
VOICE_TAR_TMP="${WORK_DIR}/${VOICE_TAR}"

# Если volume не смонтирована в какой-то контейнер — подключаем через временный
docker run --rm --volumes-from infra-transcribe-1 \
  -v "${WORK_DIR}:/backup" \
  alpine:latest \
  tar -czf /backup/"$VOICE_TAR" -C /voice . 2>/dev/null || true

if [ -f "$VOICE_TAR_TMP" ]; then
  SIZE_VOICE=$(stat -c%s "$VOICE_TAR_TMP")
  log "  done size=${SIZE_VOICE}B"
else
  log "  volume не найден или пуст (пропускаем)"
  VOICE_TAR=""
fi

# ─────────────────────────────────────────────────────────────────────────────
# 4. Upload to MinIO (aisales-aux-backups)
# ─────────────────────────────────────────────────────────────────────────────
log "[4/4] Upload to MinIO bucket aisales-aux-backups"

MC_HOST_VAL="http://${MINIO_ACCESS_KEY}:${MINIO_SECRET_KEY}@${ENDPOINT_HOSTPORT}"

for FILE in "$INFRA_PG_TMP" "$TG_AGENT_TMP" "$TRANSCRIBE_TMP"; do
  if [ -f "$FILE" ]; then
    BASENAME=$(basename "$FILE")
    docker exec -e MC_HOST_backup="$MC_HOST_VAL" -i aisales-minio \
      mc pipe "backup/aisales-aux-backups/${BASENAME}" < "$FILE"
    log "  uploaded ${BASENAME}"
  fi
done

if [ -n "$VOICE_TAR" ] && [ -f "$VOICE_TAR_TMP" ]; then
  docker exec -e MC_HOST_backup="$MC_HOST_VAL" -i aisales-minio \
    mc pipe "backup/aisales-aux-backups/${VOICE_TAR}" < "$VOICE_TAR_TMP"
  log "  uploaded ${VOICE_TAR}"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 5. Copy to local backup directory
# ─────────────────────────────────────────────────────────────────────────────
log "Local backup copies"
for FILE in "$WORK_DIR"/*; do
  [ -f "$FILE" ] || continue
  BASENAME=$(basename "$FILE")
  cp "$FILE" "${LOCAL_BACKUP_DIR}/${BASENAME}"
  log "  copied ${BASENAME}"
done

# ─────────────────────────────────────────────────────────────────────────────
# 6. Cleanup local backups older than 7 days
# ─────────────────────────────────────────────────────────────────────────────
log "Cleanup old backups (retention: 7 days)"
find "$LOCAL_BACKUP_DIR" -maxdepth 1 -type f \
  -mtime +7 -delete

log "OK aux backup complete"
hc "${HEALTHCHECK_URL_AUX}"
