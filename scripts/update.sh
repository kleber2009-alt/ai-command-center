#!/usr/bin/env bash
# Pull latest code on the current branch, rebuild the app image and
# restart only the changed services. Safe to run on a live host: data
# volume is untouched, downtime is just the few seconds the new
# container takes to start.
#
# Suggested usage on the VPS:
#   cd /opt/ai-command-center && bash scripts/update.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
echo "→ branch: $BRANCH"

echo "→ git fetch / fast-forward pull"
git fetch --prune origin
git pull --ff-only origin "$BRANCH"

# Snapshot the DB before we touch anything in case the new code happens
# to apply a schema change that breaks on rollback.
if [ -f data/app.db ]; then
  STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p data/backups
  cp data/app.db "data/backups/pre-update-${STAMP}.db"
  echo "→ snapshot: data/backups/pre-update-${STAMP}.db"
fi

echo "→ docker compose build"
docker compose build app

echo "→ docker compose up -d (recreate changed)"
docker compose up -d --remove-orphans

echo "→ wait for /api/health"
for i in 1 2 3 4 5 6 7 8 9 10; do
  sleep 3
  if curl -fsS -o /dev/null http://127.0.0.1/api/health 2>/dev/null \
    || curl -fsS -o /dev/null http://127.0.0.1:3000/api/health 2>/dev/null; then
    echo "  ok"
    break
  fi
  if [ "$i" = "10" ]; then
    echo "  health check did not turn green in 30s — inspect: docker compose logs -f app"
    exit 1
  fi
done

echo "→ docker compose ps"
docker compose ps
echo "done."
