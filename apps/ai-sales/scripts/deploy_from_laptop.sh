#!/usr/bin/env bash
# apps/ai-sales/scripts/deploy_from_laptop.sh
#
# Push apps/ai-sales to a FRESH Ubuntu 24.04 VPS and bring it up with Docker.
# Run this FROM YOUR LAPTOP (not from the server). It:
#
#   1. rsync-s the ai-sales tree to the new box (code/, 04-database/,
#      agent-prompts/, voice-input/, portal + dashboard statics)
#   2. remotely runs bootstrap_new_server.sh over SSH
#
# Prereqs on the laptop:
#   • rsync + ssh
#   • SSH key already added to the new server (ssh-copy-id done)
#
# Prereqs on the server:
#   • fresh Ubuntu 24.04 (or similar debian-family), ports 22/80/443 reachable
#   • A sudo-capable user, root works too
#
# Usage:
#   bash deploy_from_laptop.sh <user@host> [remote-path]
#
# Example:
#   bash deploy_from_laptop.sh root@203.0.113.42
#   bash deploy_from_laptop.sh aisales@203.0.113.42 /opt/ai-sales
#
# Idempotent: safe to re-run; .env on the server is preserved by the
# bootstrap script.

set -euo pipefail

TARGET="${1:-}"
REMOTE_PATH="${2:-/opt/ai-sales}"

if [[ -z "$TARGET" ]]; then
  echo "Usage: $0 <user@host> [remote-path]"
  exit 2
fi

# Resolve apps/ai-sales root — this script lives at apps/ai-sales/scripts/.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AISALES_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ ! -f "${AISALES_DIR}/code/docker-compose.yml" ]]; then
  echo "Could not find ${AISALES_DIR}/code/docker-compose.yml — unexpected layout." >&2
  exit 1
fi

echo "════════════════════════════════════════════════════════"
echo "  deploy ai-sales → ${TARGET}:${REMOTE_PATH}"
echo "  source: ${AISALES_DIR}"
echo "════════════════════════════════════════════════════════"

# Which directories Caddy mounts into the container (see docker-compose.yml):
#   01-portal/, 05-docs/, 06-dashboard-prototype/, carousels/, reels/, assets/, index.html
# Plus what the API needs:
#   code/, 04-database/, agent-prompts/, voice-input/
# We ship exactly those; nothing else (no AUTONOMOUS_LOG, no TODO,
# no MIGRATION snapshots, no __pycache__).

# ── 1. ensure remote path + sudo capability ─────────────────
echo "→ preparing remote ${REMOTE_PATH}"
ssh -o StrictHostKeyChecking=accept-new "$TARGET" "sudo mkdir -p ${REMOTE_PATH} && sudo chown \$USER ${REMOTE_PATH}"

# ── 2. rsync the tree ───────────────────────────────────────
echo "→ rsync (excludes: .env, __pycache__, *.log, snapshots)"
rsync -az --delete \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='.git' \
  --exclude='.DS_Store' \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  --exclude='*.log' \
  --exclude='node_modules' \
  --exclude='AUTONOMOUS_LOG.md' \
  --exclude='MIGRATION.md' \
  --exclude='TODO.md' \
  --exclude='ai-office-deploy.zip' \
  --include='code/***' \
  --include='04-database/***' \
  --include='agent-prompts/***' \
  --include='voice-input/***' \
  --include='01-portal/***' \
  --include='05-docs/***' \
  --include='06-dashboard-prototype/***' \
  --include='carousels/***' \
  --include='reels/***' \
  --include='assets/***' \
  --include='scripts/***' \
  --include='index.html' \
  --include='README.md' \
  --exclude='*' \
  "${AISALES_DIR}/" "${TARGET}:${REMOTE_PATH}/"

# ── 3. run bootstrap on the remote end ──────────────────────
echo "→ running bootstrap_new_server.sh on the remote"
ssh -t "$TARGET" "sudo AISALES_SRC_DIR=${REMOTE_PATH} bash ${REMOTE_PATH}/scripts/bootstrap_new_server.sh"

cat <<EOF

════════════════════════════════════════════════════════
  deploy done
════════════════════════════════════════════════════════

Next:
  • ssh ${TARGET}
  • cd ${REMOTE_PATH}/code
  • cat .env                  # review generated passwords
  • docker compose logs -f api caddy
  • Caddy's first LE cert takes ~30-60s on first boot

To re-deploy after a code change, just run this script again — the
rsync is incremental, bootstrap_new_server.sh is idempotent, and
your .env on the server is preserved.
EOF
