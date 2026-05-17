#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# scripts/harden-vps.sh
# ───────────────────────────────────────────────────────────────────────
# Single command для всего P1-блока: basic-auth, бэкапы, fail2ban,
# Hetzner snapshot. Запускать с ноутбука.
#
# Использование:
#   ./scripts/harden-vps.sh root@<IP>
#
# Env (опционально):
#   ADMIN_USER         — default 'admin'
#   ADMIN_PASS         — если задан, не спрашивает; иначе попросит ввести
#   SKIP_FAIL2BAN=1    — пропустить установку fail2ban
#   SKIP_CRON=1        — не прописывать cron бэкапов
#   SKIP_SNAPSHOT=1    — не делать снапшот в Hetzner
#   HCLOUD_TOKEN       — если задан, скрипт сделает snapshot через API
#   NAME=ai-stack      — имя сервера в Hetzner (для snapshot)
#
# Идемпотентно: cron-строка вставляется один раз, fail2ban не
# переустанавливается, basic-auth просто перезаписывается.
# ═══════════════════════════════════════════════════════════════════════

set -euo pipefail

TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  echo "Использование: $0 root@<IP>"
  exit 1
fi

STACK_DIR="/opt/ai-stack"
ADMIN_USER="${ADMIN_USER:-admin}"
NAME="${NAME:-ai-stack}"
SSH_OPTS="-o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -o ServerAliveInterval=15"

# ── 1. basic-auth ──────────────────────────────────────────────────────
echo "═══ 1/4 Basic-auth для /admin и /board ═══"
if [ -z "${ADMIN_PASS:-}" ]; then
  printf "Пароль для пользователя '%s': " "$ADMIN_USER"
  stty -echo; read -r ADMIN_PASS; stty echo; echo
fi
if [ -z "${ADMIN_PASS:-}" ]; then
  echo "ERROR: пустой пароль"; exit 1
fi

if ! command -v openssl >/dev/null; then
  echo "ERROR: нужен openssl"; exit 1
fi
SALT=$(openssl rand -hex 4)
HASH=$(openssl passwd -apr1 -salt "$SALT" "$ADMIN_PASS")
HTPASSWD_LINE="${ADMIN_USER}:${HASH}"

echo "→ Обновляю ADMIN_BASIC_AUTH в $STACK_DIR/.env"
# Пробрасываем строку через base64, чтобы $apr1$… не интерпретировался shell-ом.
ENC=$(printf '%s' "$HTPASSWD_LINE" | base64 | tr -d '\n')
ssh $SSH_OPTS "$TARGET" "bash -s '$STACK_DIR' '$ENC'" <<'REMOTE'
set -eu
STACK_DIR="$1"; ENC="$2"
LINE=$(echo "$ENC" | base64 -d)
ENVFILE="$STACK_DIR/.env"
[ -f "$ENVFILE" ] || { echo "ERROR: $ENVFILE не найден"; exit 1; }
# Удаляем старую строку (если есть), вставляем новую.
sed -i '/^ADMIN_BASIC_AUTH=/d' "$ENVFILE"
printf "ADMIN_BASIC_AUTH='%s'\n" "$LINE" >> "$ENVFILE"
chown ai:ai "$ENVFILE"
chmod 600 "$ENVFILE"
echo "  обновлено"
echo "→ Перезапускаю nginx"
cd "$STACK_DIR"
sudo -u ai docker compose up -d nginx
REMOTE

# Проверяем что auth заработала.
IP=$(echo "$TARGET" | sed 's/.*@//')
echo "→ Проверяю что /admin закрыт"
sleep 2
CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://$IP/admin" || echo "ERR")
echo "  http://$IP/admin → $CODE (ожидаем 401)"
CODE_AUTH=$(curl -s -o /dev/null -w '%{http_code}' -u "$ADMIN_USER:$ADMIN_PASS" "http://$IP/admin" || echo "ERR")
echo "  с авторизацией  → $CODE_AUTH (ожидаем 200)"

# ── 2. Cron бэкапов ────────────────────────────────────────────────────
if [ "${SKIP_CRON:-0}" != "1" ]; then
  echo ""
  echo "═══ 2/4 Cron ежедневных бэкапов ═══"
  ssh $SSH_OPTS "$TARGET" "bash -s '$STACK_DIR'" <<'REMOTE'
