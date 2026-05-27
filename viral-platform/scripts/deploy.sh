#!/usr/bin/env bash
# One-shot production deploy for viral-platform (Docker, e.g. Hetzner).
# Run from anywhere; resolves the project root itself.
#
#   cp .env.prod.example .env && nano .env   # fill in real keys first
#   ./scripts/deploy.sh
#
# Re-run any time to rebuild + roll out the latest code. Idempotent.
set -euo pipefail

cd "$(dirname "$0")/.."   # → project root (where docker-compose.prod.yml lives)

if [ ! -f .env ]; then
  echo "ERROR: .env missing. Run: cp .env.prod.example .env && nano .env" >&2
  exit 1
fi

# Guard against the #1 build failure: Clerk key absent → next build crashes.
# Skipped in demo mode (NEXT_PUBLIC_AUTH_DISABLED=true), which needs no Clerk key.
if ! grep -qE '^NEXT_PUBLIC_AUTH_DISABLED=true' .env \
  && ! grep -qE '^NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_' .env; then
  echo "ERROR: set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY (pk_...) in .env," >&2
  echo "       or use demo mode: NEXT_PUBLIC_AUTH_DISABLED=true (cp .env.demo.example .env)." >&2
  exit 1
fi

C=(docker compose -f docker-compose.prod.yml)
WEB_PORT="$(grep -E '^VP_WEB_PORT=' .env | head -1 | cut -d= -f2- || true)"
: "${WEB_PORT:=3018}"

echo "── 1/4 build images (web + worker) ──"
"${C[@]}" build

echo "── 2/4 start Postgres + Redis ──"
"${C[@]}" up -d vp-postgres vp-redis

echo "── 3/4 migrate DB (extension + schema + halfvec HNSW) ──"
"${C[@]}" run --rm vp-worker-broll pnpm --filter @vp/db migrate

echo "── 4/4 (re)create web + workers ──"
"${C[@]}" up -d --force-recreate \
  vp-web vp-worker-transcribe vp-worker-detect vp-worker-broll \
  vp-worker-library vp-worker-render

echo "── health-check http://localhost:${WEB_PORT}/ ──"
for i in $(seq 1 30); do
  if curl -fsS -o /dev/null "http://localhost:${WEB_PORT}/" 2>/dev/null; then
    echo "✓ vp-web healthy after ${i}×3s"
    "${C[@]}" ps
    exit 0
  fi
  sleep 3
done
echo "✗ vp-web did not respond within 90s — logs:" >&2
docker logs --tail=120 vp-web || true
exit 1
