#!/usr/bin/env bash
# Persona Studio — one-command install on a fresh Ubuntu 22.04/24.04 server.
#
#   curl -fsSL https://raw.githubusercontent.com/kleber2009-alt/ai-command-center/main/apps/persona-studio/deploy/bootstrap.sh \
#     | sudo bash -s -- studio.aicex.club
#
# Re-running it updates the code and restarts the stack (data volumes and
# deploy/.env.prod are kept). Env overrides: BRANCH (default main),
# INSTALL_DIR (default /opt/ai-command-center).
#
# Before running: DNS A-record <domain> → this server's IP. On Cloudflare make
# it «DNS only» (grey cloud) so Caddy can obtain the Let's Encrypt certificate.
set -euo pipefail

DOMAIN="${1:-${DOMAIN:-}}"
BRANCH="${BRANCH:-main}"
INSTALL_DIR="${INSTALL_DIR:-/opt/ai-command-center}"
REPO="https://github.com/kleber2009-alt/ai-command-center.git"

log() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ -n "$DOMAIN" ] || die "usage: bootstrap.sh <domain>   (e.g. studio.aicex.club)"
[ "$(id -u)" = 0 ] || die "run as root (sudo)"

# ── 1. Docker ───────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker"
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || die "docker compose plugin missing"
command -v git >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq git; }

# ── 2. Code ─────────────────────────────────────────────────
if [ -d "$INSTALL_DIR/.git" ]; then
  log "Updating code ($BRANCH)"
  git -C "$INSTALL_DIR" fetch --depth 1 origin "$BRANCH"
  git -C "$INSTALL_DIR" checkout -q -B "$BRANCH" FETCH_HEAD
else
  log "Cloning $REPO ($BRANCH)"
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$INSTALL_DIR"
fi
DEPLOY="$INSTALL_DIR/apps/persona-studio/deploy"
cd "$DEPLOY"

# ── 3. Config (generated once, then kept) ───────────────────
rand() { openssl rand -hex "${1:-24}"; }
if [ ! -f .env.prod ]; then
  log "Generating deploy/.env.prod"
  PG_PW="$(rand 18)"
  cat > .env.prod <<EOF
# Persona Studio — production config. Generated $(date -u +%F); edit and run
#   cd $DEPLOY && docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
DOMAIN=$DOMAIN
APP_URL=https://$DOMAIN
NODE_ENV=production

POSTGRES_PASSWORD=$PG_PW
DATABASE_URL=postgresql://persona:$PG_PW@postgres:5432/persona_studio?schema=public
REDIS_URL=redis://redis:6379/3

S3_ENDPOINT=http://s3:8333
S3_REGION=us-east-1
S3_ACCESS_KEY=ps$(rand 8)
S3_SECRET_KEY=$(rand 24)
S3_BUCKET=persona-studio-media
S3_PUBLIC_URL=https://$DOMAIN/media
S3_FORCE_PATH_STYLE=true

AUTH_SECRET=$(openssl rand -base64 32)
AUTH_TRUST_HOST=true
AUTH_URL=https://$DOMAIN

# Sign-in e-mail (magic link). Until SMTP is filled in, links are written to
# the web log:  docker compose -f docker-compose.prod.yml logs web | grep magic-link
AUTH_LOG_MAGIC_LINKS=true
EMAIL_SERVER_HOST=
EMAIL_SERVER_PORT=465
EMAIL_SERVER_USER=
EMAIL_SERVER_PASSWORD=
EMAIL_FROM="Persona Studio <noreply@$DOMAIN>"
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=

# ── AI providers — fill in, then re-run the up command ──
KIE_API_KEY=unset
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
ELEVENLABS_API_KEY=
HEYGEN_API_KEY=
SUBMAGIC_API_KEY=
APIFY_TOKEN=
VOYAGE_API_KEY=

# ── Telegram / billing / publishing ──
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=$(rand 32)
CRYPTOBOT_TOKEN=
POSTMYPOST_API_TOKEN=

SIGNUP_BONUS_TOKENS=10
MODERATION_REQUIRED=false
EOF
  chmod 600 .env.prod
fi
set -a; . ./.env.prod; set +a

# SeaweedFS S3 identities: app keys (full access) + anonymous read of media.
cat > s3.json <<EOF
{
  "identities": [
    { "name": "app", "credentials": [{ "accessKey": "$S3_ACCESS_KEY", "secretKey": "$S3_SECRET_KEY" }],
      "actions": ["Admin", "Read", "Write", "List", "Tagging"] },
    { "name": "anonymous", "actions": ["Read:$S3_BUCKET"] }
  ]
}
EOF
chmod 644 s3.json

# Shared HTTPS edge for every project on this server (see Caddyfile import).
mkdir -p /opt/edge/sites /opt/backups

# Daily DB backup 03:20, 7 days kept locally. Copy them off the server too.
cat > /etc/cron.d/persona-studio-backup <<CRON
20 3 * * * root cd $DEPLOY && docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres pg_dump -U persona -Fc persona_studio > /opt/backups/persona_\$(date +\%F).dump && find /opt/backups -name 'persona_*.dump' -mtime +7 -delete
CRON

# Firewall: SSH + web only.
if command -v ufw >/dev/null 2>&1; then
  ufw allow 22/tcp >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443 >/dev/null
  ufw --force enable >/dev/null || true
fi

# ── 4. Build + start ────────────────────────────────────────
log "Building and starting (first build takes ~5–10 min)"
COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env.prod)
"${COMPOSE[@]}" build
"${COMPOSE[@]}" up -d --remove-orphans

log "Waiting for https://$DOMAIN"
for i in $(seq 1 60); do
  if curl -fsS -o /dev/null "https://$DOMAIN/sign-in"; then
    printf '\n\033[1;32m✓ Persona Studio is live: https://%s\033[0m\n' "$DOMAIN"
    grep -q '^EMAIL_SERVER_HOST=$' .env.prod && echo "  Sign-in links (no SMTP yet): ${COMPOSE[*]} logs web | grep magic-link"
    exit 0
  fi
  sleep 5
done
"${COMPOSE[@]}" ps
die "not reachable over HTTPS yet — check DNS (A-record → this IP, Cloudflare grey cloud) and: ${COMPOSE[*]} logs caddy"
