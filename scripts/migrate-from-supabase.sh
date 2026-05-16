#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# scripts/migrate-from-supabase.sh
# ───────────────────────────────────────────────────────────────────────
# Один прогон: дамп всех таблиц приложения из Supabase + загрузка в
# локальный Postgres внутри docker-compose.
#
# Что переносим:
#   · transcripts, tasks
#   · me_profile, me_documents, me_chunks (RAG, vector(1536))
#   · voices, voice_generations (если есть)
#
# Что НЕ переносим:
#   · public.* служебные таблицы Supabase (auth.*, storage.*, etc.)
#   · сам Supabase Storage — отдельным скриптом migrate-storage.js
#
# Требует:
#   · pg_dump >= 16 (apt install postgresql-client-16)
#   · контейнер postgres из docker-compose должен быть поднят
#   · SUPABASE_DB_URL — connection string к Supabase pooler/direct DB:
#       Project Settings → Database → Connection string → URI
#     Формат: postgres://postgres.PROJECT_REF:PASSWORD@aws-0-eu-...:6543/postgres
# ═══════════════════════════════════════════════════════════════════════

set -euo pipefail

SUPABASE_DB_URL="${SUPABASE_DB_URL:-}"
if [ -z "$SUPABASE_DB_URL" ]; then
  echo "ERROR: задайте SUPABASE_DB_URL"
  echo "  Project Settings → Database → Connection string → URI"
  exit 1
fi

TABLES=(
  transcripts
  tasks
  me_profile
  me_documents
  me_chunks
  voices
  voice_generations
)

DUMP_FILE="${DUMP_FILE:-./supabase-dump.sql}"

echo "→ Дамплю таблицы из Supabase в $DUMP_FILE"
# --data-only: схема уже накатана через db/init/01_schema.sql
# --on-conflict-do-nothing нет в pg_dump, но мы импортим в пустую БД.
# Если таблицы нет в Supabase (например voices), pg_dump просто
# напечатает warning и продолжит.
EXTRA_ARGS=()
for t in "${TABLES[@]}"; do
  EXTRA_ARGS+=("--table=public.$t")
done

pg_dump \
  --data-only \
  --no-owner --no-privileges \
  --disable-triggers \
  --column-inserts \
  "${EXTRA_ARGS[@]}" \
  "$SUPABASE_DB_URL" > "$DUMP_FILE"

SIZE=$(wc -c < "$DUMP_FILE")
echo "→ Готов: $DUMP_FILE ($SIZE bytes)"

echo "→ Загружаю в локальный Postgres (контейнер ai-postgres)"
docker compose exec -T postgres psql \
  -U "${POSTGRES_USER:-ai}" \
  -d "${POSTGRES_DB:-ai}" \
  -v ON_ERROR_STOP=1 \
  < "$DUMP_FILE"

echo "→ Проверяю количество строк:"
for t in "${TABLES[@]}"; do
  N=$(docker compose exec -T postgres psql -U "${POSTGRES_USER:-ai}" -d "${POSTGRES_DB:-ai}" -tAc "select count(*) from $t" 2>/dev/null || echo "—")
  echo "  $t: $N"
done

echo "✓ Миграция БД завершена. Голосовые mp3 переноси отдельно:"
echo "  node scripts/migrate-storage.mjs"
