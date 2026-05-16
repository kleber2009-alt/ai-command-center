#!/usr/bin/env bash
# Bootstrap an already-running Hetzner Cloud VPS (Ubuntu 22.04 / 24.04
# or Debian 12) for ai-command-center.
#
# Idempotent — safe to re-run. Run as a sudo-capable user, NOT root:
#   curl -fsSL https://raw.githubusercontent.com/<you>/ai-command-center/<branch>/deploy/hetzner/setup-existing.sh -o setup.sh
#   bash setup.sh
#
# What it does:
#   1. apt update + base packages
#   2. install Docker Engine + compose plugin (via get.docker.com)
#   3. add the current user to the docker group
#   4. open firewall ports 22 / 80 / 443 via ufw (if installed)
#   5. enable a 2 GB swapfile (CX22 has 4 GB RAM — swap helps Next.js build)
#   6. install unattended-upgrades for security patches
#
# After it finishes:
#   - log out and back in (so the docker group takes effect)
#   - git clone the repo wherever you like
#   - cp .env.example .env && edit it (set DOMAIN, POSTGRES_PASSWORD, *_API_KEY)
#   - docker compose up -d --build

set -euo pipefail

log() { echo -e "\033[1;34m>>>\033[0m $*"; }
warn() { echo -e "\033[1;33m!!!\033[0m $*"; }

if [[ $EUID -eq 0 ]]; then
  warn "Running as root. Recommended: run as a regular user with sudo."
fi

SUDO="sudo"
if [[ $EUID -eq 0 ]]; then SUDO=""; fi

# ─── 1. System update + base packages ────────────────────────────────────
log "Updating apt and installing base packages..."
$SUDO apt-get update -y
$SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y \
  ca-certificates curl git ufw htop tmux unattended-upgrades

# ─── 2. Docker Engine + compose plugin ───────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker Engine..."
  curl -fsSL https://get.docker.com | $SUDO sh
else
  log "Docker already installed: $(docker --version)"
fi

# ─── 3. docker group ─────────────────────────────────────────────────────
if ! getent group docker >/dev/null; then
  $SUDO groupadd docker
fi
if [[ -n "${SUDO_USER:-}" ]]; then TARGET_USER="$SUDO_USER"; else TARGET_USER="$USER"; fi
if id -nG "$TARGET_USER" | grep -qw docker; then
  log "User $TARGET_USER already in docker group."
else
  log "Adding $TARGET_USER to docker group (log out + back in to apply)."
  $SUDO usermod -aG docker "$TARGET_USER"
fi

# ─── 4. Firewall ─────────────────────────────────────────────────────────
if command -v ufw >/dev/null 2>&1; then
  log "Configuring ufw (22 / 80 / 443)..."
  $SUDO ufw --force default deny incoming
  $SUDO ufw --force default allow outgoing
  $SUDO ufw allow 22/tcp
  $SUDO ufw allow 80/tcp
  $SUDO ufw allow 443/tcp
  $SUDO ufw allow 443/udp   # HTTP/3 (Caddy)
  $SUDO ufw --force enable
else
  warn "ufw not installed, skipping firewall configuration."
fi

# ─── 5. Swap (helps Next.js build on 4 GB nodes) ──────────────────────────
if ! swapon --show | grep -q '/swapfile'; then
  log "Creating 2 GB swapfile..."
  $SUDO fallocate -l 2G /swapfile
  $SUDO chmod 600 /swapfile
  $SUDO mkswap /swapfile
  $SUDO swapon /swapfile
  if ! grep -q '/swapfile' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' | $SUDO tee -a /etc/fstab >/dev/null
  fi
else
  log "Swapfile already present."
fi

# ─── 6. Unattended security upgrades ─────────────────────────────────────
log "Enabling unattended-upgrades for security patches..."
$SUDO dpkg-reconfigure --priority=low -fnoninteractive unattended-upgrades || true

# ─── Done ────────────────────────────────────────────────────────────────
log "Done."
echo
echo "Next steps:"
echo "  1. Log out and back in (so 'docker' group works without sudo)."
echo "  2. git clone <repo-url> /opt/ai-command-center && cd /opt/ai-command-center"
echo "  3. cp .env.example .env && edit it"
echo "     - DOMAIN: set to your domain, OR '\$(curl -s ifconfig.me).sslip.io'"
echo "       for a free HTTPS-ready hostname tied to this server's IP."
echo "  4. docker compose up -d --build"
echo
echo "App will be at https://\$DOMAIN/transcribe."
