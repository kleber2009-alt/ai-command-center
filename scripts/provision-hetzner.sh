#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# scripts/provision-hetzner.sh
# ───────────────────────────────────────────────────────────────────────
# Один скрипт: создать сервер CPX21 в Hetzner Cloud, прикрепить firewall
# на 22/80/443, дождаться загрузки и распечатать IP. Дальше bootstrap-vps.sh
# донастроит ОС, склонирует репо и поднимет docker compose.
#
# Использование:
#   export HCLOUD_TOKEN=...    # Hetzner Cloud → Security → API Tokens (R/W)
#   ./scripts/provision-hetzner.sh [ssh_pub_key_path]
#
# По умолчанию берётся ~/.ssh/id_ed25519.pub.
#
# Что создаёт (всё идемпотентно по имени `ai-stack`):
#   - SSH key   `ai-stack-deploy`
#   - Firewall  `ai-stack-fw`  (in: 22, 80, 443; out: all)
#   - Server    `ai-stack`     (CPX21, Ubuntu 22.04, location nbg1)
#
# Стоимость: ~€8/мес (CPX21 cloud) + €0.5/мес за публичный IPv4.
# Если хочешь дешевле — поменяй TYPE на cx22 (€4/мес, 2 vCPU / 4 GB).
# ═══════════════════════════════════════════════════════════════════════

set -euo pipefail

: "${HCLOUD_TOKEN:?ERROR: export HCLOUD_TOKEN=<r/w token из Hetzner Cloud Console>}"

SSH_PUB_KEY="${1:-$HOME/.ssh/id_ed25519.pub}"
if [ ! -f "$SSH_PUB_KEY" ]; then
  echo "ERROR: $SSH_PUB_KEY не найден"
  echo "Создай ключ: ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519"
  exit 1
fi

NAME="${NAME:-ai-stack}"
TYPE="${TYPE:-cpx21}"
IMAGE="${IMAGE:-ubuntu-22.04}"
LOCATION="${LOCATION:-nbg1}"   # nbg1 (Nuremberg), fsn1 (Falkenstein), hel1 (Helsinki)

API="https://api.hetzner.cloud/v1"
# -fsS делает curl тихим, но при HTTP>=400 он молча валится с exit 22.
# Заменяем на свою обёртку, чтобы видеть тело ошибки от API.
hc() {
  local method="${1:-GET}"; shift || true
  local path="$1"; shift || true
  local data="${1:-}"
  local args=(-sS -w '\n%{http_code}' -X "$method"
              -H "Authorization: Bearer $HCLOUD_TOKEN"
              -H "Content-Type: application/json")
  [ -n "$data" ] && args+=(-d "$data")
  local resp
  resp=$(curl "${args[@]}" "$API$path")
  local code="${resp##*$'\n'}"
  local body="${resp%$'\n'*}"
  if [ "$code" -ge 400 ]; then
    echo "ERROR: Hetzner API $method $path → HTTP $code" >&2
    echo "$body" | jq . >&2 2>/dev/null || echo "$body" >&2
    return 1
  fi
  echo "$body"
}

jq_or_die() {
  command -v jq >/dev/null || { echo "ERROR: нужен jq (apt install jq / brew install jq)"; exit 1; }
}
jq_or_die

