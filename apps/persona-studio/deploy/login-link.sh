#!/usr/bin/env bash
# Owner sign-in without e-mail.
#
#   bash /opt/ai-command-center/apps/persona-studio/deploy/login-link.sh [owner-email]
#
# First run: stores OWNER_EMAIL (argument, or the address from the last
# «Прислать magic-link» request) and a random OWNER_LOGIN_KEY in .env.prod,
# restarts the web container, then prints the personal link
# https://<domain>/api/owner-login?key=… (+ QR code). The link keeps working
# until OWNER_LOGIN_KEY is changed — keep it private.
set -euo pipefail
cd "$(dirname "$0")"
COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env.prod)

last_magic() {
  "${COMPOSE[@]}" logs --no-log-prefix web 2>/dev/null | grep -o 'magic-link for [^ ]*: [^ ]*' | tail -1 || true
}

changed=0
if ! grep -q '^OWNER_EMAIL=.\+' .env.prod; then
  email="${1:-}"
  [ -n "$email" ] || email="$(last_magic | sed -E 's/^magic-link for ([^:]+):.*/\1/')"
  if [ -z "$email" ]; then
    echo "Укажите e-mail владельца: bash $0 you@example.com"
    exit 1
  fi
  sed -i '/^OWNER_EMAIL=/d' .env.prod
  echo "OWNER_EMAIL=$email" >> .env.prod
  changed=1
fi
if ! grep -q '^OWNER_LOGIN_KEY=.\{32,\}' .env.prod; then
  sed -i '/^OWNER_LOGIN_KEY=/d' .env.prod
  echo "OWNER_LOGIN_KEY=$(openssl rand -hex 32)" >> .env.prod
  changed=1
fi
if [ "$changed" = 1 ]; then
  echo "Перезапускаю сайт с ключом владельца…"
  "${COMPOSE[@]}" up -d web >/dev/null
  sleep 8
fi

set -a; . ./.env.prod; set +a
link="https://$DOMAIN/api/owner-login?key=$OWNER_LOGIN_KEY"

if ! command -v qrencode >/dev/null 2>&1; then
  apt-get install -y -qq qrencode >/dev/null 2>&1 || true
fi
command -v qrencode >/dev/null 2>&1 && qrencode -t ANSIUTF8 -m 1 "$link"
echo
echo "Вход владельца ($OWNER_EMAIL), без письма:"
echo "$link"
