#!/usr/bin/env bash
# Deploy the aicex stack on the shared server. Run from the repo checkout
# (/opt/aicex) by .github/workflows/deploy-aicex.yml:
#   bash deploy/aicex/deploy.sh [service ...]     # default: all services
#
# Expects /etc/aicex/{transcribe,tg-agent,ytdlp,ai-office}.env written by the
# workflow, and CC_ADMIN_PASSWORD / TRANSCRIBE_BOT_TOKEN in the environment.
# Generated once and kept: /etc/aicex/stack.env (Postgres password, webhook secret).
set -euo pipefail

cd "$(dirname "$0")"
REPO=$(cd ../.. && pwd)
ETC=/etc/aicex
EDGE_CADDY=${EDGE_CADDY:-persona-studio-caddy-1}
SERVICES=("$@")
[ ${#SERVICES[@]} -gt 0 ] || SERVICES=(ytdlp transcribe tg-agent command-center ai-office landings)

log() { echo "── $* ──"; }

# ── 1. one-time secrets ──────────────────────────────────────────────
mkdir -p "$ETC" && chmod 700 "$ETC"
touch "$ETC/stack.env"; chmod 600 "$ETC/stack.env"
for k in PG_PASSWORD TRANSCRIBE_WEBHOOK_SECRET YTDLP_KEY; do
  grep -q "^$k=" "$ETC/stack.env" || { echo "$k=$(openssl rand -hex 24)" >> "$ETC/stack.env"; log "generated $k"; }
done
set -a; . "$ETC/stack.env"; set +a
for f in transcribe tg-agent ytdlp ai-office; do touch "$ETC/$f.env"; chmod 600 "$ETC/$f.env"; done

docker network inspect edge >/dev/null 2>&1 || docker network create edge
DC=(docker compose -f docker-compose.yml --env-file "$ETC/stack.env")

# ── 2. database + schema ─────────────────────────────────────────────
log "postgres"
"${DC[@]}" up -d postgres
for i in $(seq 1 30); do
  docker exec aicex-postgres pg_isready -U aicex -d aio >/dev/null 2>&1 && break
  sleep 2
done
psql_() { docker exec -i aicex-postgres psql -U aicex -v ON_ERROR_STOP=1 -q "$@"; }

psql_ -d aio -c "SELECT 1" >/dev/null
psql_ -d aio -tAc "SELECT 1 FROM pg_database WHERE datname='aisales'" | grep -q 1 \
  || psql_ -d aio -c "CREATE DATABASE aisales"

# Each file runs once (tracked in _aicex_migrations). A failing file is
# reported and retried on the next deploy instead of blocking the apps.
migrate() {
  local db=$1; shift
  psql_ -d "$db" -c "CREATE TABLE IF NOT EXISTS _aicex_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW())"
  for f in "$@"; do
    if psql_ -d "$db" -tAc "SELECT 1 FROM _aicex_migrations WHERE name='$f'" | grep -q 1; then continue; fi
    if psql_ -d "$db" -1 < "$REPO/$f"; then
      psql_ -d "$db" -c "INSERT INTO _aicex_migrations(name) VALUES ('$f')"
      echo "  ✓ $db ← $f"
    else
      echo "  ✗ $db ← $f FAILED (will retry next deploy)"
    fi
  done
}
psql_ -d aio -c 'CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS vector;'
psql_ -d aisales -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS pgcrypto;'
log "migrations"
migrate aio \
  infra/db/init/001_schema.sql \
  infra/db/init/002_relay.sql \
  apps/transcribe/supabase/migrations/001_transcripts.sql \
  apps/transcribe/supabase/migrations/002_generations.sql \
  apps/transcribe/supabase/migrations/003_me.sql \
  apps/transcribe/supabase/migrations/004_tasks.sql \
  apps/transcribe/supabase/migrations/005_tasks_project.sql \
  apps/transcribe/supabase/migrations/006_auth.sql \
  apps/transcribe/supabase/migrations/007_instagram.sql \
  deploy/aicex/sql/transcribe_bot_tables.sql \
  apps/transcribe/supabase/migrations/008_clone_drafts_voice.sql
migrate aisales \
  apps/aisales/db-init/009_projects.sql \
  apps/aisales/db-init/010_projects_seed.sql \
  apps/aisales/db-init/011_projects_seed_extra.sql \
  apps/aisales/db-init/012_projects_real_urls.sql \
  apps/aisales/db-init/016_projects_active_products.sql \
  apps/aisales/db-init/017_viral_clone_project.sql

# ── 3. build + start, one service at a time (keeps build RAM bounded) ─
health_url() {
  case $1 in
    ytdlp)          echo "http://aicex-ytdlp:8080/healthz" ;;
    transcribe)     echo "http://aicex-transcribe:3000/" ;;
    tg-agent)       echo "http://aicex-tg-agent:8080/healthz" ;;
    command-center) echo "http://aicex-command-center:3003/dashboard" ;;
    ai-office)      echo "http://aicex-ai-office:3000/api/health" ;;
    landings)       echo "http://aicex-landings:8080/transcribe/" ;;
  esac
}
# Keys a service cannot boot without; empty → skip it instead of a crash loop.
required_keys() {
  case $1 in
    tg-agent) echo "TELEGRAM_BOT_TOKEN ANTHROPIC_API_KEY" ;;
  esac
}
FAILED=(); SKIPPED=()
for s in "${SERVICES[@]}"; do
  missing=
  for k in $(required_keys "$s"); do
    grep -qE "^$k=.+" "$ETC/$s.env" || missing="$missing $k"
  done
  if [ -n "$missing" ]; then
    echo "  ⚠ $s skipped — missing:$missing"
    "${DC[@]}" rm -sf "$s" >/dev/null 2>&1 || true
    SKIPPED+=("$s(${missing# })"); continue
  fi
  log "$s: build"
  if ! "${DC[@]}" build "$s"; then FAILED+=("$s(build)"); continue; fi
  log "$s: up"
  "${DC[@]}" up -d --no-deps --force-recreate "$s"
  url=$(health_url "$s"); ok=
  for i in $(seq 1 40); do
    if docker run --rm --network edge curlimages/curl:8.11.1 -fsS -o /dev/null --max-time 5 "$url" 2>/dev/null; then ok=1; break; fi
    sleep 3
  done
  if [ -n "$ok" ]; then echo "  ✓ $s healthy"; else
    echo "  ✗ $s not healthy"; docker logs --tail=60 "aicex-$s" 2>&1 || true; FAILED+=("$s")
  fi