set -eu
STACK_DIR="$1"
LINE="0 3 * * * cd $STACK_DIR && ./scripts/backup.sh >> /var/log/ai-backup.log 2>&1"
# Если /var/log/ai-backup.log не существует — touch + chown ai.
touch /var/log/ai-backup.log
chown ai:ai /var/log/ai-backup.log
# Идемпотентно: убираем старую строку, вставляем заново.
CRON_TMP=$(mktemp)
sudo -u ai crontab -l 2>/dev/null > "$CRON_TMP" || true
grep -v 'scripts/backup.sh' "$CRON_TMP" > "${CRON_TMP}.new" || true
echo "$LINE" >> "${CRON_TMP}.new"
sudo -u ai crontab "${CRON_TMP}.new"
rm -f "$CRON_TMP" "${CRON_TMP}.new"
echo "  cron установлен:"
sudo -u ai crontab -l | grep backup
REMOTE
else
  echo "(SKIP_CRON=1 — cron не трогаю)"
fi

# ── 3. fail2ban ────────────────────────────────────────────────────────
if [ "${SKIP_FAIL2BAN:-0}" != "1" ]; then
  echo ""
  echo "═══ 3/4 fail2ban для SSH ═══"
  ssh $SSH_OPTS "$TARGET" 'bash -s' <<'REMOTE'
set -eu
export DEBIAN_FRONTEND=noninteractive
if ! command -v fail2ban-client >/dev/null; then
  apt-get install -y -qq fail2ban >/dev/null
fi
# Минимальный jail для SSH (3 попытки за 10 мин → бан на час).
cat > /etc/fail2ban/jail.d/ssh.conf <<'JAIL'
[sshd]
enabled  = true
port     = 22
filter   = sshd
backend  = systemd
maxretry = 3
findtime = 600
bantime  = 3600
JAIL
systemctl enable --now fail2ban >/dev/null
systemctl restart fail2ban
sleep 1
fail2ban-client status sshd | sed 's/^/  /'
REMOTE
else
  echo "(SKIP_FAIL2BAN=1 — fail2ban не ставлю)"
fi

# ── 4. Hetzner snapshot ────────────────────────────────────────────────
if [ "${SKIP_SNAPSHOT:-0}" != "1" ] && [ -n "${HCLOUD_TOKEN:-}" ]; then
  echo ""
  echo "═══ 4/4 Hetzner snapshot ═══"
  API="https://api.hetzner.cloud/v1"
  SRV_ID=$(curl -fsS -H "Authorization: Bearer $HCLOUD_TOKEN" "$API/servers?name=$NAME" \
    | jq -r '.servers[0].id // empty')
  if [ -z "$SRV_ID" ]; then
    echo "  сервер '$NAME' не найден в Hetzner — пропускаю"
  else
    DATE=$(date +%Y-%m-%d)
    echo "→ Делаю snapshot 'ai-stack-$DATE'"
    RESP=$(curl -fsS -X POST -H "Authorization: Bearer $HCLOUD_TOKEN" \
      -H "Content-Type: application/json" \
      "$API/servers/$SRV_ID/actions/create_image" \
      -d "{\"description\":\"ai-stack-$DATE post-harden\",\"type\":\"snapshot\"}")
    IMG_ID=$(echo "$RESP" | jq -r '.image.id // empty')
    ACT_ID=$(echo "$RESP" | jq -r '.action.id // empty')
    echo "  snapshot id=$IMG_ID action=$ACT_ID (создаётся ~3-5 минут в фоне)"
  fi
elif [ "${SKIP_SNAPSHOT:-0}" = "1" ]; then
  echo "(SKIP_SNAPSHOT=1)"
else
  echo ""
  echo "═══ 4/4 Hetzner snapshot ═══"
  echo "  HCLOUD_TOKEN не задан — снапшот вручную:"
  echo "    Hetzner Console → твой сервер → Snapshots → Take Snapshot"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "✓ P1 закрыт"
echo ""
echo "  /admin login:  $ADMIN_USER / (что ввёл)"
echo "  Логи бэкапа:   ssh $TARGET 'tail -f /var/log/ai-backup.log'"
echo "  fail2ban:      ssh $TARGET 'fail2ban-client status sshd'"
echo "═══════════════════════════════════════════════════════════════════"
