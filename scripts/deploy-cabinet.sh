#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────────
# deploy-cabinet.sh — раскатывает кабинет парсера на прод.
#
# Запускать НА ПРОДЕ под sudo:
#   sudo bash /home/aisales/deploy-cabinet.sh
#
# Что делает:
#   1) Бэкап Caddyfile и .env (.bak.<timestamp>)
#   2) Копирует статику /home/aisales/viral-discover-landing/ → /var/www/
#   3) Добавляет блок parser.46-62-215-11.nip.io в Caddyfile (если нет)
#   4) Добавляет CABINET_LINK_SECRET / CABINET_SESSION_SECRET / CABINET_BASE_URL в .env
#   5) caddy validate && systemctl reload caddy
#   6) docker build worker (no-cache, no provenance) с новым тегом
#   7) Подменяет тег в override и пересоздаёт контейнер
#   8) Smoke-test /worker/health на :3000
# ────────────────────────────────────────────────────────────────────

set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Запусти под sudo: sudo bash $0" >&2
  exit 1
fi

TS=$(date +%Y%m%d_%H%M%S)
TAG="hotpatch-${TS}-cabinet"

CADDYFILE=/etc/caddy/Caddyfile
ENV_FILE=/root/ai-command-center/infra/.env
OVERRIDE=/root/ai-command-center/infra/docker-compose.override.yml
LANDING_SRC=/home/aisales/viral-discover-landing
LANDING_DST=/var/www/viral-discover-landing
WORKER_CTX=/home/aisales/infra-worker-viral-clone
INFRA_DIR=/root/ai-command-center/infra

echo "=== 1) backup ==="
cp "$CADDYFILE" "$CADDYFILE.bak.$TS"
cp "$ENV_FILE"  "$ENV_FILE.bak.$TS"
[[ -f "$OVERRIDE" ]] && cp "$OVERRIDE" "$OVERRIDE.bak.$TS" || true

echo "=== 2) static rsync ==="
mkdir -p "$LANDING_DST"
rsync -a --delete "$LANDING_SRC"/ "$LANDING_DST"/
chown -R caddy:caddy "$LANDING_DST" 2>/dev/null || chown -R www-data:www-data "$LANDING_DST" 2>/dev/null || true

echo "=== 3) caddy snippet ==="
if grep -q "parser.46-62-215-11.nip.io" "$CADDYFILE"; then
  echo "    Caddyfile уже содержит блок parser. — пропускаю."
else
  cat >> "$CADDYFILE" <<'CADDY'

# ============ Парсер · Лендинг + Кабинет ============
parser.46-62-215-11.nip.io {
	# Cabinet API / auth → worker on :3000 (strip /cabinet prefix)
	@cab_api path /cabinet/api/* /cabinet/auth/*
	handle @cab_api {
		uri replace /cabinet/ /worker/cabinet/
		reverse_proxy 127.0.0.1:3000
	}

	root * /var/www/viral-discover-landing
	file_server {
		index index.html
	}

	log {
		output file /var/log/caddy/parser.log
		format console
	}
	header {
		Strict-Transport-Security "max-age=63072000"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "strict-origin-when-cross-origin"
	}
}
CADDY
fi

echo "=== 4) env vars ==="
LINK_SECRET=076c1976ea24eabb6e35b7b60f459744ebe6a37e06aaf4b3fd338a96b8445ac4
SESSION_SECRET=16052c2d07033e753d178a3fa59587a0ee6b6e4d5b9949fc87ef980ecff0a35f
CABINET_URL=https://parser.46-62-215-11.nip.io

upsert_env() {
  local key=$1 val=$2
  if grep -qE "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}
upsert_env CABINET_LINK_SECRET    "$LINK_SECRET"
upsert_env CABINET_SESSION_SECRET "$SESSION_SECRET"
upsert_env CABINET_BASE_URL       "$CABINET_URL"

echo "=== 5) caddy validate + reload ==="
caddy validate --config "$CADDYFILE" --adapter caddyfile
systemctl reload caddy
echo "    Caddy reloaded."

echo "=== 6) worker build (no-cache, no provenance) ==="
docker build --no-cache --pull --provenance=false --sbom=false \
  -t "infra-aisales-worker:${TAG}" "$WORKER_CTX"

echo "=== 7) patch override + force-recreate ==="
if [[ -f "$OVERRIDE" ]] && grep -q "infra-aisales-worker:hotpatch-" "$OVERRIDE"; then
  sed -i "s|infra-aisales-worker:hotpatch-[A-Za-z0-9-]\+|infra-aisales-worker:${TAG}|g" "$OVERRIDE"
else
  echo "    WARN: не нашёл тег в $OVERRIDE — поправь руками потом."
fi

cd "$INFRA_DIR"
docker rm -f infra-aisales-worker-1 2>/dev/null || true
docker compose up -d aisales-worker

echo "=== 8) smoke test ==="
sleep 4
docker exec infra-aisales-worker-1 wget -qO- http://127.0.0.1:3000/worker/health || \
  curl -sf http://127.0.0.1:3000/worker/health || \
  echo "    !!! health-check не прошёл — смотри docker logs infra-aisales-worker-1"

echo ""
echo "=== DONE ==="
echo "Кабинет:  https://parser.46-62-215-11.nip.io/cabinet/"
echo "Лендинг:  https://parser.46-62-215-11.nip.io/"
echo "Вход через бота: /menu → 🖥 Открыть кабинет"
echo ""
echo "Откат:"
echo "  sudo cp ${CADDYFILE}.bak.${TS} ${CADDYFILE} && sudo systemctl reload caddy"
echo "  sudo cp ${ENV_FILE}.bak.${TS}  ${ENV_FILE}"
echo "  cd ${INFRA_DIR} && docker rm -f infra-aisales-worker-1 && docker compose up -d aisales-worker"
