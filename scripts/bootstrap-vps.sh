#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# scripts/bootstrap-vps.sh
# ───────────────────────────────────────────────────────────────────────
# Один прогон от свежего Ubuntu 22.04 до работающего стека:
#
#   1. ssh root@host
#   2. apt + docker + git + ufw + postgresql-client-16 (через офиц. репо)
#   3. ufw allow 22/80/443 (по портам — без зависимости от профиля OpenSSH)
#   4. useradd ai, docker group, /opt/ai-stack
#   5. git clone репозитория в /opt/ai-stack
#   6. (если есть локальный .env — переливает его на сервер)
#   7. docker compose up -d --build
#   8. ждёт healthchecks
#
# Идемпотентно: повторный запуск ничего не сломает, докатит то, что
# не доехало.
#
# Использование (с ноутбука):
#   ./scripts/bootstrap-vps.sh root@<IP>
#
# Env:
#   REPO_URL        — default https://github.com/kleber2009-alt/ai-command-center.git
#   REPO_BRANCH     — default claude/deploy-to-server-bRK1j
#   LOCAL_ENV_FILE  — путь к локальному .env с ключами, который надо
#                     залить на сервер (default ./.env)
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

SSH_OPTS="-o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -o ServerAliveInterval=15"

echo "→ Жду cloud-init на сервере (может занять до 90 сек)"
ssh $SSH_OPTS "$TARGET" 'cloud-init status --wait 2>/dev/null || true'

echo "→ Базовые пакеты"
ssh $SSH_OPTS "$TARGET" 'bash -s' <<'REMOTE'
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

apt_install() {
  apt-get install -y -qq \
    -o Dpkg::Options::="--force-confdef" \
    -o Dpkg::Options::="--force-confold" \
    "$@" >/dev/null
}

if ! command -v docker >/dev/null; then
  echo "  apt update"
  apt-get update -qq
  echo "  install docker, git, ufw, jq, curl, wget, gnupg, ca-certificates"
  apt_install docker.io docker-compose-plugin \
    git ufw jq curl wget gnupg ca-certificates lsb-release
  systemctl enable --now docker
else
  echo "  docker уже установлен — пропускаю apt"
fi

# postgresql-client-16: ставим из официального APT-репо PostgreSQL.
# В дефолтных Ubuntu 22.04 репах только 14 — а Supabase сейчас на 17,
# pg_dump v14 откажется делать дамп с ошибкой server version mismatch.
if ! command -v pg_dump >/dev/null || ! pg_dump --version | grep -qE ' 1[6-9]\.| 2[0-9]\.'; then
  echo "  добавляю PostgreSQL APT repo + ставлю postgresql-client-16"
  install -d -m 0755 /usr/share/keyrings
  if [ ! -f /usr/share/keyrings/postgresql.gpg ]; then
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
      | gpg --dearmor -o /usr/share/keyrings/postgresql.gpg
  fi
  CODENAME=$(lsb_release -cs)
  echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt $CODENAME-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list
  apt-get update -qq
  apt_install postgresql-client-16
else
  echo "  pg_dump $(pg_dump --version | awk '{print $3}') ок"
fi

echo "  ufw"
# Важно: сначала allow по портам (а не профилям — OpenSSH-профиль может
# отсутствовать на минимальных образах), потом enable. ufw сохраняет
# существующие SSH-сессии через connection tracking.
if ufw status | grep -q "Status: active"; then
  echo "    уже активен — обновляю правила"
fi
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp  >/dev/null
ufw allow 80/tcp  >/dev/null
ufw allow 443/tcp >/dev/null
yes | ufw enable >/dev/null

echo "  юзер ai"
if ! id ai >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" ai >/dev/null
  echo "    создан"
fi
usermod -aG docker ai
# Пробрасываем root-ключи юзеру ai, чтобы ssh ai@host тоже работал.
mkdir -p /home/ai/.ssh
if [ -f /root/.ssh/authorized_keys ]; then
  cp /root/.ssh/authorized_keys /home/ai/.ssh/authorized_keys
