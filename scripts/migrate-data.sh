#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# scripts/migrate-data.sh
# ───────────────────────────────────────────────────────────────────────
# Обёртка: переносит БД и mp3 из Supabase в наш self-hosted стек.
# Запускать НА сервере, из /opt/ai-stack, под юзером `ai`.
#
# Шаги:
#   1. pg_dump из Supabase → psql в локальный pg
#   2. node-скрипт качает mp3 из Supabase Storage и кладёт прямо в
#      docker volume voice-notes (через контейнер ai-office, в котором
#      уже стоит pg).
#
# Полностью идемпотентно:
#   · pg_dump делается с ON CONFLICT (id) DO NOTHING — дубликаты в pg
#     просто пропустятся.
#   · migrate-storage.mjs сам пропускает уже скачанные файлы.
# ═══════════════════════════════════════════════════════════════════════

set -euo pipefail

STACK_DIR="${STACK_DIR:-/opt/ai-stack}"
cd "$STACK_DIR"

if [ ! -f .env ]; then
  echo "ERROR: .env не найден в $STACK_DIR"; exit 1
fi
set -a; . ./.env; set +a

POSTGRES_USER="${POSTGRES_USER:-ai}"
POSTGRES_DB="${POSTGRES_DB:-ai}"
: "${POSTGRES_PASSWORD:?ERROR: POSTGRES_PASSWORD не задан в .env}"

ask() {
  local var="$1" prompt="$2" secret="${3:-0}"
  if [ -n "${!var:-}" ]; then return; fi
  local v
  if [ "$secret" = "1" ]; then
    printf "%s: " "$prompt" >&2
    stty -echo; read -r v; stty echo; echo >&2
  else
    printf "%s: " "$prompt" >&2
    read -r v
  fi
  printf -v "$var" '%s' "$v"
  export "$var"
}

# ── 1. Дамп БД из Supabase ─────────────────────────────────────────────
echo "═══ 1/2 Перенос данных Postgres из Supabase ═══"
ask SUPABASE_DB_URL "Supabase DB URL (Project Settings → Database → Connection string → URI)"

if ! command -v pg_dump >/dev/null; then
  echo "ERROR: pg_dump не установлен."
  echo "       На VPS: sudo bash scripts/bootstrap-vps.sh — поставит автоматически."
  exit 1
fi

PG_VER=$(pg_dump --version | awk '{print $3}')
echo "→ pg_dump v$PG_VER"

DUMP_FILE="/tmp/supabase-dump-$(date +%s).sql"
TABLES=(transcripts tasks me_profile me_documents me_chunks voices voice_generations)
EXTRA_ARGS=()
for t in "${TABLES[@]}"; do EXTRA_ARGS+=("--table=public.$t"); done

echo "→ pg_dump из Supabase в $DUMP_FILE"
pg_dump \
  --data-only --no-owner --no-privileges \
  --disable-triggers --column-inserts \
  "${EXTRA_ARGS[@]}" \
  "$SUPABASE_DB_URL" > "$DUMP_FILE"

SIZE=$(wc -c < "$DUMP_FILE")
echo "  готов: $DUMP_FILE ($SIZE bytes)"

# pg_dump --column-inserts кладёт каждый INSERT на отдельную строку.
# Заменяем ');' → ') ON CONFLICT DO NOTHING;' — повторный прогон не
# валится на дубликатах. ON CONFLICT без указания колонок работает для
# любого PK/UNIQUE, в т.ч. для me_profile (id='singleton', text).
echo "→ Патчу дамп: добавляю ON CONFLICT DO NOTHING"
sed -i.bak 's/^);\s*$/) ON CONFLICT DO NOTHING;/' "$DUMP_FILE"
rm -f "${DUMP_FILE}.bak"

echo "→ Загружаю в локальный Postgres (docker compose exec)"
docker compose exec -T postgres psql \
  -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -v ON_ERROR_STOP=1 < "$DUMP_FILE" | tail -30

echo "→ Проверяю количество строк:"
for t in "${TABLES[@]}"; do
  N=$(docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
        -tAc "select count(*) from $t" 2>/dev/null || echo "—")
  printf "  %-22s %s\n" "$t:" "$N"
done

# ── 2. mp3 из Supabase Storage ─────────────────────────────────────────
echo ""
echo "═══ 2/2 Перенос mp3 из Supabase Storage ═══"

# Если voice_generations пуст — нечего переносить, выходим тихо.
VG_COUNT=$(docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -tAc "select count(*) from voice_generations where audio_path is not null" 2>/dev/null || echo "0")
VG_COUNT=$(echo "$VG_COUNT" | tr -d '[:space:]')

if [ "$VG_COUNT" = "0" ]; then
  echo "→ В voice_generations нет ни одной строки с audio_path — пропускаю Storage."
  rm -f "$DUMP_FILE"
  echo ""
  echo "✓ Миграция завершена"
  exit 0
fi
echo "→ Найдено $VG_COUNT mp3-файлов на перенос"

ask SUPABASE_URL         "Supabase Project URL (https://xxx.supabase.co)"
ask SUPABASE_SERVICE_KEY "Supabase service_role key" 1

# Подгружаем скрипт в /app/server контейнера ai-office — там уже стоит
# pg в node_modules, ничего отдельно ставить не нужно.
echo "→ Копирую migrate-storage.mjs в контейнер ai-office"
docker compose cp scripts/migrate-storage.mjs ai-office:/app/server/migrate-storage.mjs

echo "→ Запускаю скачку mp3 → /data/voice-notes (это занимает ~1 сек/файл)"
docker compose exec -T \
  -e SUPABASE_URL="$SUPABASE_URL" \
  -e SUPABASE_SERVICE_KEY="$SUPABASE_SERVICE_KEY" \
  -e DATABASE_URL="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}" \
  -e VOICE_NOTES_DIR="/data/voice-notes" \
  ai-office sh -c 'cd /app/server && node migrate-storage.mjs'

DISK_COUNT=$(docker compose exec -T ai-office sh -c 'find /data/voice-notes -type f 2>/dev/null | wc -l' | tr -d '[:space:]')
echo "→ На диске сейчас $DISK_COUNT файлов в /data/voice-notes/"

# ── Финальный sanity check ─────────────────────────────────────────────
echo ""
echo "═══ Sanity check (curl 127.0.0.1) ═══"
echo "  /api/transcribe/history:"
curl -fsS http://127.0.0.1/api/transcribe/history 2>/dev/null | head -c 300 || true
echo ""
echo "  /api/me/documents:"
curl -fsS http://127.0.0.1/api/me/documents 2>/dev/null | head -c 300 || true
echo ""

rm -f "$DUMP_FILE"

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "✓ Миграция завершена"
echo "═══════════════════════════════════════════════════════════════════"
