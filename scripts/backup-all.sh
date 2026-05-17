#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# scripts/backup-all.sh
# ───────────────────────────────────────────────────────────────────────
# Снимок всех персистентных слоёв в монорепо одной командой.
# Запускать на сервере; раз в сутки из cron, или руками перед апгрейдом.
#
# Покрывает:
#   1. infra-postgres-1      — БД ai-office (voices, voice_generations)
#   2. aisales-postgres      — БД aisales (clients, users)
#   3. infra-transcribe-1    — SQLite /app/data/app.db (transcribe + me + chats)
#   4. tg-agent (опц.)       — SQLite /app/data/tg-agent.db, если контейнер живой
#   5. aisales-redis         — AOF в /home/aisales/aisales/data/redis
#   6. aisales-qdrant        — векторы в /home/aisales/aisales/data/qdrant
#   7. aisales-minio         — blobs в /home/aisales/aisales/data/minio
#   8. infra_voice_notes     — docker volume с mp3 (ai-office voice-generate)
#
# Куда:
#   /opt/ai-backups/<YYYY-MM-DD>/<service>.{sql.gz|db.gz|tgz}
#   Старее $BACKUP_KEEP_DAYS дней — удаляется.
#
# Cron (root):
#   0 3 * * * /root/ai-command-center/scripts/backup-all.sh >> /var/log/ai-backup.log 2>&1
#
# Env:
#   BACKUP_ROOT          — default /opt/ai-backups
#   BACKUP_KEEP_DAYS     — default 14
#   AISALES_DATA_DIR     — default /home/aisales/aisales/data (bind-mount источник)
#   QUIET=1              — менее болтливый stdout (cron-friendly)
# ═══════════════════════════════════════════════════════════════════════

set -uo pipefail

# Cron-окружение скудное на $PATH — выставим явно.
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

BACKUP_ROOT="${BACKUP_ROOT:-/opt/ai-backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
AISALES_DATA_DIR="${AISALES_DATA_DIR:-/home/aisales/aisales/data}"
QUIET="${QUIET:-0}"

DATE="$(date +%F)"
DEST="$BACKUP_ROOT/$DATE"
mkdir -p "$DEST"

# Счётчики и лог
declare -i N_OK=0 N_FAIL=0 N_SKIP=0
LOG_FILE="$BACKUP_ROOT/backup.log"

log() { echo "[$(date -Iseconds)] $*" | tee -a "$LOG_FILE"; }
say() { [ "$QUIET" = "1" ] || log "$*"; }
ok()   { say "  ✓ $*"; N_OK=$((N_OK+1)); }
fail() { log "  ✗ $*"; N_FAIL=$((N_FAIL+1)); }
skip() { say "  · $*"; N_SKIP=$((N_SKIP+1)); }

is_running() {
  docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$1"
}

human_size() {
  [ -f "$1" ] && du -h "$1" 2>/dev/null | cut -f1 || echo "0"
}

# ── 1. Postgres dump через docker exec ───────────────────────────────
dump_pg() {
  local container="$1" out="$2"
  if ! is_running "$container"; then
    skip "$container не запущен"
    return
  fi
  local pg_user pg_db
  pg_user="$(docker exec "$container" printenv POSTGRES_USER 2>/dev/null || true)"
  pg_db="$(docker exec   "$container" printenv POSTGRES_DB   2>/dev/null || true)"
  [ -z "$pg_user" ] && pg_user="postgres"
  [ -z "$pg_db" ]   && pg_db="postgres"

  if docker exec "$container" pg_dump -U "$pg_user" "$pg_db" 2>/dev/null | gzip > "$out"; then
    ok "$container ($pg_db) → $(basename "$out") ($(human_size "$out"))"
  else
    fail "$container pg_dump failed"
    rm -f "$out"
  fi
}