# ── 1. SSH-ключ ─────────────────────────────────────────────────────────
echo "→ Регистрирую SSH-ключ '${NAME}-deploy'"
KEY_PUB=$(tr -d '\n' < "$SSH_PUB_KEY")
# Hetzner запрещает дубликаты public_key fingerprint в рамках аккаунта
# (409 conflict). Поэтому ищем сначала по точному совпадению содержимого
# (по всем страницам), потом по имени, и только если ничего нет — создаём.
SSH_KEY_ID=""
PAGE=1
while :; do
  RESP=$(hc GET "/ssh_keys?per_page=50&page=$PAGE")
  # совпадение по полному public_key (без trailing whitespace/comment)
  FOUND_BY_KEY=$(echo "$RESP" | jq -r --arg pk "$KEY_PUB" '
    .ssh_keys[]
    | select((.public_key | split(" ")[0:2] | join(" ")) == ($pk | split(" ")[0:2] | join(" ")))
    | "\(.id)\t\(.name)"' | head -n1)
  if [ -n "$FOUND_BY_KEY" ]; then
    SSH_KEY_ID="${FOUND_BY_KEY%%	*}"
    SSH_KEY_NAME="${FOUND_BY_KEY##*	}"
    echo "  уже есть с тем же fingerprint: id=$SSH_KEY_ID name='$SSH_KEY_NAME'"
    break
  fi
  # совпадение по имени (если кто-то поменял содержимое под именем)
  FOUND_BY_NAME=$(echo "$RESP" | jq -r ".ssh_keys[] | select(.name==\"${NAME}-deploy\") | .id" | head -n1)
  if [ -n "$FOUND_BY_NAME" ]; then
    SSH_KEY_ID="$FOUND_BY_NAME"
    echo "  есть запись с именем '${NAME}-deploy' id=$SSH_KEY_ID (содержимое разное — оставляю как есть)"
    break
  fi
  # пагинация
  HAS_NEXT=$(echo "$RESP" | jq -r '.meta.pagination.next_page // empty')
  [ -z "$HAS_NEXT" ] && break
  PAGE=$((PAGE+1))
done

if [ -z "$SSH_KEY_ID" ]; then
  CREATE=$(hc POST "/ssh_keys" "$(jq -n --arg n "${NAME}-deploy" --arg k "$KEY_PUB" '{name:$n, public_key:$k}')")
  SSH_KEY_ID=$(echo "$CREATE" | jq -r '.ssh_key.id')
  echo "  создан id=$SSH_KEY_ID"
fi

# ── 2. Firewall ─────────────────────────────────────────────────────────
echo "→ Firewall '${NAME}-fw' (22/80/443 inbound)"
FW_ID=$(hc GET "/firewalls?name=${NAME}-fw" | jq -r '.firewalls[0].id // empty')
FW_RULES=$(jq -n '{
  rules: [
    {direction:"in", protocol:"tcp", port:"22",  source_ips:["0.0.0.0/0","::/0"]},
    {direction:"in", protocol:"tcp", port:"80",  source_ips:["0.0.0.0/0","::/0"]},
    {direction:"in", protocol:"tcp", port:"443", source_ips:["0.0.0.0/0","::/0"]},
    {direction:"in", protocol:"icmp", source_ips:["0.0.0.0/0","::/0"]}
  ]
}')
if [ -z "$FW_ID" ]; then
  CREATE=$(hc POST "/firewalls" "$(jq -n --arg n "${NAME}-fw" --argjson r "$FW_RULES" '{name:$n} + $r')")
  FW_ID=$(echo "$CREATE" | jq -r '.firewall.id')
  echo "  создан id=$FW_ID"
else
  hc POST "/firewalls/$FW_ID/actions/set_rules" "$FW_RULES" >/dev/null
  echo "  существует id=$FW_ID, правила обновлены"
fi

# ── 3. Server ───────────────────────────────────────────────────────────
echo "→ Сервер '${NAME}' (${TYPE}, ${IMAGE}, ${LOCATION})"
SRV_ID=$(hc GET "/servers?name=${NAME}" | jq -r '.servers[0].id // empty')
if [ -z "$SRV_ID" ]; then
  SRV_BODY=$(jq -n \
    --arg n "$NAME" --arg t "$TYPE" --arg i "$IMAGE" --arg l "$LOCATION" \
    --argjson key  "$SSH_KEY_ID" \
    --argjson fwid "$FW_ID" \
    '{
      name: $n, server_type: $t, image: $i, location: $l,
      ssh_keys: [$key],
      firewalls: [{firewall: $fwid}],
      public_net: {enable_ipv4: true, enable_ipv6: true},
      start_after_create: true,
      user_data: "#cloud-config\npackage_upgrade: true\n"
    }')
  RESP=$(hc POST "/servers" "$SRV_BODY")
  SRV_ID=$(echo "$RESP" | jq -r '.server.id')
  echo "  создан id=$SRV_ID"
else
  echo "  существует id=$SRV_ID"
fi

# ── 4. Ждём статус running ─────────────────────────────────────────────
echo "→ Жду пока сервер поднимется"
for i in $(seq 1 60); do
  STATUS=$(hc GET "/servers/$SRV_ID" | jq -r '.server.status')
  if [ "$STATUS" = "running" ]; then break; fi
  printf "  status=%s\n" "$STATUS"
  sleep 3
done

SRV=$(hc GET "/servers/$SRV_ID")
IPV4=$(echo "$SRV" | jq -r '.server.public_net.ipv4.ip')
IPV6=$(echo "$SRV" | jq -r '.server.public_net.ipv6.ip')

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "✓ Сервер готов"
echo "  ID:    $SRV_ID"
echo "  IPv4:  $IPV4"
echo "  IPv6:  $IPV6"
echo ""
echo "  Проверь SSH (даёт ~30-60 сек cloud-init на доустановку apt):"
echo "    ssh -o StrictHostKeyChecking=accept-new root@$IPV4 'cloud-init status --wait'"
echo ""
echo "  Запускай вторую часть:"
echo "    ./scripts/bootstrap-vps.sh root@$IPV4"
echo "═══════════════════════════════════════════════════════════════════"
