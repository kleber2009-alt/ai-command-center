#!/usr/bin/env bash
# Dump data from Supabase Postgres and load it into the self-hosted instance.
#
# Required env vars (export them or put in scripts/.env.migrate):
#   SUPABASE_DB_URL  — connection string from
#                      Supabase Dashboard → Project Settings → Database →
#                      "Connection string" → URI tab. Looks like:
#                      postgresql://postgres.<ref>:<password>@aws-0-...pooler.supabase.com:5432/postgres
#   TARGET_DB_URL    — connection string of your new Postgres
#                      (e.g. postgres://app:pwd@localhost:5432/app)
#
# Optional:
#   TABLES — space-separated list of tables to dump (default: our app tables)
#
# Usage:
#   chmod +x scripts/migrate-from-supabase.sh
#   ./scripts/migrate-from-supabase.sh

set -euo pipefail

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "ERROR: set SUPABASE_DB_URL" >&2
  exit 1
fi
if [[ -z "${TARGET_DB_URL:-}" ]]; then
  echo "ERROR: set TARGET_DB_URL" >&2
  exit 1
fi

TABLES="${TABLES:-transcripts tasks me_profile me_documents me_chunks}"

DUMP_FILE="$(mktemp -t supadump.XXXXXX.sql)"
trap 'rm -f "$DUMP_FILE"' EXIT

echo "→ Dumping tables [$TABLES] from Supabase…"
pg_dump \
  --no-owner --no-acl \
  --data-only \
  --disable-triggers \
  --column-inserts \
  $(for t in $TABLES; do echo "--table=public.$t"; done) \
  "$SUPABASE_DB_URL" > "$DUMP_FILE"

echo "→ Dump size: $(wc -c < "$DUMP_FILE") bytes"
echo "→ Loading into target DB…"

# --disable-triggers needs SUPERUSER which we have locally (docker-compose runs
# Postgres as superuser). For a managed target without superuser, strip those
# lines and accept the trigger overhead.
psql "$TARGET_DB_URL" -v ON_ERROR_STOP=1 -f "$DUMP_FILE"

echo "✓ Done. Verify row counts:"
psql "$TARGET_DB_URL" -c "
  select 'transcripts' as t, count(*) from transcripts
  union all select 'tasks',        count(*) from tasks
  union all select 'me_profile',   count(*) from me_profile
  union all select 'me_documents', count(*) from me_documents
  union all select 'me_chunks',    count(*) from me_chunks;
"
