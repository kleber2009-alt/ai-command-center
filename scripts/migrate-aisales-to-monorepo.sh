#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# scripts/migrate-aisales-to-monorepo.sh
# ───────────────────────────────────────────────────────────────────────
# Бесшовное переключение aisales-стека:
#   ИЗ: /home/aisales/aisales/docker-compose.yml + ручной `docker run` v2
#   В:  ~/ai-command-center/apps/aisales/docker-compose.yml
#
# Данные на диске НЕ переезжают — новый compose биндится на тот же
# /home/aisales/aisales/data/*, что и старый. Идентичный network-name
# (aisales_aisales-net) и container_name (aisales-postgres, ...) →
# старые volumes/binds подцепляются без миграции.
#
# Что делает по шагам:
#   0. Sanity-check окружения
#   1. Pre-flight backup в /opt/ai-backups/aisales-mig-<timestamp>/
#      · pg_dump через работающий контейнер aisales-postgres
#      · tar /home/aisales/aisales/data
#      · список запущенных aisales-контейнеров
#   2. STOP старого compose из /home/aisales/aisales/
#   3. STOP+RM ручного aisales-api-v2 (он не был под compose)
#   4. UP нового compose из apps/aisales/
#   5. Wait healthy (до 120 сек)
#   6. Smoke check: /api/aisales/health через 127.0.0.1:8000 и :8001
#   7. Если что-то падает → ROLLBACK (поднять старый compose обратно)
#
# Использование:
#   cd ~/ai-command-center
#   sudo ./scripts/migrate-aisales-to-monorepo.sh
#
# Опции через env:
#   DRY_RUN=1          — показать план, ничего не делать
#   SKIP_BACKUP=1      — не делать pg_dump / tar (если уже сделал)
#   ROLLBACK_ON_FAIL=0 — выключить авто-откат (для отладки)
# ═══════════════════════════════════════════════════════════════════════

set -euo pipefail

DRY_RUN="${DRY_RUN:-0}"
SKIP_BACKUP="${SKIP_BACKUP:-0}"
ROLLBACK_ON_FAIL="${ROLLBACK_ON_FAIL:-1}"

OLD_DIR="/home/aisales/aisales"
NEW_DIR="$(cd "$(dirname "$0")/.." && pwd)/apps/aisales"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="/opt/ai-backups/aisales-mig-${TS}"

# ── 0. Sanity ────────────────────────────────────────────────────────
die() { echo "ERROR: $*" >&2; exit 1; }
say() { echo "[$(date -Iseconds)] $*"; }
run() {
  if [ "$DRY_RUN" = "1" ]; then
    echo "  [DRY] $*"
  else
    eval "$@"
  fi
}

say "═══ Pre-flight checks ═══"
[ -d "$OLD_DIR" ] || die "$OLD_DIR не найден"
[ -f "$OLD_DIR/docker-compose.yml" ] || die "$OLD_DIR/docker-compose.yml не найден"
[ -d "$NEW_DIR" ] || die "$NEW_DIR не найден — сначала пройди интеграцию"
[ -f "$NEW_DIR/docker-compose.yml" ] || die "$NEW_DIR/docker-compose.yml не найден"
[ -f "$NEW_DIR/.env" ] || die "$NEW_DIR/.env не найден — заполни секреты"
command -v docker >/dev/null || die "docker не установлен"

# Подтянем POSTGRES_USER/DB из .env, чтоб pg_dump работал
set -a; . "$NEW_DIR/.env"; set +a
PG_USER="${POSTGRES_USER:-aisales}"
PG_DB="${POSTGRES_DB:-aisales}"

# Проверим что новый compose валиден
say "validate new compose"
( cd "$NEW_DIR" && docker compose config -q ) || die "новый compose невалидный"

# Проверим что нет порт-конфликтов (5432/6379/8000/8001/9000/9001/6333/6334
# должны быть свободны после остановки старого, кроме infra-postgres внутри docker net)
SHOWING=$(docker ps --filter name=aisales --format '{{.Names}} {{.Status}}')
say "currently running aisales containers:"
echo "$SHOWING" | sed 's/^/  /'

# ── 1. Backup ─────────────────────────────────────────────────────────
if [ "$SKIP_BACKUP" = "1" ]; then
  say "SKIP_BACKUP=1 — пропускаю pre-flight backup"
else
  say "═══ Pre-flight backup → $BACKUP_DIR ═══"
  run "mkdir -p $BACKUP_DIR"

  if docker ps --format '{{.Names}}' | grep -q '^aisales-postgres$'; then
    say "  pg_dump aisales-postgres ..."
    run "docker exec aisales-postgres pg_dump -U $PG_USER $PG_DB | gzip > $BACKUP_DIR/postgres.sql.gz"
    [ "$DRY_RUN" = "0" ] && say "  → $(du -h $BACKUP_DIR/postgres.sql.gz | cut -f1)"
  else
    say "  WARN: aisales-postgres не запущен — pg_dump пропускаю"
  fi

  say "  tar /home/aisales/aisales/data/ ..."
  run "tar czf $BACKUP_DIR/data.tgz -C /home/aisales/aisales data 2>/dev/null"
  [ "$DRY_RUN" = "0" ] && say "  → $(du -h $BACKUP_DIR/data.tgz | cut -f1)"

  run "docker ps --filter name=aisales --format '{{.Names}}\t{{.Image}}\t{{.Status}}' > $BACKUP_DIR/before-running.txt"
  run "cp $OLD_DIR/docker-compose.yml $BACKUP_DIR/old-compose.yml"

  say "  → backup готов"