# ── 2. SQLite — три пути с graceful fallback ──────────────────────────
# A) если в контейнере есть sqlite3 → online .backup (самый чистый)
# B) если на хосте есть sqlite3     → docker cp файл + online .backup на хосте
# C) fallback                       → tar файлов БД (.db + .db-wal + .db-shm)
#    WAL восстановится при следующем open.
dump_sqlite() {
  local container="$1" path="$2" out="$3"
  if ! is_running "$container"; then
    skip "$container не запущен"
    return
  fi
  # Если БД ещё ни разу не открывалась — файла нет, бэкапить нечего.
  if ! docker exec "$container" test -f "$path" 2>/dev/null; then
    skip "$container:$path (БД ещё не создана — приложение не использовалось)"
    return
  fi

  # A: sqlite3 внутри контейнера
  if docker exec "$container" sh -c 'command -v sqlite3' >/dev/null 2>&1; then
    local tmp="/tmp/sqlite-bk-$$.db"
    if docker exec "$container" sqlite3 "$path" ".backup $tmp" 2>/dev/null \
       && docker cp "$container:$tmp" "$out" 2>/dev/null; then
      docker exec "$container" rm -f "$tmp" 2>/dev/null || true
      gzip -f "$out"
      ok "$container:$path → $(basename "$out").gz [in-container] ($(human_size "${out}.gz"))"
      return
    fi
  fi

  # B: sqlite3 на хосте — копируем БД наружу, делаем .backup, гзипуем
  if command -v sqlite3 >/dev/null 2>&1; then
    local host_tmp="/tmp/sqlite-host-$$.db"
    local host_bk="/tmp/sqlite-host-bk-$$.db"
    if docker cp "$container:$path" "$host_tmp" 2>/dev/null; then
      # WAL файл тоже копируем, иначе свежие записи потеряются.
      docker cp "$container:${path}-wal" "${host_tmp}-wal" 2>/dev/null || true
      docker cp "$container:${path}-shm" "${host_tmp}-shm" 2>/dev/null || true
      if sqlite3 "$host_tmp" ".backup $host_bk" 2>/dev/null; then
        mv "$host_bk" "$out"
        gzip -f "$out"
        ok "$container:$path → $(basename "$out").gz [host-sqlite3] ($(human_size "${out}.gz"))"
        rm -f "$host_tmp" "${host_tmp}-wal" "${host_tmp}-shm"
        return
      fi
      rm -f "$host_tmp" "${host_tmp}-wal" "${host_tmp}-shm" "$host_bk"
    fi
  fi

  # C: fallback — tar файлов БД через docker cp
  local stage="/tmp/sqlite-stage-$$"
  mkdir -p "$stage"
  if docker cp "$container:$path" "$stage/" 2>/dev/null; then
    docker cp "$container:${path}-wal" "$stage/" 2>/dev/null || true
    docker cp "$container:${path}-shm" "$stage/" 2>/dev/null || true
    local tar_out="${out%.db}.tgz"
    if tar czf "$tar_out" -C "$stage" . 2>/dev/null; then
      ok "$container:$path → $(basename "$tar_out") [tar fallback] ($(human_size "$tar_out"))"
      rm -rf "$stage"
      return
    fi
    rm -rf "$stage"
  fi

  fail "$container:$path — все три метода не сработали"
}

# ── 3. tar bind-каталога ──────────────────────────────────────────────
tar_dir() {
  local label="$1" src="$2" out="$3"
  if [ ! -d "$src" ]; then
    skip "$label ($src нет на диске)"
    return
  fi
  if tar czf "$out" -C "$(dirname "$src")" "$(basename "$src")" 2>/dev/null; then
    ok "$label ($src) → $(basename "$out") ($(human_size "$out"))"
  else
    fail "$label tar failed"
    rm -f "$out"
  fi
}

