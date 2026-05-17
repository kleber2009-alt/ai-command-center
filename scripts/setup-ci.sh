#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# scripts/setup-ci.sh
# ───────────────────────────────────────────────────────────────────────
# Готовит SSH-ключ для GitHub Actions автодеплоя и печатает значения,
# которые надо вставить в Settings → Secrets and variables → Actions.
#
# Использование:
#   ./scripts/setup-ci.sh root@<IP>
#
# Что делает:
#   1. На сервере под юзером ai генерит ed25519-ключ (если ещё нет).
#   2. Добавляет его в /home/ai/.ssh/authorized_keys.
#   3. Печатает 4 секрета для GitHub.
#
# После этого вставь значения в GitHub и пушни в main —
# .github/workflows/deploy.yml сам прокатит первый деплой.
# ═══════════════════════════════════════════════════════════════════════

set -euo pipefail

TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  echo "Использование: $0 root@<IP>"
  exit 1
fi

STACK_DIR="${STACK_DIR:-/opt/ai-stack}"
SSH_OPTS="-o StrictHostKeyChecking=accept-new -o ConnectTimeout=10"
IP=$(echo "$TARGET" | sed 's/.*@//')

echo "→ Генерю/беру deploy-ключ на сервере (юзер ai)"
PRIVATE_KEY=$(ssh $SSH_OPTS "$TARGET" 'bash -s' <<'REMOTE'
set -eu
KEYFILE=/home/ai/.ssh/gh-deploy
if [ ! -f "$KEYFILE" ]; then
  sudo -u ai ssh-keygen -t ed25519 -f "$KEYFILE" -N '' -C "github-actions@ai-stack" >/dev/null
  cat "$KEYFILE.pub" >> /home/ai/.ssh/authorized_keys
  sort -u /home/ai/.ssh/authorized_keys -o /home/ai/.ssh/authorized_keys
  chown ai:ai /home/ai/.ssh/authorized_keys
  chmod 600 /home/ai/.ssh/authorized_keys
fi
cat "$KEYFILE"
REMOTE
)

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "Скопируй в GitHub → Settings → Secrets and variables → Actions →"
echo "New repository secret. Создай ЧЕТЫРЕ секрета:"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "─── DEPLOY_HOST ────────────────────────────────────────────────────"
echo "$IP"
echo ""
echo "─── DEPLOY_USER ────────────────────────────────────────────────────"
echo "ai"
echo ""
echo "─── DEPLOY_PATH ────────────────────────────────────────────────────"
echo "$STACK_DIR"
echo ""
echo "─── DEPLOY_SSH_KEY ─────────────────────────────────────────────────"
echo "$PRIVATE_KEY"
echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "После того как добавишь все 4 секрета — push в main триггерит"
echo "автодеплой: смотри Actions → 'Deploy to Hetzner'."
