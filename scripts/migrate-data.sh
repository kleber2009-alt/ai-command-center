#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# scripts/migrate-data.sh
# ───────────────────────────────────────────────────────────────────────
# Обёртка над migrate-from-supabase.sh + migrate-storage.mjs.
# Запускать НА сервере, из /opt/ai-stack, под юзером `ai`.
#
# Спрашивает supabase-кредиты, прогоняет:
#   1. pg_dump из Supabase → psql в локальный pg
#   2. node-скрипт, который качает все mp3 из Supabase Storage в
#      ./voice-notes-export, потом docker cp в volume ai-office.
#
# Идемпотентно: на повторе пропустит уже скачанные файлы, дубликаты
# в pg попадут через `ON CONFLICT (id) DO NOTHING` (включается ниже).
# ═══════════════════════════════════════════════════════════════════════

set -euo pipefail

STACK_DIR="${STACK_DIR:-/opt/ai-stack}"
cd "$STACK_DIR"

# .env читаем чтобы знать POSTGRES_USER/PASSWORD/DB
if [ ! -f .env ]; then
  echo "ERROR: .env не найден в $STACK_DIR"; exit 1
fi
set -a; . ./.env; set +a

POSTGRES_USER="${POSTGRES_USER:-ai}"
POSTGRES_DB="${POSTGRES_DB:-ai}"

ask() {
  local var="$1" prompt="$2" secret="${3:-0}"
  if [ -n "${!var:-}" ]; then return; fi
  if [ "$secret" = "1" ]; then
    printf "%s: " "$prompt" >&2; stty -echo; read v; stty echo; echo >&2
  else
    printf "%s: " "$prompt" >&2; read v
  fi
  eval "$var=\$v"
}

# ── 1. Дамп БД из Supabase ─────────────────────────────────────────────
echo "═══ 1/2 Перенос данных Postgres из Supabase ═══"
ask SUPABASE_DB_URL "Supabase DB URL (Project Settings → Database → Connection string → URI)"

DUMP_FILE="/tmp/supabase-dump-$(date +%s).sql"
TABLES=(transcripts tasks me_profile me_documents me_chunks voices voice_generations)
EXTRA_ARGS=()
for t in "${TABLES[@]}"; do EXTRA_ARGS+=("--table=public.$t"); done

echo "→ pg_dump из Supabase в $DUMP_FILE"
if ! pg_dump --version >/dev/null 2>&1; then
  echo "ERROR: pg_dump не установлен. На VPS: sudo apt install postgresql-client-16"
  exit 1
fi

pg_dump \
  --data-only --no-owner --no-privileges \
  --disable-triggers --column-inserts \
  "${EXTRA_ARGS[@]}" \
  "$SUPABASE_DB_URL" > "$DUMP_FILE"

SIZE=$(wc -c < "$DUMP_FILE")
echo "  готов: $DUMP_FILE ($SIZE bytes)"

echo "→ Загружаю в локальный Postgres"
# Для повторных прогонов: ON CONFLICT DO NOTHING. column-inserts генерит
# INSERT INTO table (...) VALUES (...); — заменяем на ON CONFLICT.
# id у нас uuid PRIMARY KEY везде, так что конфликт = дубликат.
sed -i 's/);$/) ON CONFLICT (id) DO NOTHING;/g' "$DUMP_FILE" || true

docker compose exec -T postgres psql \
  -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -v ON_ERROR_STOP=1 < "$DUMP_FILE"

echo "→ Проверка количества строк:"
for t in "${TABLES[@]}"; do
  N=$(docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
        -tAc "select count(*) from $t" 2>/dev/null || echo "—")
  printf "  %-20s %s\n" "$t:" "$N"
done

# ── 2. mp3 из Supabase Storage ─────────────────────────────────────────
echo ""
echo "═══ 2/2 Перенос mp3 из Supabase Storage ═══"
ask SUPABASE_URL          "Supabase Project URL (https://xxx.supabase.co)"
ask SUPABASE_SERVICE_KEY  "Supabase service_role key" 1

# Скрипту нужен прямой коннект к pg для чтения списка audio_path.
# Внутри контейнера ai-office DATABASE_URL уже есть, проще запустить
# скрипт оттуда.
echo "→ Копирую migrate-storage.mjs в контейнер ai-office"
docker compose cp scripts/migrate-storage.mjs ai-office:/tmp/migrate-storage.mjs
docker compose cp ai-office-project/server/package.json ai-office:/tmp/migrate-pkg.json
docker compose cp ai-office-project/server/package-lock.json ai-office:/tmp/migrate-pkg-lock.json 2>/dev/null || true

echo "→ Запускаю скачку mp3 (внутри ai-office, в /tmp/voice-notes-export)"
docker compose exec \
  -e SUPABASE_URL="$SUPABASE_URL" \
  -e SUPABASE_SERVICE_KEY="$SUPABASE_SERVICE_KEY" \
  -e DATABASE_URL="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}" \
  -e VOICE_NOTES_DIR="/tmp/voice-notes-export" \
  ai-office sh -c '
    set -eu
    cd /tmp
    [ -d node_modules/pg ] || (cp migrate-pkg.json package.json && cd server 2>/dev/null || true; cd /tmp && cp /app/server/node_modules -r node_modules 2>/dev/null) || true
    # pg уже стоит в ai-office (server/node_modules/pg)
    NODE_PATH=/app/server/node_modules node migrate-storage.mjs
  '

echo "→ Перекладываю файлы из /tmp/voice-notes-export в volume /data/voice-notes"
docker compose exec ai-office sh -c '
  if [ -d /tmp/voice-notes-export ]; then
    mkdir -p /data/voice-notes
    cp -rn /tmp/voice-notes-export/. /data/voice-notes/
    echo "  скопировано $(find /tmp/voice-notes-export -type f | wc -l) файлов"
    rm -rf /tmp/voice-notes-export
  else
    echo "  (нечего копировать)"
  fi
'

# ── Финальный sanity check ─────────────────────────────────────────────
echo ""
echo "═══ Sanity check ═══"
echo "  /api/transcribe/history:"
curl -fsS http://127.0.0.1/api/transcribe/history | head -c 400
echo ""
echo ""
echo "  /api/me/documents:"
curl -fsS http://127.0.0.1/api/me/documents | head -c 400
echo ""
echo ""
echo "  voice-notes на диске:"
docker compose exec ai-office sh -c 'find /data/voice-notes -type f | wc -l' || echo "0"

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "✓ Миграция завершена"
echo "═══════════════════════════════════════════════════════════════════"

rm -f "$DUMP_FILE"