# ── 4. tar docker volume ──────────────────────────────────────────────
tar_volume() {
  local label="$1" volume="$2" out="$3"
  if ! docker volume inspect "$volume" >/dev/null 2>&1; then
    skip "$label (volume $volume не найден)"
    return
  fi
  if docker run --rm -v "$volume:/src:ro" alpine sh -c 'cd / && tar czf - src' > "$out" 2>/dev/null; then
    ok "$label (vol $volume) → $(basename "$out") ($(human_size "$out"))"
  else
    fail "$label volume tar failed"
    rm -f "$out"
  fi
}

# ── Redis BGSAVE перед tar для консистентности ────────────────────────
flush_redis() {
  local container="$1"
  is_running "$container" || return
  # Пароль вытянем из аргументов docker (--requirepass <pw>)
  local pass
  pass=$(docker inspect "$container" --format '{{join .Args " "}}' 2>/dev/null \
         | grep -oE -- '--requirepass [^ ]+' | awk '{print $2}' | head -1)
  if [ -n "$pass" ]; then
    docker exec "$container" redis-cli -a "$pass" --no-auth-warning BGSAVE >/dev/null 2>&1 || true
  else
    docker exec "$container" redis-cli BGSAVE >/dev/null 2>&1 || true
  fi
  sleep 2
}

# ═════════════════════════════════════════════════════════════════════
log "═══ Backup → $DEST ═══"

# 1. infra-postgres
dump_pg infra-postgres-1 "$DEST/infra-postgres.sql.gz"

# 2. aisales-postgres
dump_pg aisales-postgres "$DEST/aisales-postgres.sql.gz"

# 3. transcribe SQLite
dump_sqlite infra-transcribe-1 /app/data/app.db "$DEST/transcribe-app.db"

# 4. tg-agent SQLite (если будет добавлен и запущен)
for tg_name in tg-agent tg-agent-1 infra-tg-agent-1; do
  if is_running "$tg_name"; then
    dump_sqlite "$tg_name" /app/data/tg-agent.db "$DEST/tg-agent.db"
    break
  fi
done

# 5. Redis с BGSAVE
flush_redis aisales-redis
tar_dir "aisales-redis" "$AISALES_DATA_DIR/redis" "$DEST/aisales-redis.tgz"

# 6. Qdrant
tar_dir "aisales-qdrant" "$AISALES_DATA_DIR/qdrant" "$DEST/aisales-qdrant.tgz"

# 7. MinIO
tar_dir "aisales-minio" "$AISALES_DATA_DIR/minio" "$DEST/aisales-minio.tgz"

# 8. voice-notes (named volume)
tar_volume "infra-voice-notes" "infra_voice_notes" "$DEST/infra-voice-notes.tgz"

# ── Ротация ───────────────────────────────────────────────────────────
say "  rotation: удаляю папки старше $KEEP_DAYS дней в $BACKUP_ROOT"
find "$BACKUP_ROOT" -maxdepth 1 -type d -name '20*' -mtime +"$KEEP_DAYS" \
  -exec rm -rf {} \; 2>/dev/null || true

# Также удалим старые миграционные снимки (aisales-mig-*) старше KEEP_DAYS дней
find "$BACKUP_ROOT" -maxdepth 1 -type d -name 'aisales-mig-*' -mtime +"$KEEP_DAYS" \
  -exec rm -rf {} \; 2>/dev/null || true

# ── Итого ─────────────────────────────────────────────────────────────
TOTAL_SIZE="$(du -sh "$DEST" 2>/dev/null | cut -f1)"
log "═══ Done: $N_OK ok · $N_FAIL fail · $N_SKIP skip · total $TOTAL_SIZE ═══"

# Manifest на случай восстановления
{
  echo "Backup $DATE"
  echo "Date:   $(date -Iseconds)"
  echo "Host:   $(hostname)"
  echo "Total:  $TOTAL_SIZE"
  echo ""
  echo "Contents:"
  ls -lh "$DEST" | tail -n +2
} > "$DEST/MANIFEST.txt"

[ "$N_FAIL" -gt 0 ] && exit 2
exit 0
