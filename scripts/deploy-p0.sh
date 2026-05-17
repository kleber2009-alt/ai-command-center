#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# scripts/deploy-p0.sh
# ───────────────────────────────────────────────────────────────────────
# Single-command end-to-end deploy: с пустого Hetzner-аккаунта до
# работающего стека с перенесёнными данными.
#
# Что делает:
#   1. provision-hetzner.sh  → создаёт CPX21 + firewall, печатает IP
#   2. ждёт пока ssh поднимется
#   3. bootstrap-vps.sh root@IP → apt + docker + clone + docker compose up
#   4. (опционально) migrate-data.sh на сервере для переноса из Supabase
#
# Требует на твоей машине: bash, curl, jq, ssh, scp, ssh-ключ
# (~/.ssh/id_ed25519).
#
# Перед запуском убедись что в текущем каталоге есть `.env` с твоими
# боевыми ключами (он будет скопирован на сервер). Если .env нет —
# скрипт остановится после bootstrap и попросит зайти на сервер вручную.
#
# Использование:
#   export HCLOUD_TOKEN=hcloud_r_w_...
#   cp .env.example .env && nano .env   # вписать ключи
#   ./scripts/deploy-p0.sh
#
# Опции через env:
#   SKIP_MIGRATE=1  — не запускать migrate-data.sh после деплоя
#   TYPE=cx22       — взять более дешёвый сервер (4 GB / 2 vCPU за €4/мес)
# ═══════════════════════════════════════════════════════════════════════

set -euo pipefail

cd "$(dirname "$0")/.."

: "${HCLOUD_TOKEN:?ERROR: export HCLOUD_TOKEN=...}"

if [ ! -f .env ]; then
  echo "ERROR: .env не найден. cp .env.example .env, заполни и попробуй снова."
  echo "       Без .env стек поднимется, но без API-ключей."
  echo "       Если хочешь продолжить без .env — нажми enter (rabbit hole)."
  read -r
fi

echo "══════════════════════════════════════════════"
echo " 1/3  Создаю сервер в Hetzner"
echo "══════════════════════════════════════════════"
./scripts/provision-hetzner.sh

# provision-hetzner.sh печатает IP — вытащим его из ответа API ещё раз.
NAME="${NAME:-ai-stack}"
API="https://api.hetzner.cloud/v1"
IPV4=$(curl -fsS -H "Authorization: Bearer $HCLOUD_TOKEN" "$API/servers?name=$NAME" \
       | jq -r '.servers[0].public_net.ipv4.ip')
[ -n "$IPV4" ] && [ "$IPV4" != "null" ] || { echo "Не смог получить IP"; exit 1; }

echo ""
echo "══════════════════════════════════════════════"
echo " 2/3  Bootstrap сервера $IPV4"
echo "══════════════════════════════════════════════"

# Ждём пока ssh ответит.
for i in $(seq 1 40); do
  if ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 -q \
         root@"$IPV4" 'echo ok' >/dev/null 2>&1; then
    echo "→ SSH ready"
    break
  fi
  sleep 3
done

./scripts/bootstrap-vps.sh root@"$IPV4"

if [ "${SKIP_MIGRATE:-0}" = "1" ]; then
  echo "(SKIP_MIGRATE=1 — пропускаю миграцию данных)"
  exit 0
fi

echo ""
echo "══════════════════════════════════════════════"
echo " 3/3  Миграция данных из Supabase"
echo "══════════════════════════════════════════════"
echo ""
echo "Сейчас тебе понадобятся:"
echo "  · Supabase DB URL — Project Settings → Database → Connection string → URI"
echo "  · Supabase Project URL — Project Settings → API → Project URL"
echo "  · service_role key    — Project Settings → API → service_role secret"
echo ""
echo "Если данных в Supabase нет / не нужны — ответь Ctrl+C тут, всё уже работает."
echo ""
read -r -p "Готов? [enter]"

ssh -t root@"$IPV4" 'cd /opt/ai-stack && sudo -u ai bash ./scripts/migrate-data.sh'

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "✓ Всё. Открой http://$IPV4/ в браузере."
echo "═══════════════════════════════════════════════════════════════════"
