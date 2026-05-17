#!/usr/bin/env bash
# One-shot installer for a fresh Hetzner / Ubuntu 24.04 VPS.
#
# Run as root immediately after `ssh root@<IP>`:
#   bash <(curl -fsSL https://raw.githubusercontent.com/kleber2009-alt/ai-command-center/main/scripts/install-vps.sh)
#
# Or download first, inspect, then run:
#   curl -fsSL ... -o install.sh
#   less install.sh
#   bash install.sh
#
# What it does:
#   1. apt update + base packages
#   2. ufw firewall (22 + 80 + 443)
#   3. Docker via official convenience script
#   4. Create `app` user, give it docker access, copy your SSH key
#   5. Clone the repo as `app`
#   6. Generate strong passwords / secrets, prompt for the rest
#   7. Build and start `docker compose up -d --build`
#   8. Tail the app log so you can watch Caddy provision the cert

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/kleber2009-alt/ai-command-center.git}"
APP_DIR="/home/app/ai-command-center"

if [[ "$EUID" -ne 0 ]]; then
  echo "Run as root: sudo bash $0" >&2
  exit 1
fi

require_input() {
  local var="$1" prompt="$2" default="${3:-}"
  local value=""
  while [[ -z "$value" ]]; do
    if [[ -n "$default" ]]; then
      read -rp "$prompt [$default]: " value
      value="${value:-$default}"
    else
      read -rp "$prompt: " value
    fi
  done
  printf -v "$var" '%s' "$value"
}

# ─── 1. Prompts ────────────────────────────────────────────────────────
echo "=== ai-command-center bootstrap ==="
echo

require_input DOMAIN          "Домен для приложения (например, transcribe.example.com)"
require_input ANTHROPIC_KEY   "ANTHROPIC_API_KEY (sk-ant-...)"
require_input DEEPGRAM_KEY    "DEEPGRAM_API_KEY"
read -rp "OPENAI_API_KEY (для /me embeddings, можно пропустить): " OPENAI_KEY
read -rp "ADMIN_BASIC_AUTH в формате user:password (пусто = /admin открыт всем): " ADMIN_AUTH
read -rp "TELEGRAM_BOT_TOKEN (пусто = API открыт): " TG_TOKEN
read -rp "APIFY_API_TOKEN (для Instagram через Apify, можно пропустить): " APIFY_TOKEN

POSTGRES_PW=$(openssl rand -hex 24)
YTDLP_SECRET=$(openssl rand -hex 32)

echo
echo "→ домен:        $DOMAIN"
echo "→ POSTGRES_PASSWORD: автогенерация ($POSTGRES_PW)"
echo "→ YTDLP_SERVICE_API_KEY: автогенерация ($YTDLP_SECRET)"
echo
read -rp "Продолжить? [y/N] " ok
[[ "$ok" == "y" || "$ok" == "Y" ]] || { echo "Прервано."; exit 1; }

# ─── 2. System packages + firewall ────────────────────────────────────
echo
echo "[1/6] Обновление пакетов..."
DEBIAN_FRONTEND=noninteractive apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ufw fail2ban git curl ca-certificates openssl

echo "[2/6] Файрвол..."
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

# ─── 3. Docker ────────────────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  echo "[3/6] Установка Docker..."
  curl -fsSL https://get.docker.com | sh >/dev/null
else
  echo "[3/6] Docker уже установлен."
fi

# ─── 4. App user ──────────────────────────────────────────────────────
echo "[4/6] Пользователь app..."
if ! id app >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" app >/dev/null
fi
usermod -aG docker app
mkdir -p /home/app/.ssh
if [[ -f /root/.ssh/authorized_keys ]]; then
  cp /root/.ssh/authorized_keys /home/app/.ssh/
fi
chown -R app:app /home/app/.ssh
chmod 700 /home/app/.ssh
chmod 600 /home/app/.ssh/authorized_keys 2>/dev/null || true

# ─── 5. Clone repo + write .env ───────────────────────────────────────
echo "[5/6] Клонирование репо..."
if [[ ! -d "$APP_DIR" ]]; then
  sudo -u app git clone "$REPO_URL" "$APP_DIR"
else
  sudo -u app git -C "$APP_DIR" pull
fi

cat > "$APP_DIR/.env" <<EOF
DOMAIN=$DOMAIN
POSTGRES_USER=app
POSTGRES_PASSWORD=$POSTGRES_PW
POSTGRES_DB=app
ANTHROPIC_API_KEY=$ANTHROPIC_KEY
DEEPGRAM_API_KEY=$DEEPGRAM_KEY
OPENAI_API_KEY=$OPENAI_KEY
YTDLP_SERVICE_API_KEY=$YTDLP_SECRET
ADMIN_BASIC_AUTH=$ADMIN_AUTH
TELEGRAM_BOT_TOKEN=$TG_TOKEN
APIFY_API_TOKEN=$APIFY_TOKEN
COOKIES_B64=
INSTAGRAM_COOKIES_B64=
EOF
chown app:app "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"

# ─── 6. docker compose up ─────────────────────────────────────────────
echo "[6/6] Сборка и запуск стека (это займёт 3-5 минут)..."
cd "$APP_DIR"
sudo -u app docker compose up -d --build

# ─── Backup cron ──────────────────────────────────────────────────────
mkdir -p /home/app/backups /home/app/logs
chown app:app /home/app/backups /home/app/logs
CRON_LINE="0 4 * * * $APP_DIR/scripts/backup-db.sh >> /home/app/logs/backup.log 2>&1"
( sudo -u app crontab -l 2>/dev/null | grep -v 'backup-db.sh'; echo "$CRON_LINE" ) \
  | sudo -u app crontab -

# ─── Done ─────────────────────────────────────────────────────────────
echo
echo "=========================================="
echo "  ✅ Установка завершена"
echo "=========================================="
echo
echo "→ Открой в браузере:  https://$DOMAIN/transcribe"
echo "   (Caddy получит SSL-сертификат при первом HTTPS-запросе, ~10 сек)"
echo
echo "→ Логи приложения:  ssh app@<IP> 'cd ai-command-center && docker compose logs -f app'"
echo "→ Статус:           ssh app@<IP> 'cd ai-command-center && docker compose ps'"
echo "→ Бэкап БД:         ежедневно в 04:00 UTC в /home/app/backups/"
echo
echo "→ Следующий шаг: в @BotFather → /mybots → твой бот →"
echo "   Bot Settings → Menu Button → URL = https://$DOMAIN/transcribe"
echo