fi
chown -R ai:ai /home/ai/.ssh
chmod 700 /home/ai/.ssh
[ -f /home/ai/.ssh/authorized_keys ] && chmod 600 /home/ai/.ssh/authorized_keys

# Каталог под бэкапы (cron из scripts/backup.sh пишет сюда).
install -d -m 0755 -o ai -g ai /opt/ai-backups
REMOTE

echo "→ Клонирую репо в $STACK_DIR ($REPO_BRANCH)"
ssh $SSH_OPTS "$TARGET" "bash -s '$REPO_URL' '$REPO_BRANCH' '$STACK_DIR'" <<'REMOTE'
set -euo pipefail
REPO_URL="$1"; REPO_BRANCH="$2"; STACK_DIR="$3"

if [ ! -d "$STACK_DIR/.git" ]; then
  mkdir -p "$(dirname "$STACK_DIR")"
  # Owner до клона — чтобы git index сразу принадлежал ai.
  install -d -o ai -g ai "$STACK_DIR"
  sudo -u ai git clone --depth 50 -b "$REPO_BRANCH" "$REPO_URL" "$STACK_DIR"
else
  # На случай если каталог остался от прошлой попытки под root —
  # перевешиваем владельца, иначе sudo -u ai git ругнётся на safe.directory.
  chown -R ai:ai "$STACK_DIR"
  cd "$STACK_DIR"
  sudo -u ai git fetch --depth 50 origin "$REPO_BRANCH"
  sudo -u ai git checkout -f "$REPO_BRANCH"
  sudo -u ai git reset --hard "origin/$REPO_BRANCH"
fi
REMOTE

# ── .env ─────────────────────────────────────────────────────────────────
if [ -f "$LOCAL_ENV_FILE" ]; then
  echo "→ Заливаю локальный $LOCAL_ENV_FILE → $STACK_DIR/.env"
  scp $SSH_OPTS "$LOCAL_ENV_FILE" "$TARGET:$STACK_DIR/.env"
  ssh $SSH_OPTS "$TARGET" "chown ai:ai $STACK_DIR/.env && chmod 600 $STACK_DIR/.env"
else
  echo "→ Локального $LOCAL_ENV_FILE нет — нужно заполнить на сервере."
  ssh $SSH_OPTS "$TARGET" "cd $STACK_DIR && [ -f .env ] || (cp .env.example .env && chown ai:ai .env && chmod 600 .env)"
  echo "  ВАЖНО: ssh $TARGET 'nano $STACK_DIR/.env', потом запусти этот скрипт снова."
  exit 0
fi

# ── Стартуем стек ────────────────────────────────────────────────────────
echo "→ docker compose up -d --build (на чистом сервере: 3-7 минут)"
ssh $SSH_OPTS "$TARGET" "cd $STACK_DIR && sudo -u ai docker compose up -d --build" 2>&1 | tail -50

echo "→ Жду healthcheck (до 120 сек)"
HEALTH_OK=0
for i in $(seq 1 40); do
  if ssh $SSH_OPTS "$TARGET" 'curl -fsS http://127.0.0.1/healthz' >/dev/null 2>&1; then
    HEALTH_OK=1
    echo "  healthz OK после $((i*3)) сек"
    break
  fi
  sleep 3
done

IP=$(echo "$TARGET" | sed 's/.*@//')

echo ""
echo "═══════════════════════════════════════════════════════════════════"
if [ "$HEALTH_OK" = "1" ]; then
  echo "✓ Стек поднят"
  echo ""
  echo "  Главная (ai-office):  http://$IP/"
  echo "  Transcribe (Next.js): http://$IP/transcribe"
  echo "  Healthcheck:          http://$IP/healthz"
  echo ""
  echo "  Дальше — перенос данных из Supabase:"
  echo "    ssh $TARGET 'cd $STACK_DIR && sudo -u ai ./scripts/migrate-data.sh'"
else
  echo "✗ healthz не ответил за 120 сек"
  echo "  Покажи логи:  ssh $TARGET 'cd $STACK_DIR && docker compose ps && docker compose logs --tail=80'"
  exit 1
fi
echo "═══════════════════════════════════════════════════════════════════"
