#!/usr/bin/env bash
# Print the latest sign-in link from the web log (used while SMTP is not set)
# and show it as a QR code — scan it with a phone, or retype nothing at all.
#
#   bash /opt/ai-command-center/apps/persona-studio/deploy/login-link.sh
set -euo pipefail
cd "$(dirname "$0")"

link="$(docker compose -f docker-compose.prod.yml --env-file .env.prod logs --no-log-prefix web 2>/dev/null \
  | grep -o 'magic-link for [^ ]*: [^ ]*' | tail -1 | sed 's/^.*: //')"

if [ -z "$link" ]; then
  echo "Ссылки нет: на сайте нажмите «Прислать magic-link», затем запустите скрипт снова."
  exit 1
fi

if ! command -v qrencode >/dev/null 2>&1; then
  apt-get install -y -qq qrencode >/dev/null 2>&1 || true
fi
command -v qrencode >/dev/null 2>&1 && qrencode -t ANSIUTF8 -m 1 "$link"
echo
echo "$link"
