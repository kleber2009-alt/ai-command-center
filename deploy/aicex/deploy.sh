#!/usr/bin/env bash
# Deploy the aicex stack on the shared server. Run from the repo checkout
# (/opt/aicex) by .github/workflows/deploy-aicex.yml:
#   bash deploy/aicex/deploy.sh [service ...]     # default: all services
#
# Expects /etc/aicex/<service>.env (transcribe, tg-agent, ytdlp, ai-office, sales-api,
# worker, aihub, persona-train, content-factory) written by the
# workflow, and CC_ADMIN_PASSWORD / *_BOT_TOKEN in the environment.
# Generated once and kept: /etc/aicex/stack.env (Postgres password, internal secrets).
set -euo pipefail

cd "$(dirname "$0")"
REPO=$(cd ../.. && pwd)
ETC=/etc/aicex
EDGE_CADDY=${EDGE_CADDY:-persona-studio-caddy-1}
SERVICES=("$@")
[ ${#SERVICES[@]} -gt 0 ] || SERVICES=(ytdlp worker transcribe tg-agent command-center ai-office landings sales-api sales-static
                                     aihub-redis aihub-web persona-train ig-content content-factory)

log() { echo "── $* ──"; }

# ── 1. one-time secrets ──────────────────────────────────────────────
mkdir -p "$ETC" && chmod 700 "$ETC"
touch "$ETC/stack.env"; chmod 600 "$ETC/stack.env"
for k in PG_PASSWORD TRANSCRIBE_WEBHOOK_SECRET YTDLP_KEY TG_ADMIN_SESSION_SECRET \
         VIRAL_CLONE_DISPATCH_SECRET TG_OFFICE_WEBHOOK_SECRET TG_PARSER_WEBHOOK_SECRET \
         SALES_TG_WEBHOOK_SECRET CABINET_LINK_SECRET CABINET_SESSION_SECRET \
         AIHUB_AUTH_SECRET PERSONA_TRAIN_WEBHOOK_SECRET; do
  grep -q "^$k=" "$ETC/stack.env" || { echo "$k=$(openssl rand -hex 24)" >> "$ETC/stack.env"; log "generated $k"; }
done
set -a; . "$ETC/stack.env"; set +a
for f in transcribe tg-agent ytdlp ai-office sales-api worker aihub persona-train content-factory; do touch "$ETC/$f.env"; chmod 600 "$ETC/$f.env"; done

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
# Migrations GRANT read access to claude_ro (the read-only role from the old
# server); it only needs to exist, login stays disabled.
psql_ -d aio -tAc "SELECT 1 FROM pg_roles WHERE rolname='claude_ro'" | grep -q 1 \
  || psql_ -d aio -c "CREATE ROLE claude_ro NOLOGIN"
for db in aisales aihub; do
  psql_ -d aio -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1 \
    || psql_ -d aio -c "CREATE DATABASE $db"
done

# Each file runs once (tracked in _aicex_migrations). A failing file is
# reported and retried on the next deploy instead of blocking the apps.
migrate() {
  local db=$1; shift
  psql_ -d "$db" -c "CREATE TABLE IF NOT EXISTS _aicex_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW())"
  for f in "$@"; do
    if psql_ -d "$db" -tAc "SELECT 1 FROM _aicex_migrations WHERE name='$f'" | grep -q 1; then continue; fi
    # A new enum value cannot be used in the transaction that adds it, so
    # files with ALTER TYPE ... ADD VALUE run statement by statement.
    tx=-1; grep -qiE 'ALTER TYPE .* ADD VALUE' "$REPO/$f" && tx=
    if psql_ -d "$db" $tx < "$REPO/$f"; then
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
  apps/transcribe/supabase/migrations/008_clone_drafts_voice.sql \
  apps/persona-train/migrations/001_persona_train.sql
migrate aisales \
  apps/aisales/db-init/009_projects.sql \
  apps/aisales/db-init/010_projects_seed.sql \
  apps/aisales/db-init/011_projects_seed_extra.sql \
  apps/aisales/db-init/012_projects_real_urls.sql \
  apps/aisales/db-init/016_projects_active_products.sql \
  apps/aisales/db-init/017_viral_clone_project.sql
# AI Sales + Office Worker schema (order per apps/ai-sales/CLAUDE.md:
# 04-database/001 first, then db-init — its 003 is the fixed copy).
migrate aisales \
  apps/ai-sales/04-database/001_initial_schema.sql \
  apps/aisales/db-init/003_analytics_schema.sql \
  apps/aisales/db-init/004_platform_metrics.sql \
  apps/aisales/db-init/005_platform_seed.sql \
  apps/aisales/db-init/006_agent_tasks.sql \
  apps/aisales/db-init/007_agent_prompts.sql \
  apps/aisales/db-init/008_revenue_goals.sql \
  apps/aisales/db-init/013_office_scheduler.sql \
  apps/aisales/db-init/014_office_user_linking.sql \
  apps/aisales/db-init/015_payments.sql \
  $(cd "$REPO" && ls apps/infra-worker/migrations/0{16,17,18,19,20,21,22,23,24,25,26}_*.sql) \
  deploy/aicex/sql/worker_clone_photos.sql \
  deploy/aicex/sql/projects_aicex_links_20261027.sql
psql_ -d aihub -c 'CREATE EXTENSION IF NOT EXISTS pgcrypto;'
migrate aihub $(cd "$REPO" && ls apps/ai-hub/drizzle/migrations/*.sql) apps/ai-hub/drizzle/seed/tools.sql

# ── volumes that need a first-run touch ──────────────────────────────
# persona-train runs as uid 1001; a fresh named volume is root-owned.
docker volume create aicex_persona-train-data >/dev/null
docker run --rm -v aicex_persona-train-data:/data alpine:3.20 \
  sh -c 'mkdir -p /data/voice-notes /data/video-notes && chown -R 1001:1001 /data'
# content-factory: scheduled generation off until switched on in the cabinet.
docker volume create aicex_factory-data >/dev/null
docker run --rm -v aicex_factory-data:/data alpine:3.20 \
  sh -c '[ -f /data/bot-state.json ] || echo "{\"carousel\":false,\"reels\":false}" > /data/bot-state.json'

# ── 3. build + start, one service at a time (keeps build RAM bounded) ─
health_url() {
  case $1 in
    ytdlp)          echo "http://aicex-ytdlp:8080/healthz" ;;
    transcribe)     echo "http://aicex-transcribe:3000/" ;;
    tg-agent)       echo "http://aicex-tg-agent:8080/healthz" ;;
    command-center) echo "http://aicex-command-center:3003/dashboard" ;;
    ai-office)      echo "http://aicex-ai-office:3000/api/health" ;;
    landings)       echo "http://aicex-landings:8080/transcribe/" ;;
    sales-api)      echo "http://aicex-sales-api:8000/health" ;;
    sales-static)   echo "http://aicex-sales-static:8080/06-dashboard-prototype/pulse.html" ;;
    worker)         echo "http://aicex-worker:3000/worker/health" ;;
    aihub-redis)    echo "" ;;
    aihub-web)      echo "http://aicex-aihub-web:3010/" ;;
    persona-train)  echo "http://aicex-persona-train:3030/api/health" ;;
    ig-content)     echo "http://aicex-ig-content:3010/" ;;
    content-factory) echo "http://aicex-content-factory:3018/api/health" ;;
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
  [ -n "$url" ] || { echo "  ✓ $s started"; continue; }
  for i in $(seq 1 40); do
    net=edge; [ "$s" = ytdlp ] && net=aicex_default   # ytdlp is internal-only
    if docker run --rm --network "$net" curlimages/curl:8.11.1 -fsS -o /dev/null --max-time 5 "$url" 2>/dev/null; then ok=1; break; fi
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

# ── 5. Telegram webhooks (only for bots whose token is configured) ───
set_webhook() {  # <service> <token> <url> <secret>
  [ -n "$2" ] && [[ " ${SERVICES[*]} " == *" $1 "* ]] || return 0
  log "webhook $1 → $3"
  curl -sS "https://api.telegram.org/bot$2/setWebhook" \
    --data-urlencode "url=$3" --data-urlencode "secret_token=$4"; echo
}
set_webhook transcribe "${TRANSCRIBE_BOT_TOKEN:-}" https://transcribe.aicex.club/api/telegram/webhook "$TRANSCRIBE_WEBHOOK_SECRET"
set_webhook worker     "${OFFICE_BOT_TOKEN:-}"     https://office.aicex.club/worker/tg-webhook        "$TG_OFFICE_WEBHOOK_SECRET"
set_webhook worker     "${PARSER_BOT_TOKEN:-}"     https://office.aicex.club/worker/parser-webhook    "$TG_PARSER_WEBHOOK_SECRET"
set_webhook sales-api  "${SALES_BOT_TOKEN:-}"      https://sales-api.aicex.club/webhooks/telegram     "$SALES_TG_WEBHOOK_SECRET"
set_webhook persona-train "${PERSONA_TRAIN_BOT_TOKEN:-}" https://persona-train.aicex.club/api/telegram/webhook "$PERSONA_TRAIN_WEBHOOK_SECRET"

log "status"
docker ps --filter name=aicex- --format '{{.Names}}\t{{.Status}}'
free -h | head -2; df -h / | tail -1
[ ${#SKIPPED[@]} -eq 0 ] || echo "SKIPPED (need secrets): ${SKIPPED[*]}"
if [ ${#FAILED[@]} -gt 0 ]; then echo "FAILED: ${FAILED[*]}"; exit 1; fi
echo "✓ all done"
