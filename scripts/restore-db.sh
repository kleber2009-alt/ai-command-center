#!/usr/bin/env bash
# Restore the database from a backup file produced by backup-db.sh.
#
#   ./scripts/restore-db.sh ~/backups/db-20260516-040000.sql.gz
#
# WARNING: drops all existing rows in our tables before loading the dump.
# Confirm prompt prevents accidental runs.

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <path-to-dump.sql.gz>" >&2
  exit 1
fi

DUMP="$1"
if [[ ! -f "$DUMP" ]]; then
  echo "File not found: $DUMP" >&2
  exit 1
fi

echo "About to restore $DUMP into the running db container."
read -rp "This will OVERWRITE existing data. Continue? [y/N] " ok
if [[ "$ok" != "y" && "$ok" != "Y" ]]; then
  echo "Aborted."
  exit 1
fi

cd "$(dirname "$0")/.."

gunzip -c "$DUMP" | docker compose exec -T db psql -U "${POSTGRES_USER:-app}" -d "${POSTGRES_DB:-app}"

echo "Restore done."
