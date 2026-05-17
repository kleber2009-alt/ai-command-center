#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# scripts/bootstrap-vps.sh
# ───────────────────────────────────────────────────────────────────────
# Один прогон от свежего Ubuntu 22.04 до работающего стека:
#
#   1. ssh root@host
#   2. apt + docker + git + ufw + postgresql-client + jq
#   3. ufw allow 22/80/443
#   4. useradd ai, docker group, /opt/ai-stack
#   5. git clone репозитория в /opt/ai-stack
#   6. (если есть локальный .env — переливает его на сервер)
#   7. docker compose up -d --build
#   8. ждёт healthchecks
#
# Использование (с ноутбука):
#   ./scripts/bootstrap-vps.sh root@<IP>
#
# Env (опционально):
#   REPO_URL        — default https://github.com/kleber2009-alt/ai-command-center.git
#   REPO_BRANCH     — default claude/deploy-to-server-bRK1j
#   LOCAL_ENV_FILE  — путь к локальному .env с ключами, который надо
#                     залить на сервер (default ./.env, если существует)
# ═══════════════════════════════════════════════════════════════════════

set -euo pipefail

TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  echo "Использование: $0 root@<IP>"
  exit 1
fi

REPO_URL="${REPO_URL:-https://github.com/kleber2009-alt/ai-command-center.git}"
REPO_BRANCH="${REPO_BRANCH:-claude/deploy-to-server-bRK1j}"
LOCAL_ENV_FILE="${LOCAL_ENV_FILE:-./.env}"
STACK_DIR="/opt/ai-stack"

SSH_OPTS="-o StrictHostKeyChecking=accept-new -o ConnectTimeout=10"

echo "→ Жду cloud-init на сервере"
ssh $SSH_OPTS "$TARGET" 'cloud-init status --wait 2>/dev/null || true'

echo "→ Базовые пакеты"
ssh $SSH_OPTS "$TARGET" 'bash -s' <<'REMOTE'
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

if ! command -v docker >/dev/null; then
  echo "  apt update + install"
  apt-get update -qq
  apt-get install -y -qq \
    docker.io docker-compose-plugin \
    git ufw jq curl wget \
    postgresql-client-common >/dev/null
  # postgresql-client-16 идёт из add-on репо в 22.04, ставим 14 если 16 нет
  apt-get install -y -qq postgresql-client-16 2>/dev/null \
    || apt-get install -y -qq postgresql-client >/dev/null
  systemctl enable --now docker
else
  echo "  docker уже установлен"
fi

echo "  ufw"
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

echo "  юзер ai"
if ! id ai >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" ai
  usermod -aG docker ai
  # Пробрасываем root-ключи юзеру ai, чтобы ssh ai@host тоже работал.
  mkdir -p /home/ai/.ssh
  cp /root/.ssh/authorized_keys /home/ai/.ssh/authorized_keys
  chown -R ai:ai /home/ai/.ssh
  chmod 700 /home/ai/.ssh
  chmod 600 /home/ai/.ssh/authorized_keys
fi
REMOTE

echo "→ Клонирую репо в $STACK_DIR ($REPO_BRANCH)"
ssh $SSH_OPTS "$TARGET" "bash -s '$REPO_URL' '$REPO_BRANCH' '$STACK_DIR'" <<'REMOTE'
set -euo pipefail
REPO_URL="$1"; REPO_BRANCH="$2"; STACK_DIR="$3"

if [ ! -d "$STACK_DIR/.git" ]; then
  mkdir -p "$(dirname "$STACK_DIR")"
  sudo -u ai git clone --depth 50 -b "$REPO_BRANCH" "$REPO_URL" "$STACK_DIR"
  chown -R ai:ai "$STACK_DIR"
else
  cd "$STACK_DIR"
  sudo -u ai git fetch --depth 50 origin "$REPO_BRANCH"
  sudo -u ai git checkout "$REPO_BRANCH"
  sudo -u ai git reset --hard "origin/$REPO_BRANCH"
fi
REMOTE

# ── .env ─────────────────────────────────────────────────────────────────
if [ -f "$LOCAL_ENV_FILE" ]; then
  echo "→ Заливаю локальный $LOCAL_ENV_FILE на сервер ($STACK_DIR/.env)"
  scp $SSH_OPTS "$LOCAL_ENV_FILE" "$TARGET:$STACK_DIR/.env"
  ssh $SSH_OPTS "$TARGET" "chown ai:ai $STACK_DIR/.env && chmod 600 $STACK_DIR/.env"
else
  echo "→ Локального $LOCAL_ENV_FILE нет — на сервере остаётся .env.example"
  echo "  ВАЖНО: зайди на сервер, скопируй .env.example → .env, заполни ключи,"
  echo "  потом запусти: ssh $TARGET 'cd $STACK_DIR && docker compose up -d --build'"
  exit 0
fi

# ── Стартуем стек ────────────────────────────────────────────────────────
echo "→ docker compose up -d --build (это займёт 3-5 минут на первом запуске)"
ssh $SSH_OPTS "$TARGET" "cd $STACK_DIR && sudo -u ai docker compose up -d --build" 2>&1 | tail -40

echo "→ Жду healthcheck (до 90 сек)"
HEALTH_OK=0
for i in $(seq 1 30); do
  if ssh $SSH_OPTS "$TARGET" 'curl -fsS http://127.0.0.1/healthz' >/dev/null 2>&1; then
    HEALTH_OK=1
    echo "  healthz OK после ${i}*3 сек"
    break
  fi
  sleep 3
done

echo ""
echo "═══════════════════════════════════════════════════════════════════"
if [ "$HEALTH_OK" = "1" ]; then
  IP=$(echo "$TARGET" | sed 's/.*@//')
  echo "✓ Стек поднят"
  echo ""
  echo "  Открой в браузере: http://$IP/"
  echo "  Главная transcribe: http://$IP/transcribe"
  echo "  Healthcheck:        http://$IP/healthz"
  echo ""
  echo "  Дальше — перенос данных из Supabase:"
  echo "    ssh $TARGET"
  echo "    cd $STACK_DIR"
  echo "    ./scripts/migrate-data.sh"
else
  echo "✗ healthz не отвечает за 90 сек"
  echo "  Смотри логи:  ssh $TARGET 'cd $STACK_DIR && docker compose logs --tail=80'"
  exit 1
fi
echo "═══════════════════════════════════════════════════════════════════"
