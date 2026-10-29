#!/usr/bin/env bash
# Connect Persona Studio to the «Студия Кадрика» bot running on the same box.
#
#   ssh root@<server> bash /opt/ai-command-center/apps/persona-studio/deploy/connect-kadrik.sh
#
# Reads PERSONA_API_KEY from the bot's .env (creates one and restarts the bot
# if it's missing), stores KADRIK_API_URL / KADRIK_API_KEY as admin-set
# integration keys (AppSetting — picked up by web and workers within 30 s, no
# rebuild), then checks the bot accepts the key. Prints no secrets.
set -euo pipefail

BOT_ENV="${BOT_ENV:-/home/iliapaliy/studio-kadrik-bot/.env}"
BOT_SERVICE="${BOT_SERVICE:-studio-kadrik-bot}"
KADRIK_URL="${KADRIK_URL:-https://kadrik.aicex.club}"
DEPLOY="$(cd "$(dirname "$0")" && pwd)"

[ -f "$BOT_ENV" ] || { echo "✗ не найден $BOT_ENV (BOT_ENV=путь если бот в другой папке)"; exit 1; }

key="$(grep -E '^PERSONA_API_KEY=' "$BOT_ENV" | tail -1 | cut -d= -f2- | tr -d '"'"'"' \r')"
if [ -z "$key" ]; then
  key="$(openssl rand -hex 32)"
  printf '\nPERSONA_API_KEY=%s\n' "$key" >> "$BOT_ENV"
  systemctl restart "$BOT_SERVICE"
  echo "• ключа в боте не было — создал и перезапустил $BOT_SERVICE"
  sleep 10
fi

# Values contain only URL/hex-safe chars; quote for SQL anyway.
sqlq() { printf "%s" "$1" | sed "s/'/''/g"; }
cd "$DEPLOY"
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
  psql -U persona -d persona_studio -q -v ON_ERROR_STOP=1 -c "
insert into \"AppSetting\" (key, value, \"updatedAt\") values
  ('KADRIK_API_URL', '$(sqlq "$KADRIK_URL")', now()),
  ('KADRIK_API_KEY', '$(sqlq "$key")', now())
on conflict (key) do update set value = excluded.value, \"updatedAt\" = now();"
echo "✓ ключи Кадрика сохранены в «Интеграции»"

code="$(curl -s -o /dev/null -w '%{http_code}' -m 20 -X POST "$KADRIK_URL/api/ext/jobs" \
  -H "Authorization: Bearer $key" -H 'content-type: application/json' -d '{}')"
case "$code" in
  401|403) echo "✗ бот не принял ключ ($code) — проверьте, что $BOT_SERVICE перезапущен с этим .env"; exit 1 ;;
  000)     echo "✗ $KADRIK_URL не отвечает — systemctl status $BOT_SERVICE"; exit 1 ;;
  *)       echo "✓ бот принимает ключ (ответ $code на пустой заказ — это нормально)" ;;
esac
echo "Готово: шаг «Монтаж» в ветках Reels работает через Студию Кадрика."
