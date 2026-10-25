#!/usr/bin/env bash
# apps/ai-sales/scripts/bootstrap_new_server.sh
#
# One-shot bootstrap for a FRESH Hetzner (or any Ubuntu 24.04) VPS that will
# host apps/ai-sales. Clean deploy — no data migrated from the old server.
#
# This script runs ON THE NEW SERVER, after `deploy_from_laptop.sh` has
# rsync-ed the ai-sales tree over. It installs Docker + Compose, generates a
# .env with strong random passwords, points Caddy at an nip.io subdomain of
# this server's own IP, and brings docker compose up.
#
# Usage (invoked by deploy_from_laptop.sh, or by hand):
#   sudo bash bootstrap_new_server.sh
#
# Idempotent: safe to re-run. Does NOT overwrite an existing .env.

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "This script must run as root (use sudo)." >&2
  exit 1
fi

SRC_DIR="${AISALES_SRC_DIR:-/opt/ai-sales}"
CODE_DIR="${SRC_DIR}/code"

if [[ ! -d "$CODE_DIR" ]]; then
  echo "Expected ai-sales checkout at $CODE_DIR (set AISALES_SRC_DIR to override)." >&2
  echo "Did deploy_from_laptop.sh finish the rsync?" >&2
  exit 1
fi

echo "════════════════════════════════════════════════════════"
echo "  ai-sales · bootstrap new server"
echo "  source dir: $SRC_DIR"
echo "════════════════════════════════════════════════════════"

# ── 1. Base packages ─────────────────────────────────────────
echo "→ apt update + base packages"
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg ufw fail2ban openssl

# ── 2. Docker Engine + Compose plugin ────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  echo "→ installing Docker Engine"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
  echo "✓ docker already present"
fi
systemctl enable --now docker

# ── 3. Firewall ──────────────────────────────────────────────
echo "→ ufw rules (22/80/443)"
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
systemctl enable --now fail2ban >/dev/null

# ── 4. Resolve public IP → nip.io hostname ───────────────────
PUBLIC_IP="$(curl -fsS https://api.ipify.org || true)"
if [[ -z "$PUBLIC_IP" ]]; then
  echo "Could not resolve public IP from api.ipify.org." >&2
  echo "Set PUBLIC_IP=<ip> and rerun." >&2
  exit 1
fi
NIP_DOMAIN="${PUBLIC_IP//./-}.nip.io"
AISALES_DOMAIN="aisales.${NIP_DOMAIN}"
echo "✓ public IP     : $PUBLIC_IP"
echo "✓ nip.io domain : $AISALES_DOMAIN"

# ── 5. .env (preserve existing) ──────────────────────────────
ENV_FILE="${CODE_DIR}/.env"
if [[ -f "$ENV_FILE" ]]; then
  echo "✓ reusing existing $ENV_FILE"
else
  echo "→ writing fresh $ENV_FILE with random passwords"
  PG_PW="$(openssl rand -hex 24)"
  REDIS_PW="$(openssl rand -hex 24)"
  MINIO_PW="$(openssl rand -hex 24)"
  cat > "$ENV_FILE" <<EOF
# ─────────────────────────────────────────────────────────
# ai-sales · auto-generated on $(date -u +%Y-%m-%dT%H:%M:%SZ)
# Rotate the passwords here before pointing anything real at it.
# ─────────────────────────────────────────────────────────

# Mock-mode is safest default on a fresh box — all agents return
# canned responses, no real API calls. Flip to 0 once keys below
# are filled in and you have reviewed the deploy.
AISALES_MOCK=1
LOG_LEVEL=INFO
ENV=prod

# Caddy public hostname (reverse-proxied by Caddy with Let's Encrypt)
DOMAIN=${AISALES_DOMAIN}

# ── Infra passwords (generated, keep private) ──
POSTGRES_PASSWORD=${PG_PW}
REDIS_PASSWORD=${REDIS_PW}
MINIO_ROOT_USER=aisales
MINIO_ROOT_PASSWORD=${MINIO_PW}

# ── LLM / embeddings (fill in before AISALES_MOCK=0) ──
ANTHROPIC_API_KEY=
VOYAGE_API_KEY=
OPENAI_API_KEY=

# ── Voice (fill in before AISALES_MOCK=0) ──
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=

# ── Instagram ──
IG_APP_SECRET=
IG_VERIFY_TOKEN=aisales-verify-$(openssl rand -hex 8)
IG_PAGE_TOKEN=

# ── Telegram ──
TG_BOT_TOKEN=
TG_WEBHOOK_SECRET=$(openssl rand -hex 16)
ILYA_TG_CHAT_ID=
EOF
  chmod 600 "$ENV_FILE"
  echo "✓ wrote $ENV_FILE (chmod 600)"
fi

# ── 6. docker compose up ─────────────────────────────────────
echo "→ docker compose build + up"
cd "$CODE_DIR"
docker compose pull --ignore-pull-failures >/dev/null 2>&1 || true
docker compose up -d --build

echo ""
echo "→ waiting 10s for Caddy to request its Let's Encrypt cert..."
sleep 10
echo ""
echo "→ container state:"
docker compose ps

cat <<EOF

════════════════════════════════════════════════════════
  ai-sales is up
════════════════════════════════════════════════════════

  Portal       : https://${AISALES_DOMAIN}/
  API docs     : https://${AISALES_DOMAIN}/api/docs
  Dashboards   : https://${AISALES_DOMAIN}/dashboard

Follow logs:
  cd ${CODE_DIR} && docker compose logs -f api caddy

The box is in AISALES_MOCK=1 — all agents return stubs. Before
pointing real IG/TG webhooks at it:
  1. edit ${ENV_FILE}, fill in the API keys
  2. flip AISALES_MOCK=0
  3. docker compose up -d --force-recreate api

EOF
