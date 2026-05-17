#!/usr/bin/env bash
# One-shot bootstrap for a fresh VPS (Ubuntu/Debian).
#
# What it does:
#  1. Installs Docker if missing.
#  2. Configures ufw (22, 80, 443).
#  3. Clones the repo to /opt/ai-command-center on the working branch.
#  4. Copies .env.example -> .env (if .env doesn't exist) and prompts you to edit.
#  5. Runs docker compose up -d --build.
#  6. Polls /api/health until it goes green.
#
# Run as root:
#   curl -fsSL https://raw.githubusercontent.com/kleber2009-alt/ai-command-center/claude/ai-assistant-window-7VAXz/scripts/bootstrap.sh | bash
#
# Or after `git clone` if you prefer to inspect first:
#   bash scripts/bootstrap.sh

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/kleber2009-alt/ai-command-center.git}"
BRANCH="${BRANCH:-claude/ai-assistant-window-7VAXz}"
INSTALL_DIR="${INSTALL_DIR:-/opt/ai-command-center}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Запусти от root (sudo bash scripts/bootstrap.sh)."
  exit 1
fi

OS_ID="$(. /etc/os-release && echo "$ID")"
case "$OS_ID" in
  ubuntu|debian) ;;
  *)
    echo "Поддерживаются Ubuntu и Debian. Найдено: $OS_ID"
    exit 1
    ;;
esac

echo "→ обновление пакетов"
apt-get update -qq
apt-get install -y -qq curl ca-certificates git ufw

if ! command -v docker >/dev/null 2>&1; then
  echo "→ установка Docker"
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
else
  echo "→ Docker уже установлен ($(docker --version))"
fi

# Firewall: allow ssh, http, https
echo "→ настройка ufw (22/80/443)"
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable >/dev/null

# Clone or pull
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "→ репо уже клонирован, обновляюсь"
  cd "$INSTALL_DIR"
  git fetch --prune origin
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
else
  echo "→ клонирую $REPO_URL в $INSTALL_DIR"
  git clone --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# .env
if [ ! -f "$INSTALL_DIR/.env" ]; then
  cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"
  cat <<EOF

  .env скопирован из .env.example. Открой и заполни ключи:

    nano $INSTALL_DIR/.env

  Минимум, который нужен:
    ANTHROPIC_API_KEY=...
    OPENAI_API_KEY=...
    DEEPGRAM_API_KEY=...
    YTDLP_SERVICE_API_KEY=<любая длинная строка>
    DOMAIN=<твой-домен>

  После этого запусти:
    cd $INSTALL_DIR && docker compose up -d --build

EOF
  exit 0
fi

# Start stack
echo "→ docker compose build + up -d"
cd "$INSTALL_DIR"
docker compose up -d --build

# Wait for /api/health
echo "→ жду /api/health"
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  sleep 5
  if curl -fsS -o /dev/null http://127.0.0.1/api/health 2>/dev/null; then
    echo "  /api/health через Caddy: ok"
    break
  fi
  if [ "$i" = "12" ]; then
    echo "  /api/health не отвечает через минуту. Проверь логи:"
    echo "    docker compose logs -f app"
    echo "    docker compose logs -f caddy"
    exit 1
  fi
done

DOMAIN_VAL="$(grep '^DOMAIN=' .env | head -1 | cut -d= -f2- | tr -d ' "')"
DOMAIN_VAL="${DOMAIN_VAL:-localhost}"

cat <<EOF

  ✓ готово.

  Открой:                 https://$DOMAIN_VAL/transcribe
  Логи приложения:        docker compose logs -f app
  Состояние:              docker compose ps
  Обновление до свежего:  bash $INSTALL_DIR/scripts/update.sh
  Бэкап БД:               bash $INSTALL_DIR/scripts/backup.sh

EOF