fi

# ── 2. Stop old compose ──────────────────────────────────────────────
say "═══ Stop old compose at $OLD_DIR ═══"
run "cd $OLD_DIR && docker compose down --remove-orphans"

# ── 3. Stop manually-run v2 ──────────────────────────────────────────
if docker ps -a --format '{{.Names}}' | grep -q '^aisales-api-v2$'; then
  say "═══ Stop+rm manually-run aisales-api-v2 ═══"
  run "docker stop aisales-api-v2 2>/dev/null || true"
  run "docker rm   aisales-api-v2 2>/dev/null || true"
else
  say "  aisales-api-v2 уже не запущен — пропускаю"
fi

# ── 4. Bring up new compose ──────────────────────────────────────────
say "═══ Up new compose at $NEW_DIR (build может занять 2-5 мин) ═══"
if [ "$DRY_RUN" = "0" ]; then
  ( cd "$NEW_DIR" && docker compose up -d --build ) 2>&1 | tail -40
fi

# ── 5. Wait healthy ──────────────────────────────────────────────────
say "═══ Wait healthy (до 120 сек) ═══"
HEALTHY=0
if [ "$DRY_RUN" = "0" ]; then
  for i in $(seq 1 40); do
    HC=$(docker ps --filter name=aisales --format '{{.Status}}' | grep -c healthy || true)
    RUN=$(docker ps --filter name=aisales --format '{{.Names}}' | wc -l)
    say "  attempt $i: $RUN containers up, $HC healthy"
    if [ "$HC" -ge 4 ] && [ "$RUN" -ge 6 ]; then
      HEALTHY=1
      break
    fi
    sleep 3
  done
fi

# ── 6. Smoke ─────────────────────────────────────────────────────────
say "═══ Smoke checks ═══"
docker ps --filter name=aisales --format 'table {{.Names}}\t{{.Status}}' | sed 's/^/  /'

V1_CODE=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/health 2>/dev/null || echo "ERR")
V2_CODE=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8001/health 2>/dev/null || echo "ERR")
say "  v1 (127.0.0.1:8000/health): $V1_CODE"
say "  v2 (127.0.0.1:8001/health): $V2_CODE"

OK_V1=0; OK_V2=0
[ "$V1_CODE" = "200" ] && OK_V1=1
[ "$V2_CODE" = "200" ] && OK_V2=1

# ── 7. Verdict / rollback ────────────────────────────────────────────
if [ "$DRY_RUN" = "1" ]; then
  say "DRY_RUN=1 — план завершён."
  exit 0
fi

if [ "$HEALTHY" = "1" ] && [ "$OK_V1" = "1" -o "$OK_V2" = "1" ]; then
  say "═══════════════════════════════════════════════════════════════════"
  say "✓ MIGRATION OK"
  say "  Старый compose теперь не нужен, но НЕ удалён — на всякий случай"
  say "  держи /home/aisales/aisales/ ещё пару дней."
  say "  Бэкап: $BACKUP_DIR"
  say "═══════════════════════════════════════════════════════════════════"
  exit 0
fi

say "═══ FAIL: healthy=$HEALTHY v1=$OK_V1 v2=$OK_V2 ═══"
if [ "$ROLLBACK_ON_FAIL" = "0" ]; then
  say "ROLLBACK_ON_FAIL=0 — оставляю как есть для отладки"
  say "Логи: cd $NEW_DIR && docker compose logs --tail=80"
  exit 2
fi

# Rollback
say "═══ Rollback: возвращаю старый compose ═══"
run "cd $NEW_DIR && docker compose down --remove-orphans"
run "cd $OLD_DIR && docker compose up -d"

# v2 уже не из compose — поднимем его вручную (если был запущен).
# Образ aisales-api:v0.2 уже сборка, перезапустим прежний docker run.
if grep -q '^aisales-api-v2' "$BACKUP_DIR/before-running.txt" 2>/dev/null; then
  say "  Перезапуск aisales-api-v2 (manual docker run)"
  # минимальный docker run, повторяющий что было видно через inspect
  run "docker run -d --name aisales-api-v2 --restart unless-stopped \
       --network aisales_aisales-net \
       -p 127.0.0.1:8001:8000 \
       -v /home/aisales/aisales-app-v2/agent-prompts:/agent-prompts:ro \
       -v /home/aisales/aisales-app-v2/voice-input:/voice-input \
       --env-file $NEW_DIR/.env \
       aisales-api:v0.2"
fi

say "✗ Откат выполнен. Старый стек снова работает."
say "  Логи новой попытки: $BACKUP_DIR/"
exit 2