done
docker image prune -f >/dev/null

# ── 4. edge Caddy sites ──────────────────────────────────────────────
log "caddy sites"
SITE=/opt/edge/sites/aicex.caddy
TMP=$(mktemp)
HASH=$(docker exec "$EDGE_CADDY" caddy hash-password --plaintext "${CC_ADMIN_PASSWORD:-$(openssl rand -hex 16)}")
sed "s#__CC_WRITE_HASH__#${HASH}#" sites.caddy > "$TMP"
[ -f "$SITE" ] && cp "$SITE" "$SITE.bak"
install -m 644 "$TMP" "$SITE"; rm -f "$TMP"
if docker exec "$EDGE_CADDY" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
  docker exec "$EDGE_CADDY" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
  echo "  ✓ caddy reloaded"
else
  echo "  ✗ caddy config invalid — restoring previous sites file"
  docker exec "$EDGE_CADDY" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile || true
  if [ -f "$SITE.bak" ]; then mv "$SITE.bak" "$SITE"; else rm -f "$SITE"; fi
  FAILED+=("caddy")
fi

# ── 5. Telegram webhook for the transcribe bot ───────────────────────
if [ -n "${TRANSCRIBE_BOT_TOKEN:-}" ] && [[ " ${SERVICES[*]} " == *" transcribe "* ]]; then
  log "transcribe webhook"
  curl -fsS "https://api.telegram.org/bot${TRANSCRIBE_BOT_TOKEN}/setWebhook" \
    --data-urlencode "url=https://transcribe.aicex.club/api/telegram/webhook" \
    --data-urlencode "secret_token=${TRANSCRIBE_WEBHOOK_SECRET}" \
    | sed -E 's/"[0-9]+:[A-Za-z0-9_-]{30,}"/"***"/g'; echo
fi

log "status"
docker ps --filter name=aicex- --format '{{.Names}}\t{{.Status}}'
free -h | head -2; df -h / | tail -1
[ ${#SKIPPED[@]} -eq 0 ] || echo "SKIPPED (need secrets): ${SKIPPED[*]}"
if [ ${#FAILED[@]} -gt 0 ]; then echo "FAILED: ${FAILED[*]}"; exit 1; fi
echo "✓ all done"
